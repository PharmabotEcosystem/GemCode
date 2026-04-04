package com.example.agent.orchestrator

import android.content.Context
import android.util.Log
import com.example.agent.core.AgentLoop
import com.example.agent.core.LoopPhase
import com.example.agent.core.MediaPipeLlmInference
import com.example.agent.di.MutableLlmInferenceWrapper
import com.example.agent.mvi.AgentIntent
import com.example.agent.mvi.AgentState
import com.example.agent.mvi.isReadyForInput
import com.example.agent.service.ResourceManager
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * # AgentOrchestrator — State Machine MVI del ciclo di vita dell'agente.
 *
 * Unica fonte di verità per lo stato dell'agente. Riceve [AgentIntent] via [dispatch],
 * aggiorna il [StateFlow] di [AgentState] e coordina l'[AgentLoop] per l'inferenza.
 *
 * ## Architettura interna
 *
 * Gli intent vengono serializzati tramite un [Channel] interno (`intentChannel`).
 * Un unico loop di elaborazione (`processIntents`) consuma il canale sequenzialmente,
 * eliminando race condition sullo stato senza bisogno di `synchronized {}` o `Mutex`.
 *
 * ```
 * dispatch(intent)                        processIntents loop
 *      │                                         │
 *      └──► intentChannel.send(intent) ──────────┤
 *                                        handleIntent(state, intent)
 *                                                │
 *                                        ┌── Sync transition ──► _state.value = newState
 *                                        └── Async work (launch) ─► coroutine aggiorna _state
 * ```
 *
 * ## Invarianti garantiti
 * 1. `_state` è aggiornato SOLO da `transition()`, mai direttamente.
 * 2. Un solo Job di inferenza (`currentInferenceJob`) può essere attivo alla volta.
 *    Un nuovo `UserPrompt` mentre un altro è in corso viene ignorato (logged).
 * 3. La cancellazione di `currentInferenceJob` porta sempre allo stato `Idle`.
 * 4. `CriticalError` è l'unico stato da cui l'agente non esce autonomamente.
 *
 * ## Thread safety
 * - `_state` è `MutableStateFlow` → write thread-safe, read concurrently safe.
 * - `currentInferenceJob` è accessibile solo dal loop di elaborazione (thread singolo).
 * - `lastUserPrompt` è `@Volatile` per permettere lettura sicura da observer esterni.
 *
 * @param agentLoop       Core del ciclo ReAct — iniettato come Singleton.
 * @param llmWrapper      Wrapper swappabile del motore LLM — gestisce l'init del modello.
 * @param resourceManager Gestore delle soglie RAM — controlla prima di ogni inferenza.
 * @param context         ApplicationContext — usato per costruire `MediaPipeLlmInference`.
 */
@Singleton
class AgentOrchestrator @Inject constructor(
    private val agentLoop: AgentLoop,
    private val llmWrapper: MutableLlmInferenceWrapper,
    private val resourceManager: ResourceManager,
    @ApplicationContext private val context: Context
) {
    companion object {
        private const val TAG = "AgentOrchestrator"
        private const val INTENT_CHANNEL_CAPACITY = 32
    }

    // ─────────────────────────────────────────────────────────────────────────
    // State — unica fonte di verità osservabile
    // ─────────────────────────────────────────────────────────────────────────

    private val _state = MutableStateFlow<AgentState>(AgentState.Uninitialized)

    /**
     * Stream di stato osservabile da UI, Service e log.
     * Garantisce replay dell'ultimo valore ai nuovi collector (semantica StateFlow).
     */
    val state: StateFlow<AgentState> = _state.asStateFlow()

    /**
     * Stream delle risposte finali dell'agente (una per prompt completato).
     * La UI usa questo per appendere i messaggi alla chat history.
     * `replay = 0` → no history, solo i messaggi futuri dopo la subscription.
     */
    private val _responses = MutableSharedFlow<String>(replay = 0, extraBufferCapacity = 8)
    val responses: SharedFlow<String> = _responses.asSharedFlow()

    // ─────────────────────────────────────────────────────────────────────────
    // Internal state
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Scope con [SupervisorJob]: un Job figlio fallito (es. inferenza) non cancella
     * il loop di elaborazione degli intent.
     */
    private val orchestratorScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    /**
     * Canale FIFO per gli intent. [Channel.BUFFERED] con capacità fissa evita
     * che `dispatch()` sospenda mai il chiamante (best-effort delivery).
     * Se il canale è pieno (>32 intent in backlog), `trySend` scarta silenziosamente
     * gli intent in eccesso — situazione che non dovrebbe mai verificarsi in uso normale.
     */
    private val intentChannel = Channel<AgentIntent>(INTENT_CHANNEL_CAPACITY)

    /** Job corrente di inferenza — `null` se l'agente è Idle. */
    private var currentInferenceJob: Job? = null

    @Volatile
    private var lastUserPrompt: String? = null

    // ─────────────────────────────────────────────────────────────────────────
    // Init — avvia il loop di processing
    // ─────────────────────────────────────────────────────────────────────────

    init {
        orchestratorScope.launch {
            for (intent in intentChannel) {
                handleIntent(intent)
            }
        }
        Log.d(TAG, "AgentOrchestrator initialized. Waiting for intents.")
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Dispatcha un [AgentIntent] verso il loop di elaborazione.
     *
     * Thread-safe e non sospensiva: può essere chiamata dal Main Thread, da una
     * coroutine IO o da un BroadcastReceiver senza rischio di blocco.
     *
     * Se il canale è saturo (improbabile), l'intent viene scartato con un warning.
     */
    fun dispatch(intent: AgentIntent) {
        val result = intentChannel.trySend(intent)
        if (result.isFailure) {
            Log.w(TAG, "Intent channel full — dropped: $intent")
        }
    }

    /**
     * Cleanup: cancella lo scope al momento del destroy dell'Application.
     * Chiamato automaticamente quando Hilt distrugge il SingletonComponent.
     *
     * NOTA: in pratica, per un'app Android il processo viene killato prima
     * del destroy dell'Application. Questo è qui per correttezza e testabilità.
     */
    fun destroy() {
        orchestratorScope.cancel("AgentOrchestrator destroyed")
        intentChannel.close()
        Log.d(TAG, "Orchestrator destroyed — scope cancelled.")
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Intent handler (eseguito sequenzialmente nel loop)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Punto centrale del riduttore di stato.
     * Riceve l'intent corrente e lo stato attuale e decide la transizione.
     *
     * Eseguito sempre sullo stesso thread del loop (Dispatchers.Default, singolo worker
     * perché è un `for {}` su un Channel), quindi nessuna race condition su
     * `currentInferenceJob` o `lastUserPrompt`.
     */
    private suspend fun handleIntent(intent: AgentIntent) {
        val currentState = _state.value
        Log.d(TAG, "Intent: ${intent::class.simpleName} | State: ${currentState::class.simpleName}")

        when (intent) {

            // ── InitializeModel ──────────────────────────────────────────────
            is AgentIntent.InitializeModel -> {
                if (currentState.isBusy) {
                    Log.w(TAG, "Model init requested during busy state — queued after current work.")
                }
                transition(AgentState.LoadingWeights(intent.modelPath))
                loadModel(intent.modelPath)
            }

            // ── UserPrompt ───────────────────────────────────────────────────
            is AgentIntent.UserPrompt -> {
                when {
                    !llmWrapper.isInitialized -> {
                        val msg = "Il modello non è ancora caricato. Seleziona e scarica un modello prima."
                        transition(AgentState.CriticalError(
                            cause = IllegalStateException("Model not initialized"),
                            message = msg,
                            lastPrompt = intent.text
                        ))
                    }
                    currentState.isBusy -> {
                        Log.w(TAG, "UserPrompt '${intent.text.take(30)}...' ignored — agent is busy.")
                    }
                    else -> {
                        val memCheck = resourceManager.checkMemoryAvailable(context)
                        if (!memCheck.isAvailable) {
                            transition(AgentState.CriticalError(
                                cause = OutOfMemoryError("Insufficient RAM for inference"),
                                message = "RAM insufficiente: ${memCheck.availableMb}MB liberi. ${memCheck.suggestion}",
                                lastPrompt = intent.text
                            ))
                        } else {
                            if (memCheck.suggestion.isNotEmpty()) {
                                Log.w(TAG, "Memory warning: ${memCheck.suggestion}")
                            }
                            lastUserPrompt = intent.text
                            launchInference(intent.text)
                        }
                    }
                }
            }

            // ── SystemTrigger ────────────────────────────────────────────────
            is AgentIntent.SystemTrigger -> {
                val prompt = buildString {
                    append("[System Trigger from ${intent.source}]")
                    if (intent.payload.isNotBlank()) append("\nPayload: ${intent.payload}")
                }
                // Dispatch ricorsivo attraverso il canale per rispettare la serializzazione
                dispatch(AgentIntent.UserPrompt(prompt))
            }

            // ── CancelInference ──────────────────────────────────────────────
            is AgentIntent.CancelInference -> {
                if (currentInferenceJob?.isActive == true) {
                    currentInferenceJob!!.cancel("User requested cancellation")
                    Log.d(TAG, "Inference job cancelled by user.")
                    // Lo stato Idle viene settato nel finally del launchInference
                } else {
                    Log.d(TAG, "CancelInference received but no active inference job.")
                }
            }

            // ── RetryLastPrompt ──────────────────────────────────────────────
            is AgentIntent.RetryLastPrompt -> {
                val prompt = lastUserPrompt
                if (prompt != null && currentState is AgentState.CriticalError) {
                    Log.d(TAG, "Retrying last prompt: '${prompt.take(40)}'")
                    dispatch(AgentIntent.UserPrompt(prompt))
                } else {
                    Log.w(TAG, "RetryLastPrompt ignored: no last prompt or not in CriticalError state.")
                }
            }

            // ── MemoryWarning ────────────────────────────────────────────────
            is AgentIntent.MemoryWarning -> {
                Log.w(TAG, "MemoryWarning: ${intent.availableMb}MB available.")
                // Se idle, nessuna azione necessaria.
                // Se in inferenza, il ResourceManager verrà consultato alla prossima iterazione.
                // In futuro: triggera il pruning aggressivo o notifica la UI.
                if (intent.availableMb < ResourceManager.MIN_FREE_RAM_MB && currentState.isBusy) {
                    Log.e(TAG, "Critical RAM while busy — cancelling inference to prevent OOM.")
                    dispatch(AgentIntent.CancelInference)
                }
            }

            // ── ToolExecutionResult ──────────────────────────────────────────
            // Emesso internamente dall'AgentLoop via onPhaseChange callback.
            // Arriva qui solo per aggiornare lo stato visibile nella UI/notifica.
            is AgentIntent.ToolExecutionResult -> {
                // Transizione gestita dall'AgentLoop callback — nessuna azione aggiuntiva qui
                Log.d(TAG, "Tool '${intent.toolName}' observation: ${intent.observation.take(80)}")
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private: model loading
    // ─────────────────────────────────────────────────────────────────────────

    private suspend fun loadModel(modelPath: String) = withContext(Dispatchers.IO) {
        try {
            Log.d(TAG, "Loading model from: $modelPath")

            // Controlla RAM prima del mmap
            val memCheck = resourceManager.canLoadModel(context, modelPath)
            if (!memCheck.isAvailable) {
                transition(AgentState.CriticalError(
                    cause = OutOfMemoryError("Insufficient RAM for model"),
                    message = memCheck.suggestion
                ))
                return@withContext
            }

            // Crea il nuovo engine MediaPipe — mmap avviene internamente in LlmInference.create()
            val newEngine = MediaPipeLlmInference(context, modelPath)
            llmWrapper.initialize(newEngine)

            Log.d(TAG, "Model loaded successfully.")
            transition(AgentState.Idle)

        } catch (e: Exception) {
            Log.e(TAG, "Model loading failed: ${e.message}", e)
            transition(AgentState.CriticalError(
                cause = e,
                message = "Caricamento modello fallito: ${e.message}"
            ))
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private: inference launch
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Lancia il ciclo ReAct in un [Job] separato con [SupervisorJob] come padre.
     * Il Job è cancellabile autonomamente (via [AgentIntent.CancelInference])
     * senza cancellare il loop di elaborazione degli intent.
     */
    private fun launchInference(prompt: String) {
        currentInferenceJob = orchestratorScope.launch(Dispatchers.IO) {
            transition(AgentState.Reasoning(currentPrompt = prompt, iteration = 0))
            try {
                val response = agentLoop.run(
                    userPrompt = prompt,
                    onPhaseChange = { phase ->
                        when (phase) {
                            is LoopPhase.Thinking -> transition(
                                AgentState.Reasoning(
                                    currentPrompt = prompt,
                                    iteration = phase.iteration
                                )
                            )
                            is LoopPhase.InvokingTool -> {
                                transition(
                                    AgentState.ExecutingTool(
                                        toolName = phase.toolName,
                                        parameters = phase.parameters,
                                        iteration = phase.iteration
                                    )
                                )
                                // Notifica anche via intent per observer esterni (logging, analytics)
                                dispatch(AgentIntent.ToolExecutionResult(
                                    toolName = phase.toolName,
                                    observation = "(in progress)"
                                ))
                            }
                        }
                    }
                )

                _responses.emit(response)
                transition(AgentState.Idle)

            } catch (e: CancellationException) {
                Log.d(TAG, "Inference coroutine cancelled — transitioning to Idle.")
                transition(AgentState.Idle)
                // Non rilanciare: è una cancellazione normale
            } catch (e: Exception) {
                Log.e(TAG, "Inference failed: ${e.message}", e)
                transition(AgentState.CriticalError(
                    cause = e,
                    message = "Errore durante l'inferenza: ${e.message ?: "Errore sconosciuto"}",
                    lastPrompt = prompt
                ))
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private: state transition
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Unico punto di aggiornamento dello stato. Logga ogni transizione per debugging.
     * `MutableStateFlow.value =` è thread-safe per scritture concorrenti.
     */
    private fun transition(newState: AgentState) {
        val old = _state.value
        if (old == newState) return // Evita emissioni ridondanti (StateFlow le filtra comunque)
        _state.value = newState
        Log.d(TAG, "State: ${old::class.simpleName} → ${newState::class.simpleName}")
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Extension su AgentState (uso interno)
    // ─────────────────────────────────────────────────────────────────────────

    private val AgentState.isBusy: Boolean
        get() = this is AgentState.Reasoning
                || this is AgentState.ExecutingTool
                || this is AgentState.LoadingWeights
}

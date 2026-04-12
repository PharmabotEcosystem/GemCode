package com.example.agent.orchestrator

import android.content.Context
import android.util.Log
import com.example.agent.core.AgentLoop
import com.example.agent.core.DeviceStatusProvider
import com.example.agent.core.LoopPhase
import com.example.agent.core.MediaPipeLlmInference
import com.example.agent.di.MutableLlmInferenceWrapper
import com.example.agent.mvi.AgentIntent
import com.example.agent.mvi.AgentState
import com.example.agent.mvi.isBusy
import com.example.agent.service.ResourceManager
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
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
 * aggiorna il [StateFlow] di [AgentState] e coordina [AgentLoop] per l'inferenza.
 *
 * ## Serializzazione via Channel
 * Tutti gli intent vengono processati sequenzialmente da un singolo loop su
 * `orchestratorScope`. Questo elimina ogni race condition su `currentInferenceJob`
 * e `pendingConfirmationDeferred` senza Mutex.
 *
 * ## Flusso di conferma sicurezza (SafetyGuard)
 * Quando [AgentLoop] rileva un'operazione pericolosa:
 * ```
 * AgentLoop.run()
 *   └─ onConfirmationRequired("reason") ← suspend, attende
 *       └─ AgentOrchestrator
 *           ├─ crea CompletableDeferred<Boolean>
 *           ├─ transition(AwaitingConfirmation)    ← UI mostra dialog
 *           └─ attende deferred.await()
 *               ├─ ConfirmAction → deferred.complete(true)  → loop riprende
 *               └─ DenyAction   → deferred.complete(false) → "cancelled"
 * ```
 *
 * ## Thread safety
 * - `_state`: MutableStateFlow — write-safe da qualsiasi thread.
 * - `currentInferenceJob`: acceduto solo dal loop di processing (thread singolo).
 * - `pendingConfirmationDeferred`: @Volatile — scritto dal loop, completato
 *   dal loop (via intentChannel). `await()` è chiamato dall'inference coroutine
 *   su Dispatchers.IO — il `complete()` può arrivare da qualsiasi thread:
 *   `CompletableDeferred` è coroutine-thread-safe per design.
 * - `lastUserPrompt`: @Volatile — scritto dal loop, letto da observer esterni.
 */
@Singleton
class AgentOrchestrator @Inject constructor(
    private val agentLoop: AgentLoop,
    private val llmWrapper: MutableLlmInferenceWrapper,
    private val resourceManager: ResourceManager,
    private val deviceStatusProvider: DeviceStatusProvider,
    @ApplicationContext private val context: Context
) {
    companion object {
        private const val TAG = "AgentOrchestrator"
        private const val INTENT_CHANNEL_CAPACITY = 32
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Reactive state
    // ─────────────────────────────────────────────────────────────────────────

    private val _state = MutableStateFlow<AgentState>(AgentState.Uninitialized)
    val state: StateFlow<AgentState> = _state.asStateFlow()

    private val _responses = MutableSharedFlow<String>(replay = 0, extraBufferCapacity = 8)
    val responses: SharedFlow<String> = _responses.asSharedFlow()

    // ─────────────────────────────────────────────────────────────────────────
    // Internal
    // ─────────────────────────────────────────────────────────────────────────

    private val orchestratorScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val intentChannel = Channel<AgentIntent>(INTENT_CHANNEL_CAPACITY)

    /** Job corrente di inferenza — null se Idle. */
    private var currentInferenceJob: Job? = null

    /**
     * Deferred usato per la conferma sicurezza.
     * `null` quando nessuna conferma è in attesa.
     * @Volatile: scritto e letto da coroutine su thread diversi.
     */
    @Volatile
    private var pendingConfirmationDeferred: CompletableDeferred<Boolean>? = null

    @Volatile
    private var lastUserPrompt: String? = null

    // ─────────────────────────────────────────────────────────────────────────
    // Init
    // ─────────────────────────────────────────────────────────────────────────

    init {
        orchestratorScope.launch {
            for (intent in intentChannel) {
                handleIntent(intent)
            }
        }
        Log.d(TAG, "AgentOrchestrator initialized.")
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────────────────────────

    fun dispatch(intent: AgentIntent) {
        val result = intentChannel.trySend(intent)
        if (result.isFailure) {
            Log.w(TAG, "Intent channel full — dropped: ${intent::class.simpleName}")
        }
    }

    fun destroy() {
        orchestratorScope.cancel("AgentOrchestrator destroyed")
        intentChannel.close()
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Intent handler (loop sequenziale — nessuna race condition)
    // ─────────────────────────────────────────────────────────────────────────

    private suspend fun handleIntent(intent: AgentIntent) {
        val current = _state.value
        Log.d(TAG, "Intent: ${intent::class.simpleName} | State: ${current::class.simpleName}")

        when (intent) {

            // ── InitializeModel ──────────────────────────────────────────────
            is AgentIntent.InitializeModel -> {
                transition(AgentState.LoadingWeights(intent.modelPath))
                loadModel(intent.modelPath, intent.useGpu)
            }

            // ── UserPrompt ───────────────────────────────────────────────────
            is AgentIntent.UserPrompt -> {
                when {
                    !llmWrapper.isInitialized -> {
                        transition(AgentState.CriticalError(
                            cause = IllegalStateException("Model not initialized"),
                            message = "Il modello non è caricato. Seleziona e scarica un modello prima.",
                            lastPrompt = intent.text
                        ))
                    }
                    current.isBusy -> {
                        Log.w(TAG, "UserPrompt ignored — agent busy in ${current::class.simpleName}")
                    }
                    else -> {
                        // ── Constitution Rule 4.1 & 4.3 — Battery/RAM guard ─
                        val deviceStatus = deviceStatusProvider.getStatus()

                        if (deviceStatus.isCriticalBattery) {
                            transition(AgentState.CriticalError(
                                cause = IllegalStateException("Battery critical"),
                                message = "Batteria critica (${deviceStatus.batteryLevelPercent}%). " +
                                        "Inferenza sospesa dalla Constitution (Rule 4.1). Metti in carica.",
                                lastPrompt = intent.text
                            ))
                            return
                        }

                        val memCheck = resourceManager.checkMemoryAvailable(context)
                        if (!memCheck.isAvailable) {
                            transition(AgentState.CriticalError(
                                cause = OutOfMemoryError("Insufficient RAM"),
                                message = "RAM insufficiente: ${memCheck.availableMb}MB. ${memCheck.suggestion}",
                                lastPrompt = intent.text
                            ))
                            return
                        }

                        if (memCheck.suggestion.isNotEmpty()) Log.w(TAG, memCheck.suggestion)

                        lastUserPrompt = intent.text
                        launchInference(intent.text, deviceStatus.isLowBattery)
                    }
                }
            }

            // ── SystemTrigger ────────────────────────────────────────────────
            is AgentIntent.SystemTrigger -> {
                val prompt = "[System: ${intent.source}]${
                    if (intent.payload.isNotBlank()) "\nPayload: ${intent.payload}" else ""
                }"
                dispatch(AgentIntent.UserPrompt(prompt))
            }

            // ── CancelInference ──────────────────────────────────────────────
            is AgentIntent.CancelInference -> {
                // Completa il deferred di conferma con false (come DenyAction)
                // per sbloccare l'inference coroutine se stava aspettando
                pendingConfirmationDeferred?.let {
                    it.complete(false)
                    pendingConfirmationDeferred = null
                }
                currentInferenceJob?.cancel("User cancelled")
                // Lo stato Idle è settato nel finally del launchInference
            }

            // ── ConfirmAction ────────────────────────────────────────────────
            is AgentIntent.ConfirmAction -> {
                val deferred = pendingConfirmationDeferred
                if (deferred != null && !deferred.isCompleted) {
                    deferred.complete(true)
                    pendingConfirmationDeferred = null
                    Log.d(TAG, "User CONFIRMED pending safety operation.")
                } else {
                    Log.w(TAG, "ConfirmAction received but no pending confirmation.")
                }
            }

            // ── DenyAction ───────────────────────────────────────────────────
            is AgentIntent.DenyAction -> {
                val deferred = pendingConfirmationDeferred
                if (deferred != null && !deferred.isCompleted) {
                    deferred.complete(false)
                    pendingConfirmationDeferred = null
                    Log.d(TAG, "User DENIED pending safety operation.")
                } else {
                    Log.w(TAG, "DenyAction received but no pending confirmation.")
                }
            }

            // ── RetryLastPrompt ──────────────────────────────────────────────
            is AgentIntent.RetryLastPrompt -> {
                val prompt = lastUserPrompt
                if (prompt != null && current is AgentState.CriticalError) {
                    dispatch(AgentIntent.UserPrompt(prompt))
                } else {
                    Log.w(TAG, "RetryLastPrompt: no prompt to retry or not in CriticalError.")
                }
            }

            // ── MemoryWarning ────────────────────────────────────────────────
            is AgentIntent.MemoryWarning -> {
                Log.w(TAG, "MemoryWarning: ${intent.availableMb}MB available.")
                if (intent.availableMb < ResourceManager.MIN_FREE_RAM_MB && current.isBusy) {
                    Log.e(TAG, "RAM critically low during inference — cancelling to prevent OOM.")
                    dispatch(AgentIntent.CancelInference)
                }
            }

            // ── ToolExecutionResult ──────────────────────────────────────────
            is AgentIntent.ToolExecutionResult -> {
                Log.d(TAG, "Tool '${intent.toolName}' result: ${intent.observation.take(80)}")
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Model loading
    // ─────────────────────────────────────────────────────────────────────────

    private suspend fun loadModel(modelPath: String, useGpu: Boolean) = withContext(Dispatchers.IO) {
        try {
            val memCheck = resourceManager.canLoadModel(context, modelPath)
            if (!memCheck.isAvailable) {
                transition(AgentState.CriticalError(
                    cause = OutOfMemoryError("Insufficient RAM for model"),
                    message = memCheck.suggestion
                ))
                return@withContext
            }

            val newEngine = when {
                modelPath.endsWith(".litertlm", ignoreCase = true) -> {
                    // Gemma 4 — LiteRT-LM
                    com.example.agent.core.LiteRtLmInference(context, modelPath, useGpu = useGpu)
                }
                else -> {
                    // Gemma 3/2B — MediaPipe Tasks
                    MediaPipeLlmInference(context, modelPath, useGpu = useGpu)
                }
            }

            llmWrapper.initialize(newEngine)
            Log.d(TAG, "Model loaded (${if (useGpu) "GPU" else "CPU"}): $modelPath")
            transition(AgentState.Idle)
        } catch (e: Exception) {
            Log.e(TAG, "Model load failed: ${e.message}", e)
            transition(AgentState.CriticalError(e, "Caricamento modello fallito: ${e.message}"))
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Inference launch
    // ─────────────────────────────────────────────────────────────────────────

    private fun launchInference(prompt: String, isLowBattery: Boolean) {
        // Constitution Rule 4.2: low battery → cap iterations implicitly via AgentLoop
        if (isLowBattery) {
            Log.w(TAG, "Low battery — inference will be limited to 2 ReAct iterations by Constitution Rule 4.2.")
        }

        currentInferenceJob = orchestratorScope.launch(Dispatchers.IO) {
            transition(AgentState.Reasoning(currentPrompt = prompt, iteration = 0))
            try {
                val response = agentLoop.run(
                    userPrompt = prompt,
                    onPhaseChange = { phase ->
                        when (phase) {
                            is LoopPhase.Thinking -> transition(
                                AgentState.Reasoning(prompt, phase.iteration)
                            )
                            is LoopPhase.InvokingTool -> transition(
                                AgentState.ExecutingTool(phase.toolName, phase.parameters, phase.iteration)
                            )
                        }
                    },
                    onConfirmationRequired = { reason ->
                        // Costruisce il ControllableDeferred e sospende fino alla risposta dell'utente
                        val deferred = CompletableDeferred<Boolean>()
                        pendingConfirmationDeferred = deferred

                        // Estrai toolName dall'ultimo stato ExecutingTool se disponibile
                        val toolName = (_state.value as? AgentState.ExecutingTool)?.toolName ?: "UnknownTool"
                        transition(AgentState.AwaitingConfirmation(
                            reason = reason,
                            operationSummary = reason,
                            toolName = toolName
                        ))

                        Log.d(TAG, "Waiting for user confirmation on '$toolName'...")
                        val confirmed = deferred.await()  // ← sospeso qui finché ConfirmAction/DenyAction
                        Log.d(TAG, "Confirmation result: $confirmed")

                        // Ripristina lo stato Reasoning se ancora in AwaitingConfirmation
                        if (_state.value is AgentState.AwaitingConfirmation) {
                            transition(AgentState.Reasoning(prompt, 0))
                        }
                        confirmed
                    }
                )

                _responses.emit(response)
                transition(AgentState.Idle)

            } catch (e: CancellationException) {
                Log.d(TAG, "Inference cancelled.")
                transition(AgentState.Idle)
            } catch (e: Exception) {
                Log.e(TAG, "Inference error: ${e.message}", e)
                transition(AgentState.CriticalError(
                    cause = e,
                    message = "Errore inferenza: ${e.message ?: "Errore sconosciuto"}",
                    lastPrompt = prompt
                ))
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // State transition
    // ─────────────────────────────────────────────────────────────────────────

    private fun transition(newState: AgentState) {
        val old = _state.value
        if (old == newState) return
        _state.value = newState
        Log.d(TAG, "▶ ${old::class.simpleName} → ${newState::class.simpleName}")
    }

    // NOTE: isBusy è definito come public extension in AgentState.kt (com.example.agent.mvi)
    // e importato esplicitamente sopra — non ridefinire qui per evitare divergenze.
}

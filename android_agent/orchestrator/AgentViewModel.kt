package com.example.agent.orchestrator

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.agent.mvi.AgentIntent
import com.example.agent.mvi.AgentState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * # AgentViewModel — bridge MVI tra [AgentOrchestrator] e la UI Compose.
 *
 * ## Responsabilità
 * - Espone `state: StateFlow<AgentState>` alla UI senza esporre il Singleton orchestratore.
 * - Converte le azioni UI in [AgentIntent] tramite metodi tipizzati (evita dispatch raw dalla UI).
 * - Colleziona le risposte dell'agente e le accumula in `conversationHistory`.
 * - Sopravvive ai configuration change (rotazione schermo, multi-window) grazie a `ViewModel`.
 *
 * ## Ciclo di vita vs Service
 * Il [AgentOrchestrator] è un `@Singleton` che vive per tutta l'app.
 * Il ViewModel vive per l'Activity/Fragment — quando l'Activity va in background,
 * il ViewModel viene tenuto in memoria ma l'UI smette di raccogliere il Flow.
 * Quando l'Activity torna in foreground, il collector riprende dall'ultimo stato emesso
 * (StateFlow garantisce il replay del valore corrente).
 *
 * ## Pattern Compose
 * ```kotlin
 * @Composable
 * fun AgentScreen(viewModel: AgentViewModel = hiltViewModel()) {
 *     val state by viewModel.state.collectAsStateWithLifecycle()
 *     val history by viewModel.conversationHistory.collectAsStateWithLifecycle()
 *     // ...
 *     Button(onClick = { viewModel.sendPrompt(userInput) }) { ... }
 * }
 * ```
 */
@HiltViewModel
class AgentViewModel @Inject constructor(
    private val orchestrator: AgentOrchestrator
) : ViewModel() {

    // ─────────────────────────────────────────────────────────────────────────
    // State exposure
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Stato corrente dell'agente. Usa `SharingStarted.WhileSubscribed(5_000)` per:
     * - Mantenere il Flow attivo per 5 secondi dopo l'ultima subscription (copre
     *   i configuration change — l'Activity si ricrea in ~100ms).
     * - Arrestare la collection quando nessun observer è attivo (risparmio CPU/batteria).
     */
    val state: StateFlow<AgentState> = orchestrator.state
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = AgentState.Uninitialized
        )

    /**
     * Cronologia delle conversazioni come lista di messaggi formattati.
     * Accumulata nel ViewModel — sopravvive ai configuration change ma NON
     * al kill del processo (che è gestito da Room via `LocalMemoryManager`).
     */
    private val _conversationHistory =
        kotlinx.coroutines.flow.MutableStateFlow<List<ChatEntry>>(emptyList())
    val conversationHistory: StateFlow<List<ChatEntry>> = _conversationHistory

    // ─────────────────────────────────────────────────────────────────────────
    // Init — raccoglie le risposte dall'orchestratore
    // ─────────────────────────────────────────────────────────────────────────

    init {
        viewModelScope.launch {
            orchestrator.responses.collect { response ->
                val lastUserEntry = _conversationHistory.value
                    .lastOrNull { it.role == ChatRole.User }
                val prompt = lastUserEntry?.content ?: ""
                appendMessage(ChatRole.Agent, response)
                _ = prompt // suppress unused warning — used for context
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Public actions — UI chiama questi metodi, NON dispatch() direttamente
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Invia un prompt testuale dell'utente.
     * Aggiunge subito il messaggio alla history UI (ottimistic update)
     * prima che l'agente risponda.
     */
    fun sendPrompt(text: String) {
        if (text.isBlank()) return
        appendMessage(ChatRole.User, text.trim())
        orchestrator.dispatch(AgentIntent.UserPrompt(text.trim()))
    }

    /**
     * Richiede il caricamento del modello dal percorso specificato.
     * Trigger dalla [ModelSelectionCard] dopo il download.
     */
    fun initializeModel(modelPath: String) {
        orchestrator.dispatch(AgentIntent.InitializeModel(modelPath))
    }

    /**
     * Cancella l'inferenza corrente.
     * Il bottone "Stop" nella UI deve chiamare questo.
     */
    fun cancelInference() {
        orchestrator.dispatch(AgentIntent.CancelInference)
    }

    /**
     * Reinvia l'ultimo prompt (dopo un CriticalError).
     */
    fun retry() {
        orchestrator.dispatch(AgentIntent.RetryLastPrompt)
    }

    /**
     * Cancella la cronologia della conversazione in memoria (non rimuove il DB Room).
     */
    fun clearHistory() {
        _conversationHistory.value = emptyList()
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private helpers
    // ─────────────────────────────────────────────────────────────────────────

    private fun appendMessage(role: ChatRole, content: String) {
        _conversationHistory.value = _conversationHistory.value + ChatEntry(role, content)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Data models per la chat history (locali al ViewModel)
// ─────────────────────────────────────────────────────────────────────────────

enum class ChatRole { User, Agent, Observation, System }

data class ChatEntry(
    val role: ChatRole,
    val content: String,
    val timestamp: Long = System.currentTimeMillis()
)

// Workaround per suppress "unused" warning sul val ignorato nell'init block
private var _ : Any? = null

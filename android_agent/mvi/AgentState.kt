package com.example.agent.mvi

/**
 * # AgentState — stati osservabili del ciclo di vita dell'agente (MVI output side).
 *
 * Rappresenta l'unica fonte di verità per lo stato dell'agente. La UI,
 * il [com.example.agent.service.AgentForegroundService] e il logger osservano
 * questo flusso tramite `StateFlow.collectAsState()` o `collect {}`.
 *
 * ## Grafo delle transizioni valide
 * ```
 * Uninitialized ──InitializeModel──► LoadingWeights
 * LoadingWeights ──success──────────► Idle
 * LoadingWeights ──failure──────────► CriticalError
 *
 * Idle ──UserPrompt/SystemTrigger──► Reasoning
 * Idle ──MemoryWarning────────────► Idle          (nessuna transizione, solo log)
 * Idle ──InitializeModel──────────► LoadingWeights (swap modello a runtime)
 *
 * Reasoning ──tool call rilevato──► ExecutingTool
 * Reasoning ──risposta finale─────► Idle
 * Reasoning ──CancelInference─────► Idle
 * Reasoning ──exception──────────► CriticalError
 *
 * ExecutingTool ──risultato tool──► Reasoning     (iterazione successiva)
 * ExecutingTool ──CancelInference─► Idle
 *
 * CriticalError ──RetryLastPrompt─► Reasoning     (se il modello è caricato)
 * CriticalError ──InitializeModel─► LoadingWeights
 * ```
 *
 * **Invariante:** `CriticalError` è il solo stato "terminale" che richiede
 * azione esplicita dell'utente (o retry automatico) per uscirne.
 */
sealed interface AgentState {

    /**
     * Stato iniziale al lancio dell'app. Il motore di inferenza NON è ancora
     * caricato. Dispatch [com.example.agent.mvi.AgentIntent.InitializeModel]
     * per avanzare a [LoadingWeights].
     */
    data object Uninitialized : AgentState

    /**
     * Il file del modello è in fase di caricamento / mapping in memoria (mmap).
     *
     * @param modelPath  Percorso del file in caricamento (per il log e la UI).
     * @param progress   Progresso opzionale [0.0, 1.0]; `null` se indeterminato.
     */
    data class LoadingWeights(
        val modelPath: String,
        val progress: Float? = null
    ) : AgentState

    /**
     * Il modello è caricato e l'agente è in attesa di un prompt.
     * Unico stato in cui un nuovo [com.example.agent.mvi.AgentIntent.UserPrompt] è accettato.
     */
    data object Idle : AgentState

    /**
     * Il ciclo ReAct è in esecuzione: il modello sta generando il token successivo.
     *
     * @param currentPrompt  Prompt originale dell'utente (utile per la UI e il retry).
     * @param iteration      Numero di iterazioni ReAct completate (0-based).
     * @param partialOutput  Testo parziale emesso dal modello fin'ora (per streaming UI).
     */
    data class Reasoning(
        val currentPrompt: String,
        val iteration: Int,
        val partialOutput: String = ""
    ) : AgentState

    /**
     * Il ciclo ReAct ha rilevato una tool call e sta eseguendo il tool.
     *
     * @param toolName    Nome del tool in esecuzione.
     * @param parameters  JSON dei parametri passati al tool (per debug e logging).
     * @param iteration   Iterazione corrente del loop ReAct.
     */
    data class ExecutingTool(
        val toolName: String,
        val parameters: String,
        val iteration: Int
    ) : AgentState

    /**
     * Errore non recuperabile che ha interrotto il ciclo di inferenza.
     * L'agente rimane bloccato in questo stato finché l'utente non
     * dispatcha [com.example.agent.mvi.AgentIntent.RetryLastPrompt] o
     * [com.example.agent.mvi.AgentIntent.InitializeModel].
     *
     * @param cause    Throwable originale (per stack trace in logcat).
     * @param message  Messaggio human-readable da mostrare in UI.
     * @param lastPrompt Ultimo prompt che ha causato l'errore (per retry).
     */
    data class CriticalError(
        val cause: Throwable,
        val message: String,
        val lastPrompt: String? = null
    ) : AgentState
}

// ─────────────────────────────────────────────────────────────────────────────
// Extension utilities
// ─────────────────────────────────────────────────────────────────────────────

/** Stringa corta per notifiche e log, senza parametri verbosi. */
fun AgentState.toStatusLabel(): String = when (this) {
    is AgentState.Uninitialized -> "Non inizializzato"
    is AgentState.LoadingWeights -> "Caricamento modello…"
    is AgentState.Idle -> "Idle — pronto"
    is AgentState.Reasoning -> "Ragionamento… (iter ${iteration + 1})"
    is AgentState.ExecutingTool -> "Esecuzione: $toolName"
    is AgentState.CriticalError -> "Errore critico"
}

/** True quando è sicuro accettare nuovi prompt dall'utente. */
val AgentState.isReadyForInput: Boolean
    get() = this is AgentState.Idle

/** True quando l'agente è impegnato in lavoro asincrono non interrompibile immediatamente. */
val AgentState.isBusy: Boolean
    get() = this is AgentState.Reasoning || this is AgentState.ExecutingTool || this is AgentState.LoadingWeights

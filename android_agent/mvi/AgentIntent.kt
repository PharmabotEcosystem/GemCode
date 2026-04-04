package com.example.agent.mvi

/**
 * # AgentIntent — eventi in ingresso verso il riduttore di stato (MVI input side).
 *
 * Ogni intent rappresenta una singola intenzione atomica.
 * Il chiamante (UI, BroadcastReceiver, Tasker) NON conosce lo stato corrente —
 * è compito dell'[com.example.agent.orchestrator.AgentOrchestrator] decidere se
 * un intent è valido nella transizione corrente e reagire di conseguenza.
 *
 * ## Gerarchia
 * ```
 * AgentIntent
 *   ├── UserPrompt          — messaggio testuale dall'utente
 *   ├── SystemTrigger       — evento automatico (es. alarm, Tasker, Broadcast)
 *   ├── InitializeModel     — avvia il caricamento dei pesi del modello
 *   ├── ToolExecutionResult — risultato di un tool (riservato all'uso interno dell'Orchestrator)
 *   ├── MemoryWarning       — soglia RAM superata, riduci il carico
 *   ├── CancelInference     — interrompi il ciclo di inferenza corrente
 *   └── RetryLastPrompt     — reinvia l'ultimo prompt dopo un CriticalError
 * ```
 */
sealed interface AgentIntent {

    /**
     * Prompt testuale proveniente dall'utente tramite la UI o un intent esterno.
     * @param text  Testo grezzo del messaggio; l'Orchestrator lo sanitizza prima del dispatch.
     */
    data class UserPrompt(val text: String) : AgentIntent

    /**
     * Trigger proveniente da un sottosistema automatico (Tasker, Work Manager, Broadcast).
     * @param source  Identificatore della sorgente, per logging e prioritisation.
     * @param payload Payload opzionale (JSON o testo libero) da passare come contesto al prompt.
     */
    data class SystemTrigger(
        val source: String,
        val payload: String = ""
    ) : AgentIntent

    /**
     * Avvia (o riconfigura) il motore di inferenza locale.
     * Porta l'agente dallo stato [com.example.agent.mvi.AgentState.Uninitialized] o
     * [com.example.agent.mvi.AgentState.Idle] a [com.example.agent.mvi.AgentState.LoadingWeights].
     *
     * @param modelPath  Percorso assoluto del file `.bin` del modello su disco.
     *                   Deve puntare a un file mmap-able in `Context.filesDir`.
     */
    data class InitializeModel(val modelPath: String) : AgentIntent

    /**
     * Risultato dell'esecuzione di un tool, prodotto internamente dall'AgentLoop.
     * Non deve essere dispatchato manualmente dalla UI — è riservato all'orchestrazione interna
     * per aggiornare lo stato da [com.example.agent.mvi.AgentState.ExecutingTool]
     * di ritorno a [com.example.agent.mvi.AgentState.Reasoning].
     *
     * @param toolName    Nome del tool eseguito.
     * @param observation Stringa di output / errore restituita dal tool (l'"Observation" ReAct).
     * @param isError     True se il tool ha terminato con un'eccezione.
     */
    data class ToolExecutionResult(
        val toolName: String,
        val observation: String,
        val isError: Boolean = false
    ) : AgentIntent

    /**
     * Notifica che la RAM disponibile è scesa sotto la soglia critica di ResourceManager.
     * L'Orchestrator può scegliere di rifiutare nuovi prompt o attivare il pruning aggressivo.
     *
     * @param availableMb  RAM libera al momento del warning.
     */
    data class MemoryWarning(val availableMb: Long) : AgentIntent

    /**
     * Richiede la cancellazione del ciclo di inferenza in corso.
     * L'agente torna allo stato [com.example.agent.mvi.AgentState.Idle] appena il Job
     * corrente riceve la CancellationException.
     */
    data object CancelInference : AgentIntent

    /**
     * Reinvia l'ultimo prompt ricevuto dopo che l'agente si trova in
     * [com.example.agent.mvi.AgentState.CriticalError].
     * Utile per recovery automatici (es. dopo ricarica del modello).
     */
    data object RetryLastPrompt : AgentIntent
}

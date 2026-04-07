package com.example.agent.core

import android.util.Log
import com.example.agent.memory.LocalMemoryManager
import com.example.agent.tools.ToolRegistry
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

private const val TAG = "AgentLoop"

// ─────────────────────────────────────────────────────────────────────────────
// LoopPhase — eventi interni del ciclo ReAct, disaccoppiati dal layer MVI
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fase corrente del ciclo ReAct, emessa via callback `onPhaseChange`.
 * Permette all'[com.example.agent.orchestrator.AgentOrchestrator] di aggiornare
 * il suo [com.example.agent.mvi.AgentState] senza dipendere da questo package.
 */
sealed interface LoopPhase {
    /** Il modello sta generando la prossima risposta LLM. */
    data class Thinking(val iteration: Int) : LoopPhase

    /** Il modello ha emesso una tool call — esecuzione imminente. */
    data class InvokingTool(
        val toolName: String,
        val parameters: String,
        val iteration: Int
    ) : LoopPhase
}

// ─────────────────────────────────────────────────────────────────────────────
// AgentLoop
// ─────────────────────────────────────────────────────────────────────────────

/**
 * # AgentLoop — motore ReAct (Reasoning and Acting).
 *
 * ## Dipendenze iniettate da Hilt
 * - [LlmInferenceWrapper]: motore Gemma via MediaPipe (mmap'd, Singleton).
 * - [ToolRegistry]: catalogo tool con lookup O(1).
 * - [LocalMemoryManager]: RAG + conversazione persistente (Room).
 * - [ContextPruningManager]: pruning automatico della context window.
 * - [SystemPromptBuilder]: costruisce il prompt completo (Constitution + device status).
 * - [SafetyGuard]: intercetta tool call pericolose prima dell'esecuzione.
 *
 * ## Flusso per ogni iterazione ReAct
 * ```
 * 1. Pruning check (>75% context window → riassumi turni vecchi)
 * 2. onPhaseChange(Thinking)
 * 3. Battery/RAM guard — aborta se critico
 * 4. LLM inference → llmResponse
 * 5. extractToolCall(llmResponse)
 *    ├─ null → risposta finale, return
 *    └─ toolCall →
 *        6. SafetyGuard.evaluate()
 *           ├─ Blocked → observation = blockedReason, continua
 *           ├─ RequiresConfirmation → sospendi, chiedi conferma via onConfirmationRequired
 *           │   ├─ true (confermato) → esegui tool
 *           │   └─ false (negato)   → observation = "Operation cancelled by user."
 *           └─ Safe → esegui tool normalmente
 *        7. onPhaseChange(InvokingTool)
 *        8. tool.execute() → observation
 *        9. Aggiorna history, salva su Room, continua
 * ```
 *
 * @param llmInference        Engine LLM (Singleton, mmap-safe).
 * @param toolRegistry        Registry con tutti i tool disponibili.
 * @param memoryManager       Memoria a lungo termine e storico (Room).
 * @param pruner              Gestore pruning context window.
 * @param systemPromptBuilder Costruttore del prompt con Constitution integrata.
 * @param safetyGuard         Intercettore operazioni pericolose.
 */
class AgentLoop(
    private val llmInference: LlmInferenceWrapper,
    private val toolRegistry: ToolRegistry,
    private val memoryManager: LocalMemoryManager,
    private val pruner: ContextPruningManager = ContextPruningManager(),
    private val systemPromptBuilder: SystemPromptBuilder? = null,
    private val safetyGuard: SafetyGuard? = null
) {
    private val jsonParser = Json { ignoreUnknownKeys = true }

    /**
     * Esegue il ciclo ReAct per un dato prompt utente.
     *
     * @param userPrompt              Testo del prompt.
     * @param onPhaseChange           Callback per transizioni di stato intermedie.
     *                                `null` = nessuna notifica (test, sistemi automatici).
     * @param onConfirmationRequired  Callback invocata quando [SafetyGuard] richiede conferma.
     *                                Sospende fino alla risposta. Ritorna `true` = confermato,
     *                                `false` = negato. `null` = auto-conferma (non usare in
     *                                produzione con utente presente).
     */
    suspend fun run(
        userPrompt: String,
        onPhaseChange: (suspend (LoopPhase) -> Unit)? = null,
        onConfirmationRequired: (suspend (reason: String) -> Boolean)? = null
    ): String = withContext(Dispatchers.IO) {

        // 1. Recupera contesto RAG dalla memoria vettoriale
        val ragContext = memoryManager.searchRelevantContext(userPrompt)

        // 2. Recupera storico conversazione (Room)
        var currentHistory = memoryManager.getConversationState()?.trim() ?: ""

        // 3. Costruisce il system prompt (Constitution + device status + tool manifest + RAG)
        val systemPrompt = buildActiveSystemPrompt(ragContext)

        // 4. Aggiunge il messaggio utente alla cronologia
        currentHistory = if (currentHistory.isNotEmpty()) {
            "$currentHistory\nUser: $userPrompt\n"
        } else {
            "User: $userPrompt\n"
        }

        var iteration = 0
        val maxIterations = 5

        memoryManager.saveConversationState(currentHistory)

        while (iteration < maxIterations) {

            // ── Pruning check ──────────────────────────────────────────────
            val pruneDecision = pruner.evaluatePruneNeed(currentHistory, ragContext, systemPrompt)
            if (pruneDecision.shouldPrune) {
                Log.d(TAG, "Pruning history at iteration $iteration (${pruneDecision.estimatedTokens} tokens)")
                currentHistory = pruner.pruneHistory(currentHistory, llmInference)
                memoryManager.saveConversationState(currentHistory)
            }

            // ── Battery / RAM guard ────────────────────────────────────────
            val earlyExit = checkResourceGuards()
            if (earlyExit != null) {
                memoryManager.saveConversationState(currentHistory + "$earlyExit\n")
                return@withContext earlyExit
            }

            // ── Notifica: thinking ─────────────────────────────────────────
            onPhaseChange?.invoke(LoopPhase.Thinking(iteration))

            // ── LLM Inference ──────────────────────────────────────────────
            // NOTA mmap: MediaPipe chiama mmap() sul path del modello internamente.
            // NON caricare mai i pesi come ByteArray — vedi ResourceManager.
            val llmResponse = llmInference.generateResponse(systemPrompt + currentHistory)

            // ── Tool call parsing ──────────────────────────────────────────
            val toolCall = extractToolCall(llmResponse)

            if (toolCall != null) {
                // ── Safety check PRIMA dell'esecuzione ────────────────────
                val observation = when (val verdict = safetyGuard?.evaluate(toolCall.name, toolCall.params)) {
                    is SafetyVerdict.Blocked -> {
                        Log.w(TAG, "SafetyGuard BLOCKED: ${verdict.blockedReason}")
                        verdict.blockedReason
                    }
                    is SafetyVerdict.RequiresConfirmation -> {
                        Log.w(TAG, "SafetyGuard CONFIRMATION REQUIRED: ${verdict.reason}")
                        val confirmed = onConfirmationRequired?.invoke(verdict.reason) ?: true
                        if (confirmed) {
                            Log.d(TAG, "User CONFIRMED operation: ${verdict.operationSummary}")
                            onPhaseChange?.invoke(LoopPhase.InvokingTool(toolCall.name, toolCall.params.toString(), iteration))
                            executeTool(toolCall)
                        } else {
                            Log.d(TAG, "User DENIED operation: ${verdict.operationSummary}")
                            "Operation cancelled by user. The SafetyGuard flagged this as: ${verdict.reason}"
                        }
                    }
                    is SafetyVerdict.Safe, null -> {
                        onPhaseChange?.invoke(LoopPhase.InvokingTool(toolCall.name, toolCall.params.toString(), iteration))
                        executeTool(toolCall)
                    }
                }

                currentHistory += "Assistant: $llmResponse\nObservation: $observation\n"
                memoryManager.saveConversationState(currentHistory)

            } else {
                // Risposta finale — persisti e ritorna
                memoryManager.saveMemory("User: $userPrompt\nAgent: $llmResponse")
                currentHistory += "Assistant: $llmResponse\n"
                memoryManager.saveConversationState(currentHistory)
                return@withContext llmResponse
            }

            iteration++
        }

        val errorMsg = "Max iterations ($maxIterations) reached. Summarise what was completed and ask the user for guidance."
        memoryManager.saveConversationState(currentHistory + "System: $errorMsg\n")
        return@withContext errorMsg
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Restituisce il system prompt tramite [SystemPromptBuilder] se disponibile,
     * altrimenti usa la versione legacy (senza Constitution).
     *
     * Il [SystemPromptBuilder] viene fornito da Hilt in produzione. Il fallback
     * legacy permette istanziazione diretta in test senza il grafo DI.
     */
    fun buildActiveSystemPrompt(ragContext: String): String {
        return systemPromptBuilder?.build(ragContext)
            ?: buildLegacySystemPrompt(ragContext)
    }

    /**
     * Verifica le risorse critiche del dispositivo prima di ogni iterazione.
     * @return Messaggio di errore se le risorse sono critiche, `null` se è sicuro procedere.
     */
    private fun checkResourceGuards(): String? {
        // Il DeviceStatusProvider è disponibile solo se SystemPromptBuilder è iniettato.
        // Il fallback non ha accesso allo stato del dispositivo (test/legacy).
        return null // Guards are enforced at AgentOrchestrator level via ResourceManager
    }

    /**
     * Esegue il tool individuato nella tool call, gestendo eccezioni.
     */
    private suspend fun executeTool(toolCall: ToolCall): String {
        val tool = toolRegistry.findByName(toolCall.name)
        return if (tool != null) {
            try {
                tool.execute(toolCall.params)
            } catch (e: Exception) {
                Log.e(TAG, "Tool '${toolCall.name}' threw exception: ${e.message}", e)
                "Error executing tool '${toolCall.name}': ${e.message}"
            }
        } else {
            "Tool '${toolCall.name}' not found. Available: ${toolRegistry.getAll().joinToString(", ") { it.name }}"
        }
    }

    /**
     * System prompt legacy senza Constitution — usato quando [SystemPromptBuilder]
     * non è iniettato (test unitari, istanziazione diretta).
     */
    private fun buildLegacySystemPrompt(ragContext: String): String = """
        You are a helpful Android Autonomous Agent powered by Gemma.
        You have access to the following tools:
        ${toolRegistry.buildSystemPromptSection()}

        To use a tool, output:
        ```json
        { "tool": "ToolName", "parameters": { "key": "value" } }
        ```
        Wait for 'Observation:' before continuing. Output text for final answers.

        Relevant Context:
        $ragContext
    """.trimIndent()

    private fun extractToolCall(response: String): ToolCall? {
        val jsonRegex = "```json\\s*(\\{.*?\\})\\s*```".toRegex(RegexOption.DOT_MATCHES_ALL)
        val match = jsonRegex.find(response) ?: return null
        return try {
            val jsonElement = jsonParser.parseToJsonElement(match.groupValues[1]).jsonObject
            val toolName = jsonElement["tool"]?.jsonPrimitive?.content ?: return null
            val parameters = jsonElement["parameters"] ?: JsonObject(emptyMap())
            ToolCall(toolName, parameters)
        } catch (_: Exception) { null }
    }

    private data class ToolCall(
        val name: String,
        val params: kotlinx.serialization.json.JsonElement
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// LlmInferenceWrapper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Interfaccia unificata per motori di inferenza locali e remoti.
 * Implementazioni: [MediaPipeLlmInference], [GeminiApiLlmInference],
 * [com.example.agent.di.MutableLlmInferenceWrapper].
 */
interface LlmInferenceWrapper {
    suspend fun generateResponse(prompt: String): String
}

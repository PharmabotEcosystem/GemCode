package com.example.agent.core

import com.example.agent.tools.ToolRegistry
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

// ─────────────────────────────────────────────────────────────────────────────
// LoopPhase — eventi interni del ciclo ReAct, NON accoppiati al layer MVI
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fase corrente del ciclo ReAct. Emessa tramite callback `onPhaseChange`
 * in modo che l'[com.example.agent.orchestrator.AgentOrchestrator] possa
 * aggiornare il suo `StateFlow` senza che `AgentLoop` dipenda dal layer MVI.
 */
sealed interface LoopPhase {
    /** Il modello sta generando la prossima risposta. */
    data class Thinking(val iteration: Int) : LoopPhase

    /** Il modello ha richiesto l'esecuzione di un tool. */
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
 * Motore principale dell'agente basato sul pattern ReAct (Reasoning and Acting).
 *
 * ## Dipendenze
 * - [LlmInferenceWrapper]: motore di inferenza locale (Gemma via MediaPipe) o remoto.
 * - [ToolRegistry]: catalogo dei tool disponibili, iniettato tramite Hilt multibinding.
 * - [LocalMemoryManager]: memoria a lungo termine e stato conversazione (Room).
 * - [ContextPruningManager]: pruning automatico della context window.
 *
 * ## Context pruning
 * Prima di ogni chiamata LLM, si controlla se la somma di history + RAG + system prompt
 * supera il 75% della context window. Se sì, i turni vecchi vengono riassunti
 * ricorsivamente usando lo stesso modello — zero overhead di caricamento.
 *
 * ## onPhaseChange callback
 * Il parametro opzionale `onPhaseChange` permette all'orchestratore esterno di
 * osservare le fasi intermedie del loop (Thinking, InvokingTool) senza accoppiamento
 * diretto al layer MVI. La callback è `suspend` per permettere `StateFlow` update
 * senza bloccare il thread IO.
 *
 * @param llmInference  Engine LLM (Singleton iniettato da Hilt).
 * @param toolRegistry  Registry dei tool con lookup O(1) per nome.
 * @param memoryManager Memoria vettoriale e storico conversazione.
 * @param pruner        Gestore del pruning della context window.
 */
class AgentLoop(
    private val llmInference: LlmInferenceWrapper,
    private val toolRegistry: ToolRegistry,
    private val memoryManager: LocalMemoryManager,
    private val pruner: ContextPruningManager = ContextPruningManager()
) {
    private val jsonParser = Json { ignoreUnknownKeys = true }

    /**
     * Esegue il ciclo ReAct per un dato prompt dell'utente.
     *
     * @param userPrompt   Testo del prompt dell'utente.
     * @param onPhaseChange Callback `suspend` chiamata ad ogni cambio di fase interno
     *                      (Thinking → InvokingTool → Thinking → ...). Usata dall'
     *                      [com.example.agent.orchestrator.AgentOrchestrator] per
     *                      aggiornare il [com.example.agent.mvi.AgentState].
     *                      Passare `null` per disabilitare (utile nei test).
     * @return Risposta finale dell'agente come stringa.
     */
    suspend fun run(
        userPrompt: String,
        onPhaseChange: (suspend (LoopPhase) -> Unit)? = null
    ): String = withContext(Dispatchers.IO) {

        // 1. Recupera contesto rilevante dalla memoria (RAG)
        val ragContext = memoryManager.searchRelevantContext(userPrompt)

        // 2. Recupera lo stato della conversazione precedente
        var currentHistory = memoryManager.getConversationState()?.trim() ?: ""

        // 3. Costruisce il System Prompt con i Tool e il contesto RAG
        val systemPrompt = buildSystemPrompt(ragContext)

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

            // ── Context pruning check ──────────────────────────────────────
            // Valuta prima di ogni chiamata LLM per non superare mai la context window.
            val pruneDecision = pruner.evaluatePruneNeed(currentHistory, ragContext, systemPrompt)
            if (pruneDecision.shouldPrune) {
                currentHistory = pruner.pruneHistory(currentHistory, llmInference)
                memoryManager.saveConversationState(currentHistory)
            }
            // ──────────────────────────────────────────────────────────────

            // Notifica: il modello sta elaborando
            onPhaseChange?.invoke(LoopPhase.Thinking(iteration))

            // 5. Inferenza LLM
            // NOTA mmap: MediaPipe gestisce internamente mmap() sul path del modello.
            // Non caricare mai i pesi come ByteArray — vedere ResourceManager.
            val llmResponse = llmInference.generateResponse(systemPrompt + currentHistory)

            // 6. Parsing della risposta per intercettare tool call
            val toolCall = extractToolCall(llmResponse)

            if (toolCall != null) {
                // Notifica: il modello ha richiesto un tool
                onPhaseChange?.invoke(
                    LoopPhase.InvokingTool(
                        toolName = toolCall.name,
                        parameters = toolCall.params.toString(),
                        iteration = iteration
                    )
                )

                // Lookup O(1) nel registry invece di List.find() O(n)
                val tool = toolRegistry.findByName(toolCall.name)
                val observation = if (tool != null) {
                    try {
                        tool.execute(toolCall.params)
                    } catch (e: Exception) {
                        "Error executing tool '${toolCall.name}': ${e.message}"
                    }
                } else {
                    "Tool '${toolCall.name}' not found. Available tools: " +
                            toolRegistry.getAll().joinToString(", ") { it.name }
                }

                currentHistory += "Assistant: $llmResponse\nObservation: $observation\n"
                memoryManager.saveConversationState(currentHistory)

            } else {
                // Risposta finale — salva in memoria a lungo termine e termina
                memoryManager.saveMemory("User: $userPrompt\nAgent: $llmResponse")
                currentHistory += "Assistant: $llmResponse\n"
                memoryManager.saveConversationState(currentHistory)
                return@withContext llmResponse
            }

            iteration++
        }

        val errorMsg = "Error: Max iterations ($maxIterations) reached without a final answer."
        memoryManager.saveConversationState(currentHistory + "$errorMsg\n")
        return@withContext errorMsg
    }

    /**
     * Costruisce il system prompt completo con la descrizione di tutti i tool
     * disponibili nel [ToolRegistry] e il contesto RAG.
     *
     * Delega a [ToolRegistry.buildSystemPromptSection()] per la sezione tool,
     * così nuovi tool appaiono automaticamente nel prompt senza modificare questo metodo.
     */
    fun buildSystemPrompt(ragContext: String): String {
        return """
            You are a helpful Android Autonomous Agent powered by Gemma.
            You have access to the following tools:
            ${toolRegistry.buildSystemPromptSection()}

            To use a tool, you MUST output a JSON block like this:
            ```json
            {
              "tool": "ToolName",
              "parameters": { "key": "value" }
            }
            ```
            Wait for the 'Observation:' before continuing.
            If you have the final answer, just output the text.

            Relevant Context from past interactions:
            $ragContext

        """.trimIndent()
    }

    private fun extractToolCall(response: String): ToolCall? {
        val jsonRegex = "```json\\s*(\\{.*?\\})\\s*```".toRegex(RegexOption.DOT_MATCHES_ALL)
        val match = jsonRegex.find(response) ?: return null

        return try {
            val jsonElement = jsonParser.parseToJsonElement(match.groupValues[1]).jsonObject
            val toolName = jsonElement["tool"]?.jsonPrimitive?.content ?: return null
            val parameters = jsonElement["parameters"] ?: JsonObject(emptyMap())
            ToolCall(toolName, parameters)
        } catch (e: Exception) {
            null
        }
    }

    private data class ToolCall(
        val name: String,
        val params: kotlinx.serialization.json.JsonElement
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// LlmInferenceWrapper — interfaccia del motore di inferenza
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Interfaccia unificata per motori di inferenza locali (MediaPipe/LiteRT)
 * e remoti (Gemini API). Implementazioni:
 * - [MediaPipeLlmInference]: Gemma locale via mmap
 * - [com.example.agent.core.GeminiApiLlmInference]: Gemini 2.5-flash remoto
 * - [com.example.agent.di.MutableLlmInferenceWrapper]: wrapper swappabile (Hilt Singleton)
 */
interface LlmInferenceWrapper {
    /** Genera una risposta completa per il prompt dato. Sospende fino al completamento. */
    suspend fun generateResponse(prompt: String): String
}

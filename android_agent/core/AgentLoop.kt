package com.example.agent.core

import com.example.agent.tools.Tool
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Motore principale dell'agente basato sul pattern ReAct (Reasoning and Acting).
 *
 * ## Context pruning
 * Before each LLM call we check whether the accumulated prompt (system + history + RAG)
 * exceeds 75 % of the model's context window via [ContextPruningManager].
 * If so, old conversation turns are replaced with an LLM-generated summary so the
 * agent never silently loses early context due to MediaPipe truncation.
 *
 * @param pruner  Optional [ContextPruningManager]. Pass `null` to disable pruning
 *                (useful in tests or when the context window is known to be large enough).
 */
class AgentLoop(
    private val llmInference: LlmInferenceWrapper,
    private val tools: List<Tool>,
    private val memoryManager: LocalMemoryManager,
    private val pruner: ContextPruningManager = ContextPruningManager()
) {
    private val jsonParser = Json { ignoreUnknownKeys = true }

    /**
     * Esegue il loop ReAct per un dato prompt dell'utente.
     */
    suspend fun run(userPrompt: String): String = withContext(Dispatchers.IO) {
        // 1. Recupera contesto rilevante dalla memoria (RAG)
        val ragContext = memoryManager.searchRelevantContext(userPrompt)

        // 2. Recupera lo stato della conversazione precedente
        var currentHistory = memoryManager.getConversationState()?.trim() ?: ""

        // 3. Costruisce il System Prompt con i Tool e il contesto
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

            // ── Context pruning check ─────────────────────────────────────────
            // Evaluate before every LLM call so we never feed a truncated prompt.
            val pruneDecision = pruner.evaluatePruneNeed(currentHistory, ragContext, systemPrompt)
            if (pruneDecision.shouldPrune) {
                currentHistory = pruner.pruneHistory(currentHistory, llmInference)
                memoryManager.saveConversationState(currentHistory)
            }
            // ─────────────────────────────────────────────────────────────────

            // 5. Inferenza LLM
            // NOTA MEMORIA: MediaPipe gestisce mmap() internamente quando si passa
            // il path del file tramite setModelPath(). NON caricare i pesi come
            // ByteArray — vedere ResourceManager per i dettagli architetturali.
            val llmResponse = llmInference.generateResponse(systemPrompt + currentHistory)

            // 6. Parsing della risposta per intercettare chiamate ai Tool
            val toolCall = extractToolCall(llmResponse)

            if (toolCall != null) {
                val tool = tools.find { it.name == toolCall.name }
                val observation = if (tool != null) {
                    try {
                        tool.execute(toolCall.params)
                    } catch (e: Exception) {
                        "Error executing tool: ${e.message}"
                    }
                } else {
                    "Tool ${toolCall.name} not found."
                }

                currentHistory += "Assistant: $llmResponse\nObservation: $observation\n"
                memoryManager.saveConversationState(currentHistory)

            } else {
                // Risposta finale — salva in memoria a lungo termine e torna
                memoryManager.saveMemory("User: $userPrompt\nAgent: $llmResponse")
                currentHistory += "Assistant: $llmResponse\n"
                memoryManager.saveConversationState(currentHistory)
                return@withContext llmResponse
            }

            iteration++
        }

        memoryManager.saveConversationState(currentHistory + "Error: Max iterations reached.\n")
        return@withContext "Error: Max iterations reached."
    }

    private fun buildSystemPrompt(context: String): String {
        val toolsDescription = tools.joinToString("\n") {
            "- ${it.name}: ${it.description}\n  Schema: ${it.parametersSchema}"
        }

        return """
            You are a helpful Android Autonomous Agent powered by Gemma.
            You have access to the following tools:
            $toolsDescription

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
            $context

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

    data class ToolCall(val name: String, val params: kotlinx.serialization.json.JsonElement)
}

// Wrapper fittizio per MediaPipe
interface LlmInferenceWrapper {
    suspend fun generateResponse(prompt: String): String
}

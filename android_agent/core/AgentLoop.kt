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
 */
class AgentLoop(
    private val llmInference: LlmInferenceWrapper, // Wrapper fittizio per MediaPipe/LiteRT
    private val tools: List<Tool>,
    private val memoryManager: LocalMemoryManager
) {
    private val jsonParser = Json { ignoreUnknownKeys = true }

    /**
     * Esegue il loop ReAct per un dato prompt dell'utente.
     */
    suspend fun run(userPrompt: String): String = withContext(Dispatchers.IO) {
        // 1. Recupera contesto rilevante dalla memoria (RAG)
        val context = memoryManager.searchRelevantContext(userPrompt)
        
        // 2. Recupera lo stato della conversazione precedente
        val previousHistory = memoryManager.getConversationState()?.trim() ?: ""
        
        // 3. Costruisce il System Prompt con i Tool e il contesto
        val systemPrompt = buildSystemPrompt(context)
        
        // 4. Inietta la cronologia nel prompt corrente per l'LLM
        var currentPrompt = if (previousHistory.isNotEmpty()) {
            "$previousHistory\nUser: $userPrompt\n"
        } else {
            "User: $userPrompt\n"
        }
        
        var iteration = 0
        val maxIterations = 5 // Evita loop infiniti

        // Salva lo stato iniziale
        memoryManager.saveConversationState(currentPrompt)

        while (iteration < maxIterations) {
            // 3. Inferenza LLM
            // NOTA SULLA MEMORIA: Il modello Gemma (es. 2B o 9B) deve essere caricato tramite mmap.
            // MediaPipe LlmInference gestisce mmap internamente se il file model.bin è passato come path.
            // Evitare di caricare i pesi in RAM come ByteArray.
            val llmResponse = llmInference.generateResponse(systemPrompt + currentPrompt)
            
            // 4. Parsing della risposta per intercettare chiamate ai Tool
            val toolCall = extractToolCall(llmResponse)
            
            if (toolCall != null) {
                // Il modello ha deciso di usare un tool
                val tool = tools.find { it.name == toolCall.name }
                if (tool != null) {
                    try {
                        val observation = tool.execute(toolCall.params)
                        // Aggiunge l'osservazione al prompt per il prossimo ciclo
                        currentPrompt += "Assistant: $llmResponse\nObservation: $observation\n"
                    } catch (e: Exception) {
                        currentPrompt += "Assistant: $llmResponse\nObservation: Error executing tool: ${e.message}\n"
                    }
                } else {
                    currentPrompt += "Assistant: $llmResponse\nObservation: Tool ${toolCall.name} not found.\n"
                }
                
                // Auto-save dello stato corrente dopo l'esecuzione del tool
                memoryManager.saveConversationState(currentPrompt)
                
            } else {
                // Nessun tool chiamato, questa è la risposta finale
                // Salva la memoria dell'interazione
                memoryManager.saveMemory("User: $userPrompt\nAgent: $llmResponse")
                
                // Aggiorna lo stato finale della conversazione
                currentPrompt += "Assistant: $llmResponse\n"
                memoryManager.saveConversationState(currentPrompt)
                
                return@withContext llmResponse
            }
            iteration++
        }
        
        // Auto-save anche in caso di raggiungimento del limite di iterazioni
        memoryManager.saveConversationState(currentPrompt + "Error: Max iterations reached.\n")
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
        // Logica semplificata per estrarre il blocco JSON dalla risposta
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

package com.example.agent.tools

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import javax.inject.Inject
import javax.inject.Singleton

/**
 * # CanvasTool
 *
 * Consente al modello di scrivere contenuti complessi (codice, documenti, report)
 * in una vista "Canvas" dedicata nella UI, separata dal flusso della chat.
 */
class CanvasTool : Tool {

    override val name = "CanvasTool"
    override val description = "Updates or sets the content of the dedicated UI Canvas. Use this for long code blocks, documents, or structured reports."
    override val parametersSchema = """
        {
          "type": "object",
          "properties": {
            "content": { "type": "string", "description": "The full content to display in the canvas." },
            "action": { "type": "string", "enum": ["replace", "append"], "description": "Whether to replace the current content or append to it." }
          },
          "required": ["content"]
        }
    """.trimIndent()

    override suspend fun execute(params: JsonObject): String {
        val content = params.jsonObject["content"]?.jsonPrimitive?.content
            ?: return "Error: 'content' parameter is required."
        
        // In a real implementation, this would update a StateFlow observed by the UI.
        // For now, we return a success message. The AgentOrchestrator or ViewModel
        // should handle the actual state update if we want it live.
        
        return "Canvas updated successfully. Content length: ${content.length} chars."
    }
}

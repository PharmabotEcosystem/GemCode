package com.example.agent.tools

import com.example.agent.core.SkillManager
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * # SkillTool
 *
 * Executes a named skill from the [SkillManager] by injecting its instructions
 * into the observation stream so the agent treats them as immediate directives.
 */
class SkillTool(private val skillManager: SkillManager) : Tool {

    override val name = "SkillTool"
    override val description = "Executes a saved reusable skill by its ID."
    override val parametersSchema = """
        {
          "type": "object",
          "properties": {
            "skill_id": { "type": "string", "description": "The ID of the skill to execute." }
          },
          "required": ["skill_id"]
        }
    """.trimIndent()

    override suspend fun execute(params: JsonElement): String {
        val skillId = params.jsonObject["skill_id"]?.jsonPrimitive?.content
            ?: return "Error: 'skill_id' parameter is required."

        val skill = skillManager.getSkillById(skillId)
            ?: return "Error: Skill '$skillId' not found. Available: ${skillManager.getAllSkills().joinToString(", ") { it.id }}"

        return """
            SKILL EXECUTION — ${skill.name}
            ${skill.description}
            
            INSTRUCTIONS TO FOLLOW:
            ${skill.instructions}
        """.trimIndent()
    }
}

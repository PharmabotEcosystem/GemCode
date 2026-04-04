package com.example.agent.tools

import com.example.agent.core.SkillManager
import kotlinx.serialization.json.*

class SkillTool(private val skillManager: SkillManager) : Tool {
    override val name = "skill_tool"
    override val description = "Manage persistent skills. Actions: 'save_skill' (requires 'skill_name', 'skill_description', 'instructions'), 'list_skills', 'use_skill' (requires 'skill_name')."
    override val parametersSchema = """
        {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["save_skill", "list_skills", "use_skill"]},
                "skill_name": {"type": "string"},
                "skill_description": {"type": "string"},
                "instructions": {"type": "string"}
            },
            "required": ["action"]
        }
    """.trimIndent()

    override suspend fun execute(params: JsonElement): String {
        val action = params.jsonObject["action"]?.jsonPrimitive?.content ?: return "Error: Missing action"
        
        return when (action) {
            "save_skill" -> {
                val name = params.jsonObject["skill_name"]?.jsonPrimitive?.content ?: return "Error: Missing skill_name"
                val desc = params.jsonObject["skill_description"]?.jsonPrimitive?.content ?: return "Error: Missing skill_description"
                val inst = params.jsonObject["instructions"]?.jsonPrimitive?.content ?: return "Error: Missing instructions"
                skillManager.saveSkill(name, desc, inst)
            }
            "list_skills" -> {
                val skills = skillManager.loadSkills()
                if (skills.isEmpty()) "No skills saved yet."
                else "Available skills: " + skills.keys.joinToString(", ")
            }
            "use_skill" -> {
                val name = params.jsonObject["skill_name"]?.jsonPrimitive?.content ?: return "Error: Missing skill_name"
                skillManager.getSkillInstructions(name) ?: "Error: Skill '$name' not found."
            }
            else -> "Error: Unknown action '$action'"
        }
    }
}

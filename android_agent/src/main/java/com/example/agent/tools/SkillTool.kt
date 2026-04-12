package com.example.agent.tools

import com.example.agent.core.SkillManager
import kotlinx.serialization.json.*

/**
 * # SkillTool — skill management tool for the ReAct agent loop.
 *
 * ## Actions
 * | action           | required params                              | description                        |
 * |------------------|----------------------------------------------|------------------------------------|
 * | save_skill       | skill_name, skill_description, instructions  | Create or update a skill           |
 * | list_skills      | —                                            | List all skills with enabled state |
 * | use_skill        | skill_name                                   | Retrieve instructions + mark usage |
 * | enable_skill     | skill_name                                   | Enable a skill (visible in prompts)|
 * | disable_skill    | skill_name                                   | Disable a skill (hidden in prompts)|
 * | delete_skill     | skill_name                                   | Permanently delete a skill         |
 * | search_skills    | query                                        | Find skills by name/tag/description|
 *
 * ## Skill authorship
 * Skills created via this tool (by Gemma) carry `createdBy = "gemma"`.
 * The agent should add a `tags` JSON array optionally.
 */
class SkillTool(private val skillManager: SkillManager) : Tool {

    override val name = "skill_tool"

    override val description = """
        Persist and invoke reusable skills (step-by-step instruction sets).
        A skill stores detailed instructions that Gemma can invoke on demand.
        Actions: save_skill · list_skills · use_skill · enable_skill · disable_skill · delete_skill · search_skills.
        Create skills proactively whenever you handle a multi-step task that could be useful later.
        Try to reuse existing skills before creating new ones.
    """.trimIndent()

    override val parametersSchema = """
        {
          "type": "object",
          "properties": {
            "action": {
              "type": "string",
              "enum": ["save_skill","list_skills","use_skill","enable_skill","disable_skill","delete_skill","search_skills"]
            },
            "skill_name":        {"type": "string", "description": "Unique skill identifier (e.g. 'wifi_toggle', 'daily_report')"},
            "skill_description": {"type": "string", "description": "One sentence describing what the skill does"},
            "instructions":      {"type": "string", "description": "Full step-by-step instructions (Markdown OK)"},
            "tags":              {"type": "array", "items": {"type": "string"}, "description": "Optional category tags"},
            "query":             {"type": "string", "description": "Search term for search_skills"}
          },
          "required": ["action"]
        }
    """.trimIndent()

    override suspend fun execute(params: JsonObject): String {
        val action = params["action"]?.jsonPrimitive?.content
            ?: return "Error: Missing 'action' parameter."

        return when (action) {
            "save_skill" -> {
                val name = params["skill_name"]?.jsonPrimitive?.content
                    ?: return "Error: Missing 'skill_name'."
                val desc = params["skill_description"]?.jsonPrimitive?.content
                    ?: return "Error: Missing 'skill_description'."
                val inst = params["instructions"]?.jsonPrimitive?.content
                    ?: return "Error: Missing 'instructions'."
                val tags = params["tags"]?.jsonArray
                    ?.mapNotNull { it.jsonPrimitive.content.takeIf { s -> s.isNotBlank() } }
                    ?: emptyList()

                val skill = skillManager.upsertSkill(
                    name         = name,
                    description  = desc,
                    instructions = inst,
                    createdBy    = "gemma",
                    tags         = tags,
                )
                "Skill '${skill.name}' saved successfully (id=${skill.id})."
            }

            "list_skills" -> {
                val skills = skillManager.getAllSkills()
                if (skills.isEmpty()) return "No skills saved yet."
                buildString {
                    appendLine("${skills.size} skill(s):")
                    skills.sortedByDescending { it.usageCount }.forEach { s ->
                        val status = if (s.enabled) "✓" else "✗"
                        val by = if (s.createdBy == "gemma") "(gemma)" else "(user)"
                        append("  [$status] ${s.name} $by — ${s.description}")
                        if (s.tags.isNotEmpty()) append(" [${s.tags.joinToString()}]")
                        if (s.usageCount > 0) append(" · used ${s.usageCount}×")
                        appendLine()
                    }
                }.trimEnd()
            }

            "use_skill" -> {
                val name = params["skill_name"]?.jsonPrimitive?.content
                    ?: return "Error: Missing 'skill_name'."
                val skill = skillManager.getSkillByName(name)
                    ?: return "Error: Skill '$name' not found. Call list_skills to see available skills."
                if (!skill.enabled)
                    return "Warning: Skill '$name' is currently disabled. Enable it first with enable_skill."
                skillManager.incrementUsage(name)
                "SKILL: ${skill.name}\n${skill.description}\n\n${skill.instructions}"
            }

            "enable_skill" -> {
                val name = params["skill_name"]?.jsonPrimitive?.content
                    ?: return "Error: Missing 'skill_name'."
                val skill = skillManager.getSkillByName(name)
                    ?: return "Error: Skill '$name' not found."
                val ok = skillManager.setEnabled(skill.id, true)
                if (ok) "Skill '$name' is now enabled and will appear in the system prompt."
                else "Error: Could not enable skill '$name'."
            }

            "disable_skill" -> {
                val name = params["skill_name"]?.jsonPrimitive?.content
                    ?: return "Error: Missing 'skill_name'."
                val skill = skillManager.getSkillByName(name)
                    ?: return "Error: Skill '$name' not found."
                val ok = skillManager.setEnabled(skill.id, false)
                if (ok) "Skill '$name' disabled and removed from the system prompt."
                else "Error: Could not disable skill '$name'."
            }

            "delete_skill" -> {
                val name = params["skill_name"]?.jsonPrimitive?.content
                    ?: return "Error: Missing 'skill_name'."
                val skill = skillManager.getSkillByName(name)
                    ?: return "Error: Skill '$name' not found."
                val ok = skillManager.deleteSkill(skill.id)
                if (ok) "Skill '$name' permanently deleted."
                else "Error: Could not delete skill '$name'."
            }

            "search_skills" -> {
                val query = params["query"]?.jsonPrimitive?.content?.lowercase()
                    ?: return "Error: Missing 'query'."
                val results = skillManager.getAllSkills().filter { s ->
                    s.name.lowercase().contains(query) ||
                    s.description.lowercase().contains(query) ||
                    s.tags.any { it.lowercase().contains(query) }
                }
                if (results.isEmpty()) "No skills matching '$query'."
                else buildString {
                    appendLine("${results.size} result(s) for '$query':")
                    results.forEach { s ->
                        appendLine("  • ${s.name} — ${s.description}")
                    }
                }.trimEnd()
            }

            else -> "Error: Unknown action '$action'. Valid: save_skill · list_skills · use_skill · enable_skill · disable_skill · delete_skill · search_skills"
        }
    }
}

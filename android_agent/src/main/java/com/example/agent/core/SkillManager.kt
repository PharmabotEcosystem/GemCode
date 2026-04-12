package com.example.agent.core

import android.content.Context
import kotlinx.serialization.json.*
import java.io.File
import java.util.UUID

/**
 * A single persistent skill.
 *
 * @param id          Unique identifier (UUID).
 * @param name        Short human-readable name (used as key by Gemma).
 * @param description One-sentence purpose (shown in UI + system prompt).
 * @param instructions Step-by-step Markdown instructions injected when the skill is invoked.
 * @param enabled     Whether Gemma sees this skill in the system prompt automatically.
 * @param createdBy   "user" or "gemma" — shown as badge in the UI.
 * @param createdAt   Unix millis — used to sort by most recent.
 * @param usageCount  How many times skill_tool invoked this skill.
 * @param tags        Optional tag list for organisation.
 */
data class Skill(
    val id: String         = UUID.randomUUID().toString(),
    val name: String,
    val description: String,
    val instructions: String,
    val enabled: Boolean   = true,
    val createdBy: String  = "user",  // "user" | "gemma"
    val createdAt: Long    = System.currentTimeMillis(),
    val usageCount: Int    = 0,
    val tags: List<String> = emptyList(),
)

/**
 * Manages the skill library stored as a JSON array in `skills.json`.
 *
 * Thread-safety: all public methods are synchronised on the file path — safe
 * to call from coroutines on Dispatchers.IO.
 */
class SkillManager(private val context: Context) {

    private val skillsFile = File(context.filesDir, "skills.json")
    private val json = Json { ignoreUnknownKeys = true; prettyPrint = false }

    // ── Persistence ────────────────────────────────────────────────────────

    @Synchronized
    fun getAllSkills(): List<Skill> {
        if (!skillsFile.exists()) return emptyList()
        return try {
            json.parseToJsonElement(skillsFile.readText()).jsonArray.map { parseSkill(it.jsonObject) }
        } catch (_: Exception) {
            emptyList()
        }
    }

    @Synchronized
    fun getEnabledSkills(): List<Skill> = getAllSkills().filter { it.enabled }

    @Synchronized
    private fun save(skills: List<Skill>) {
        val arr = buildJsonArray { skills.forEach { add(it.toJson()) } }
        skillsFile.writeText(arr.toString())
    }

    // ── CRUD ───────────────────────────────────────────────────────────────

    @Synchronized
    fun upsertSkill(
        name: String,
        description: String,
        instructions: String,
        createdBy: String = "user",
        tags: List<String> = emptyList(),
    ): Skill {
        val skills = getAllSkills().toMutableList()
        val existing = skills.indexOfFirst { it.name.equals(name, ignoreCase = true) }
        val skill = if (existing >= 0) {
            skills[existing].copy(
                description  = description,
                instructions = instructions,
                tags         = tags,
            )
        } else {
            Skill(name = name, description = description, instructions = instructions,
                  createdBy = createdBy, tags = tags)
        }
        if (existing >= 0) skills[existing] = skill else skills.add(skill)
        save(skills)
        return skill
    }

    @Synchronized
    fun deleteSkill(id: String): Boolean {
        val skills = getAllSkills().toMutableList()
        val removed = skills.removeAll { it.id == id }
        if (removed) save(skills)
        return removed
    }

    @Synchronized
    fun setEnabled(id: String, enabled: Boolean): Boolean {
        val skills = getAllSkills().toMutableList()
        val idx = skills.indexOfFirst { it.id == id }
        if (idx < 0) return false
        skills[idx] = skills[idx].copy(enabled = enabled)
        save(skills)
        return true
    }

    @Synchronized
    fun incrementUsage(name: String) {
        val skills = getAllSkills().toMutableList()
        val idx = skills.indexOfFirst { it.name.equals(name, ignoreCase = true) }
        if (idx >= 0) {
            skills[idx] = skills[idx].copy(usageCount = skills[idx].usageCount + 1)
            save(skills)
        }
    }

    fun getSkillByName(name: String): Skill? =
        getAllSkills().firstOrNull { it.name.equals(name, ignoreCase = true) }

    // ── Prompt helpers ─────────────────────────────────────────────────────

    /**
     * Builds the "ACTIVE SKILLS" section injected into the system prompt.
     * Only enabled skills appear here — Gemma can call skill_tool/use_skill to
     * load the full instructions at inference time.
     */
    fun buildSkillsPromptSection(): String {
        val enabled = getEnabledSkills()
        if (enabled.isEmpty()) return ""
        return buildString {
            appendLine("ACTIVE SKILLS (call skill_tool/use_skill to invoke any of these):")
            enabled.forEach { s ->
                appendLine("  • ${s.name}: ${s.description}" +
                    if (s.tags.isNotEmpty()) " [${s.tags.joinToString()}]" else "")
            }
        }
    }

    // ── Serialisation ──────────────────────────────────────────────────────

    private fun Skill.toJson(): JsonObject = buildJsonObject {
        put("id",           id)
        put("name",         name)
        put("description",  description)
        put("instructions", instructions)
        put("enabled",      enabled)
        put("createdBy",    createdBy)
        put("createdAt",    createdAt)
        put("usageCount",   usageCount)
        put("tags", buildJsonArray { tags.forEach { add(it) } })
    }

    private fun parseSkill(obj: JsonObject): Skill = Skill(
        id           = obj["id"]?.jsonPrimitive?.content ?: UUID.randomUUID().toString(),
        name         = obj["name"]?.jsonPrimitive?.content ?: "",
        description  = obj["description"]?.jsonPrimitive?.content ?: "",
        instructions = obj["instructions"]?.jsonPrimitive?.content ?: "",
        enabled      = obj["enabled"]?.jsonPrimitive?.boolean ?: true,
        createdBy    = obj["createdBy"]?.jsonPrimitive?.content ?: "user",
        createdAt    = obj["createdAt"]?.jsonPrimitive?.long ?: System.currentTimeMillis(),
        usageCount   = obj["usageCount"]?.jsonPrimitive?.int ?: 0,
        tags         = obj["tags"]?.jsonArray?.map { it.jsonPrimitive.content } ?: emptyList(),
    )

    // ── Legacy compat shims used by old SkillTool ─────────────────────────

    /** Returns instruction text for the named skill (null = not found). */
    fun getSkillInstructions(name: String): String? = getSkillByName(name)?.instructions
}

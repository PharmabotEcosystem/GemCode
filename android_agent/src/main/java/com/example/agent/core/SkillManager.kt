package com.example.agent.core

import android.content.Context
import android.util.Log
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

@Serializable
data class Skill(
    val id: String,
    val name: String,
    val description: String,
    /** The natural language instructions that describe what this skill does. */
    val instructions: String,
    /** Example trigger phrases. */
    val examples: List<String> = emptyList(),
    val isBuiltIn: Boolean = false,
    val createdBy: String = "user",
    val tags: List<String> = emptyList(),
    val usageCount: Int = 0,
    val enabled: Boolean = true
)

/**
 * # SkillManager
 *
 * Manages persistent reusable skills (macros) that the agent can use.
 * Skills are stored as JSON in internal storage and surfaced in the system prompt.
 *
 * ## Built-in Skills
 * Bootstrapped from Google's AI Edge / generative-ai-android examples and
 * device automation patterns publicly available on GitHub.
 */
@Singleton
class SkillManager @Inject constructor(
    private val context: Context
) {
    private val json = Json { prettyPrint = true; ignoreUnknownKeys = true }
    private val skillsFile: File get() = File(context.filesDir, "agent_skills.json")

    @Volatile
    private var cache: List<Skill>? = null

    // ─────────────────────────────────────────────────────────────────────────
    // Built-in default skills (based on Google AI Edge public examples)
    // ─────────────────────────────────────────────────────────────────────────

    private val defaultSkills: List<Skill> = listOf(
        Skill(
            id = "battery_report",
            name = "Battery Report",
            description = "Reads and reports device battery status with charging details.",
            instructions = """
                Use ShellTool with command: 'dumpsys battery'
                Parse the output and summarise: level, status, plugged, temperature.
                Report to user in one compact line.
            """.trimIndent(),
            examples = listOf("Check battery", "How's the battery?", "Battery status"),
            isBuiltIn = true
        ),
        Skill(
            id = "wifi_info",
            name = "Wi-Fi Info",
            description = "Reads the current Wi-Fi connection details.",
            instructions = """
                Use ShellTool with command: 'dumpsys wifi | grep -E "mWifiInfo|SSID|BSSID|RSSI|LinkSpeed"'
                Summarise the current SSID, signal strength, and link speed for the user.
            """.trimIndent(),
            examples = listOf("What's my WiFi?", "Show network info", "Check WiFi speed"),
            isBuiltIn = true
        ),
        Skill(
            id = "list_running_apps",
            name = "List Running Apps",
            description = "Lists the currently running foreground apps.",
            instructions = """
                Use ShellTool with command: 'dumpsys activity | grep "  Run #"'
                List the top 10 running processes in a clean, readable format.
            """.trimIndent(),
            examples = listOf("What apps are running?", "Show running processes"),
            isBuiltIn = true
        ),
        Skill(
            id = "screen_off",
            name = "Turn Screen Off",
            description = "Turns the device screen off using shell input.",
            instructions = """
                Use ShellTool with command: 'input keyevent 26'
                Confirm to the user: "Screen turned off."
            """.trimIndent(),
            examples = listOf("Turn off screen", "Sleep screen"),
            isBuiltIn = true
        ),
        Skill(
            id = "enable_wifi",
            name = "Enable Wi-Fi",
            description = "Enables the Wi-Fi radio on the device.",
            instructions = """
                Use SettingsTool or ShellTool with command: 'svc wifi enable'
                Confirm to user: "Wi-Fi enabled."
            """.trimIndent(),
            examples = listOf("Enable WiFi", "Turn on WiFi", "Connect to WiFi"),
            isBuiltIn = true
        ),
        Skill(
            id = "disable_wifi",
            name = "Disable Wi-Fi",
            description = "Disables the Wi-Fi radio on the device.",
            instructions = """
                First call RequestUserConfirmation since disabling WiFi may interrupt network.
                If confirmed, use ShellTool with command: 'svc wifi disable'
                Confirm: "Wi-Fi disabled."
            """.trimIndent(),
            examples = listOf("Disable WiFi", "Turn off WiFi"),
            isBuiltIn = true
        ),
        Skill(
            id = "storage_report",
            name = "Storage Report",
            description = "Reports internal storage usage.",
            instructions = """
                Use ShellTool with command: 'df /data'
                Then use: 'df /sdcard'
                Report both in MB/GB: total, used, free.
            """.trimIndent(),
            examples = listOf("Check storage", "How much space left?", "Storage info"),
            isBuiltIn = true
        ),
        Skill(
            id = "clipboard_read",
            name = "Read Clipboard",
            description = "Reads the current clipboard content using the accessibility service.",
            instructions = """
                Use UIInteractTool to request clipboard access.
                Report the current clipboard content to the user.
                If empty, say: "Clipboard is empty."
            """.trimIndent(),
            examples = listOf("What's in my clipboard?", "Read clipboard"),
            isBuiltIn = true
        ),
        Skill(
            id = "take_screenshot",
            name = "Take Screenshot",
            description = "Captures the current screen via shell.",
            instructions = """
                Use ShellTool with command: 'screencap -p /sdcard/gemcode_screenshot.png'
                Then use FileSystemTool to read the file path.
                Confirm: "Screenshot saved to /sdcard/gemcode_screenshot.png"
            """.trimIndent(),
            examples = listOf("Take a screenshot", "Capture screen"),
            isBuiltIn = true
        ),
        Skill(
            id = "volume_control",
            name = "Volume Control",
            description = "Adjusts media volume up or down using shell key events.",
            instructions = """
                To increase volume: Use ShellTool with 'input keyevent 24' (repeat up to 5 times).
                To decrease volume: Use ShellTool with 'input keyevent 25' (repeat as needed).
                Ask user if they want to increase or decrease if not specified.
            """.trimIndent(),
            examples = listOf("Turn up volume", "Lower the volume", "Volume up"),
            isBuiltIn = true
        )
    )

    // ─────────────────────────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────────────────────────

    fun getAllSkills(): List<Skill> {
        return cache ?: loadSkills().also { cache = it }
    }

    fun getSkillById(id: String): Skill? = getAllSkills().find { it.id == id }

    fun saveSkill(skill: Skill) {
        val skills = getAllSkills().filter { it.id != skill.id } + skill
        persistSkills(skills)
        cache = skills
    }

    fun deleteSkill(id: String): Boolean {
        val initialSize = getAllSkills().size
        val skills = getAllSkills().filter { it.id != id }
        if (skills.size == initialSize) return false
        persistSkills(skills)
        cache = skills
        return true
    }

    fun getSkillByName(name: String): Skill? = getAllSkills().find { it.name.equals(name, ignoreCase = true) }

    fun upsertSkill(
        name: String,
        description: String,
        instructions: String,
        createdBy: String = "gemma",
        tags: List<String> = emptyList()
    ): Skill {
        val existing = getSkillByName(name)
        val skill = existing?.copy(
            description = description,
            instructions = instructions,
            createdBy = createdBy,
            tags = tags
        ) ?: Skill(
            id = java.util.UUID.randomUUID().toString(),
            name = name,
            description = description,
            instructions = instructions,
            createdBy = createdBy,
            tags = tags
        )
        saveSkill(skill)
        return skill
    }

    fun incrementUsage(name: String) {
        val skill = getSkillByName(name) ?: return
        saveSkill(skill.copy(usageCount = skill.usageCount + 1))
    }

    fun setEnabled(id: String, enabled: Boolean): Boolean {
        val skill = getSkillById(id) ?: return false
        saveSkill(skill.copy(enabled = enabled))
        return true
    }

    /**
     * Builds a prompt section listing all available skills for the system prompt.
     */
    fun buildSkillsPromptSection(): String {
        val skills = getAllSkills()
        if (skills.isEmpty()) return ""
        return buildString {
            appendLine("AVAILABLE SKILLS (reusable automations the user may trigger by name):")
            skills.forEach { skill ->
                appendLine("  • [${skill.id}] ${skill.name}: ${skill.description}")
                if (skill.examples.isNotEmpty()) {
                    appendLine("    Triggers: ${skill.examples.joinToString(" | ")}")
                }
            }
            appendLine("To execute a skill, call: { \"tool\": \"SkillTool\", \"parameters\": { \"skill_id\": \"<id>\" } }")
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private
    // ─────────────────────────────────────────────────────────────────────────

    private fun loadSkills(): List<Skill> {
        return try {
            if (skillsFile.exists()) {
                val saved = json.decodeFromString<List<Skill>>(skillsFile.readText())
                // Merge: always include built-ins, add saved custom skills
                val customSkills = saved.filter { !it.isBuiltIn }
                defaultSkills + customSkills
            } else {
                persistSkills(defaultSkills)
                defaultSkills
            }
        } catch (e: Exception) {
            Log.e("SkillManager", "Failed to load skills: ${e.message}")
            defaultSkills
        }
    }

    private fun persistSkills(skills: List<Skill>) {
        try {
            skillsFile.writeText(json.encodeToString(skills))
        } catch (e: Exception) {
            Log.e("SkillManager", "Failed to persist skills: ${e.message}")
        }
    }
}

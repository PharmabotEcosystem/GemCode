package com.example.agent.core

import android.content.Context
import kotlinx.serialization.json.*
import java.io.File

class SkillManager(private val context: Context) {
    private val skillsFile = File(context.filesDir, "skills.json")

    fun saveSkill(name: String, description: String, instructions: String): String {
        val currentSkills = loadSkills().toMutableMap()
        currentSkills[name] = buildJsonObject {
            put("description", description)
            put("instructions", instructions)
        }
        
        skillsFile.writeText(JsonObject(currentSkills).toString())
        return "Skill '$name' saved successfully."
    }

    fun loadSkills(): Map<String, JsonElement> {
        if (!skillsFile.exists()) return emptyMap()
        return try {
            val content = skillsFile.readText()
            Json.parseToJsonElement(content).jsonObject.toMap()
        } catch (e: Exception) {
            emptyMap()
        }
    }
    
    fun getSkillInstructions(name: String): String? {
        val skills = loadSkills()
        val skill = skills[name]?.jsonObject
        return skill?.get("instructions")?.jsonPrimitive?.content
    }
}

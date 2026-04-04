package com.example.agent.tools

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import rikka.shizuku.Shizuku
import java.io.BufferedReader
import java.io.InputStreamReader

/**
 * Tool per modificare le impostazioni di sistema usando Shizuku.
 * Esegue comandi shell con privilegi ADB.
 */
class SettingsTool : Tool {
    override val name = "SettingsTool"
    override val description = "Modifies system settings using ADB shell commands via Shizuku."
    override val parametersSchema = """
        {
          "type": "object",
          "properties": {
            "namespace": { "type": "string", "enum": ["system", "secure", "global"] },
            "key": { "type": "string", "description": "Setting key (e.g., 'screen_brightness')" },
            "value": { "type": "string", "description": "Value to set" }
          },
          "required": ["namespace", "key", "value"]
        }
    """.trimIndent()

    override suspend fun execute(params: JsonElement): String = withContext(Dispatchers.IO) {
        val namespace = params.jsonObject["namespace"]?.jsonPrimitive?.content ?: return@withContext "Error: namespace required."
        val key = params.jsonObject["key"]?.jsonPrimitive?.content ?: return@withContext "Error: key required."
        val value = params.jsonObject["value"]?.jsonPrimitive?.content ?: return@withContext "Error: value required."

        if (!Shizuku.pingBider()) {
            return@withContext "Error: Shizuku is not running or not accessible."
        }

        if (Shizuku.checkSelfPermission() != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            return@withContext "Error: Shizuku permission not granted to this app."
        }

        val command = "settings put $namespace $key $value"

        return@withContext try {
            // Esegue il comando tramite Shizuku
            val process = Shizuku.newProcess(arrayOf("sh", "-c", command), null, null)
            val reader = BufferedReader(InputStreamReader(process.inputStream))
            val errorReader = BufferedReader(InputStreamReader(process.errorStream))
            
            process.waitFor()
            
            val output = reader.readText()
            val error = errorReader.readText()

            if (process.exitValue() == 0) {
                "Success: Setting updated. Output: $output"
            } else {
                "Error executing command: $error"
            }
        } catch (e: Exception) {
            "Exception: ${e.message}"
        }
    }
}

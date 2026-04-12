package com.example.agent.tools

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
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

    override suspend fun execute(params: JsonObject): String = withContext(Dispatchers.IO) {
        val namespace = params["namespace"]?.jsonPrimitive?.content ?: return@withContext "Error: namespace required."
        val key = params["key"]?.jsonPrimitive?.content ?: return@withContext "Error: key required."
        val value = params["value"]?.jsonPrimitive?.content ?: return@withContext "Error: value required."

        if (!Shizuku.pingBinder()) {
            return@withContext "Error: Shizuku is not running or not accessible."
        }

        if (Shizuku.checkSelfPermission() != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            return@withContext "Error: Shizuku permission not granted to this app."
        }

        val command = "settings put $namespace $key $value"

        return@withContext try {
            val process = Shizuku.newProcess(arrayOf("sh", "-c", command), null, null)

            // Drain stdout and stderr in parallel to prevent deadlock.
            // If we read one stream only after waitFor(), the other stream buffer
            // may fill up and block the child process, causing a deadlock.
            val (output, error) = coroutineScope {
                val stdout = async(Dispatchers.IO) {
                    BufferedReader(InputStreamReader(process.inputStream)).readText()
                }
                val stderr = async(Dispatchers.IO) {
                    BufferedReader(InputStreamReader(process.errorStream)).readText()
                }
                Pair(stdout.await(), stderr.await())
            }

            val exitCode = process.waitFor()
            if (exitCode == 0) {
                "Success: Setting '$namespace/$key' set to '$value'." +
                        if (output.isNotBlank()) " Output: $output" else ""
            } else {
                "Error (exit $exitCode): $error"
            }
        } catch (e: Exception) {
            "Exception: ${e.message}"
        }
    }
}

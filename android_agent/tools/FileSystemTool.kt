package com.example.agent.tools

import android.os.Build
import android.os.Environment
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File

/**
 * Tool per leggere e scrivere file nel file system.
 * Richiede il permesso MANAGE_EXTERNAL_STORAGE nel manifest.
 */
class FileSystemTool : Tool {
    override val name = "FileSystemTool"
    override val description = "Reads or writes files to the device storage. Use absolute paths."
    override val parametersSchema = """
        {
          "type": "object",
          "properties": {
            "action": { 
              "type": "string", 
              "enum": ["read", "write"],
              "description": "Whether to read from or write to a file."
            },
            "path": { 
              "type": "string", 
              "description": "The absolute file path on the Android device (e.g., /sdcard/Download/test.txt)" 
            },
            "content": { 
              "type": "string", 
              "description": "The text content to write. Required only if action is 'write'." 
            }
          },
          "required": ["action", "path"]
        }
    """.trimIndent()

    override suspend fun execute(params: JsonElement): String = withContext(Dispatchers.IO) {
        // Controllo preventivo dei permessi su Android 11+ (API 30+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            if (!Environment.isExternalStorageManager()) {
                return@withContext "Error: MANAGE_EXTERNAL_STORAGE permission is not granted. The user must grant full storage access in Android Settings."
            }
        }

        val jsonObj = params.jsonObject
        val action = jsonObj["action"]?.jsonPrimitive?.content
        val path = jsonObj["path"]?.jsonPrimitive?.content ?: return@withContext "Error: 'path' parameter is required."
        
        val file = File(path)

        return@withContext try {
            when (action) {
                "read" -> {
                    if (file.exists() && file.canRead()) {
                        val content = file.readText()
                        "Success: Read ${content.length} characters.\nContent:\n$content"
                    } else {
                        "Error: File does not exist or cannot be read at path: $path"
                    }
                }
                "write" -> {
                    val content = jsonObj["content"]?.jsonPrimitive?.content ?: ""
                    // Assicurati che le directory genitrici esistano
                    file.parentFile?.mkdirs()
                    file.writeText(content)
                    "Success: File successfully written to $path"
                }
                else -> "Error: Unknown action '$action'. Must be 'read' or 'write'."
            }
        } catch (e: SecurityException) {
            "Security Error: Permission denied to access $path. Ensure MANAGE_EXTERNAL_STORAGE is granted."
        } catch (e: Exception) {
            "Error executing FileSystemTool: ${e.localizedMessage}"
        }
    }
}

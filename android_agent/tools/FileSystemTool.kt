package com.example.agent.tools

import android.os.Build
import android.os.Environment
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
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
              "enum": ["read", "write", "append", "list", "delete"],
              "description": "read: read file content. write: overwrite file. append: append to file. list: list files in directory. delete: delete file."
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

    override suspend fun execute(params: JsonObject): String = withContext(Dispatchers.IO) {
        // Controllo preventivo dei permessi su Android 11+ (API 30+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            if (!Environment.isExternalStorageManager()) {
                return@withContext "Error: MANAGE_EXTERNAL_STORAGE permission is not granted. The user must grant full storage access in Android Settings."
            }
        }

        val action = params["action"]?.jsonPrimitive?.content
        val path = params["path"]?.jsonPrimitive?.content

        return@withContext try {
            when (action) {
                "read" -> {
                    val p = path ?: return@withContext "Error: 'path' parameter is required."
                    val file = File(p)
                    if (file.exists() && file.canRead()) {
                        val content = file.readText()
                        "Success: Read ${content.length} characters.\nContent:\n$content"
                    } else {
                        "Error: File does not exist or cannot be read at path: $p"
                    }
                }
                "write" -> {
                    val p = path ?: return@withContext "Error: 'path' parameter is required."
                    val content = params["content"]?.jsonPrimitive?.content ?: ""
                    val file = File(p)
                    file.parentFile?.mkdirs()
                    file.writeText(content)
                    "Success: File written to $p (${content.length} chars)"
                }
                "append" -> {
                    val p = path ?: return@withContext "Error: 'path' parameter is required."
                    val content = params["content"]?.jsonPrimitive?.content ?: ""
                    val file = File(p)
                    file.parentFile?.mkdirs()
                    file.appendText(content)
                    "Success: Appended ${content.length} chars to $p"
                }
                "list" -> {
                    val p = path ?: return@withContext "Error: 'path' parameter is required."
                    val dir = File(p)
                    if (!dir.exists()) return@withContext "Error: Path does not exist: $p"
                    if (!dir.isDirectory) return@withContext "Error: Path is not a directory: $p"
                    val entries = dir.listFiles()?.map { f ->
                        val type = if (f.isDirectory) "[DIR] " else "[FILE]"
                        val size = if (f.isFile) " (${f.length()} bytes)" else ""
                        "$type ${f.name}$size"
                    } ?: emptyList()
                    if (entries.isEmpty()) "Directory is empty: $p"
                    else "Contents of $p (${entries.size} items):\n" + entries.joinToString("\n")
                }
                "delete" -> {
                    val p = path ?: return@withContext "Error: 'path' parameter is required."
                    val file = File(p)
                    if (!file.exists()) return@withContext "Error: File not found: $p"
                    val deleted = if (file.isDirectory) file.deleteRecursively() else file.delete()
                    if (deleted) "Success: Deleted $p" else "Error: Could not delete $p"
                }
                else -> "Error: Unknown action '${action}'. Must be read, write, append, list, or delete."
            }
        } catch (e: SecurityException) {
            "Security Error: Permission denied to access $path. Ensure MANAGE_EXTERNAL_STORAGE is granted."
        } catch (e: Exception) {
            "Error executing FileSystemTool: ${e.localizedMessage}"
        }
    }
}

package com.example.agent.tools

import android.util.Log
import com.example.agent.shizuku.CommandResult
import com.example.agent.shizuku.ShizukuCommandExecutor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import javax.inject.Inject
import javax.inject.Singleton

/**
 * # ShellTool — esecuzione generica di comandi ADB shell via Shizuku.
 *
 * Permette all'agente di:
 * - Eseguire qualsiasi comando ADB-level (`am`, `pm`, `dumpsys`, `cmd`, `input`, ecc.)
 * - Lanciare app (`am start`)
 * - Interrogare lo stato del sistema (`dumpsys battery`, `df`, `ps`, ecc.)
 * - Installare APK (`pm install`)
 * - Controllare il dispositivo a livello di sistema senza root
 *
 * ## Sicurezza
 * Il [com.example.agent.core.SafetyGuard] intercetta i comandi pericolosi
 * (escalation root, factory reset, rm -rf) PRIMA che arrivino qui.
 * Questo tool esegue SOLO comandi consentiti da SafetyGuard.
 *
 * Timeout di default: 30 secondi per comando.
 *
 * @param executor  [ShizukuCommandExecutor] iniettato da Hilt.
 */
@Singleton
class ShellTool @Inject constructor(
    private val executor: ShizukuCommandExecutor
) : Tool {

    companion object {
        private const val TAG = "ShellTool"
        private const val MAX_OUTPUT_CHARS = 8000
    }

    override val name = "ShellTool"
    override val description = """
        Executes ADB-level shell commands on the device via Shizuku (no root required).
        Use for: launching apps (am start), querying system state (dumpsys, df, ps),
        installing APKs (pm install), reading system properties (getprop),
        sending key events (input keyevent), broadcast intents, etc.
        Output is truncated to $MAX_OUTPUT_CHARS characters.
        Requires Shizuku to be running and permission granted.
    """.trimIndent()

    override val parametersSchema = """
        {
          "type": "object",
          "properties": {
            "command": {
              "type": "string",
              "description": "The full shell command to execute (e.g., 'dumpsys battery', 'am start -n com.example/.MainActivity', 'pm list packages')"
            },
            "timeout_seconds": {
              "type": "integer",
              "description": "Max seconds to wait for the command to complete. Default: 30.",
              "default": 30
            }
          },
          "required": ["command"]
        }
    """.trimIndent()

    override suspend fun execute(params: JsonObject): String = withContext(Dispatchers.IO) {
        val command = params["command"]?.jsonPrimitive?.content?.trim()
            ?: return@withContext "Error: 'command' parameter is required."

        if (command.isBlank()) return@withContext "Error: command must not be empty."

        Log.d(TAG, "Executing shell command: $command")

        return@withContext when (val result = executor.executeAndCollect(command)) {
            is CommandResult.Success -> {
                val out = buildString {
                    if (result.stdout.isNotBlank()) append(result.stdout.trim())
                    if (result.stderr.isNotBlank()) {
                        if (isNotEmpty()) append("\n")
                        append("[stderr] ${result.stderr.trim()}")
                    }
                }.let { if (it.length > MAX_OUTPUT_CHARS) it.take(MAX_OUTPUT_CHARS) + "\n...[output truncated]" else it }

                "Exit 0: ${out.ifBlank { "(no output)" }}"
            }
            is CommandResult.Failure -> {
                val errOut = buildString {
                    if (result.stderr.isNotBlank()) append(result.stderr.trim())
                    if (result.stdout.isNotBlank()) {
                        if (isNotEmpty()) append("\n")
                        append(result.stdout.trim())
                    }
                }.let { if (it.length > MAX_OUTPUT_CHARS) it.take(MAX_OUTPUT_CHARS) + "\n...[truncated]" else it }
                "Exit ${result.exitCode}: ${errOut.ifBlank { "(no output)" }}"
            }
            is CommandResult.ShizukuUnavailable ->
                "Error: Shizuku unavailable (${result.status}). Ensure Shizuku is running and permission is granted."
            is CommandResult.ExecutionError ->
                "Error executing command: ${result.exception.message}"
        }
    }
}

package com.example.agent.core

import android.util.Log
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import javax.inject.Inject
import javax.inject.Singleton

// ─────────────────────────────────────────────────────────────────────────────
// Verdict hierarchy
// ─────────────────────────────────────────────────────────────────────────────

sealed interface SafetyVerdict {
    data object Safe : SafetyVerdict
    data class RequiresConfirmation(val reason: String, val operationSummary: String) : SafetyVerdict
    data class Blocked(val blockedReason: String) : SafetyVerdict
}

// ─────────────────────────────────────────────────────────────────────────────
// SafetyGuard (Whitelist Architecture)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * # SafetyGuard
 *
 * Intercettore di sicurezza basato su WHITELIST.
 * Protegge il dispositivo Android impedendo l'esecuzione di comandi shell arbitrari
 * non esplicitamente autorizzati.
 */
@Singleton
class SafetyGuard @Inject constructor() {

    companion object {
        private const val TAG = "SafetyGuard"

        // ── WHITELIST COMANDI SHELL (Primo token del comando) ────────────────
        private val ALLOWED_SHELL_BINARIES = setOf(
            "dumpsys", "am", "pm", "getprop", "input", "df", "ps", "ls",
            "cat", "echo", "ping", "ifconfig", "ip", "netstat", "logcat", "grep",
            "find", "pwd", "whoami", "uname", "uptime", "free", "top"
        )

        // ── SETTINGS CRITICI (SettingsTool) ──────────────────────────────────
        private val DANGEROUS_SETTINGS_KEYS = setOf(
            "install_non_market_apps", "adb_enabled", "development_settings_enabled",
            "usb_mass_storage_enabled", "wifi_saved_state"
        )
    }

    fun evaluate(toolName: String, params: JsonElement): SafetyVerdict {
        Log.d(TAG, "Evaluating tool: $toolName")

        return when (toolName) {
            "ShellTool" -> evaluateShellCommand(params)
            "SettingsTool" -> evaluateSettingsCommand(params)
            else -> SafetyVerdict.Safe // Altri tool (es. UIInteractTool) sono intrinsecamente sicuri
        }
    }

    fun evaluateCommand(command: String): SafetyVerdict {
        return evaluateShellString(command)
    }

    private fun evaluateShellCommand(params: JsonElement): SafetyVerdict {
        val command = try {
            params.jsonObject["command"]?.jsonPrimitive?.content ?: return SafetyVerdict.Blocked("Parametro 'command' mancante nel ShellTool.")
        } catch (e: Exception) {
            return SafetyVerdict.Blocked("Parametri JSON non validi per ShellTool.")
        }
        return evaluateShellString(command)
    }

    private fun evaluateShellString(fullCommand: String): SafetyVerdict {
        val cmdTrimmed = fullCommand.trim()
        if (cmdTrimmed.isBlank()) return SafetyVerdict.Blocked("Comando vuoto.")

        // Estrai il binario base (es. da "pm list packages" estrai "pm")
        val baseBinary = cmdTrimmed.split("\\s+".toRegex()).first().lowercase()

        // 1. WHITELIST CHECK: Se il binario non è esplicitamente permesso, blocca.
        if (!ALLOWED_SHELL_BINARIES.contains(baseBinary)) {
            Log.w(TAG, "BLOCKED: Binario '$baseBinary' non presente nella whitelist.")
            return SafetyVerdict.Blocked(
                "SAFETY BLOCK: Il comando '$baseBinary' non è autorizzato. " +
                "I comandi shell sono limitati a operazioni di lettura e interazione sicura. " +
                "Comandi distruttivi (rm, chmod, su) sono permanentemente bloccati."
            )
        }

        // 2. CONTROLLI SPECIFICI DI CONTESTO per i binari permessi
        val cmdLower = cmdTrimmed.lowercase()

        // Blocca intent distruttivi (es. Factory Reset)
        if (baseBinary == "am" && (cmdLower.contains("factory_reset") || cmdLower.contains("wipe"))) {
            return SafetyVerdict.Blocked("SAFETY BLOCK: I comandi di Factory Reset / Wipe sono bloccati.")
        }

        // Richiedi conferma per rimozione app
        if (baseBinary == "pm" && (cmdLower.contains("uninstall") || cmdLower.contains("clear"))) {
            return SafetyVerdict.RequiresConfirmation(
                reason = "L'operazione rimuoverà un'app o i suoi dati in modo irreversibile.",
                operationSummary = "Package Uninstall/Clear: $cmdTrimmed"
            )
        }

        return SafetyVerdict.Safe
    }

    private fun evaluateSettingsCommand(params: JsonElement): SafetyVerdict {
        val key = try {
            params.jsonObject["key"]?.jsonPrimitive?.content?.lowercase() ?: return SafetyVerdict.Blocked("Parametro 'key' mancante.")
        } catch (e: Exception) {
            return SafetyVerdict.Blocked("Parametri JSON non validi per SettingsTool.")
        }

        if (DANGEROUS_SETTINGS_KEYS.contains(key)) {
            Log.w(TAG, "BLOCKED: Tentativo di modifica di un setting di sicurezza: $key")
            return SafetyVerdict.Blocked(
                "SAFETY BLOCK: La modifica dell'impostazione di sistema '$key' riduce la sicurezza del dispositivo ed è permanentemente bloccata."
            )
        }

        return SafetyVerdict.RequiresConfirmation(
            reason = "Le modifiche alle impostazioni di sistema possono alterare il comportamento del dispositivo.",
            operationSummary = "System Setting Modification: $key"
        )
    }
}

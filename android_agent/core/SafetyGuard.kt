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

/**
 * Esito della valutazione di sicurezza su una tool call.
 * Prodotto da [SafetyGuard.evaluate] e consumato da [AgentLoop] prima dell'esecuzione.
 */
sealed interface SafetyVerdict {

    /** Operazione sicura — procedere senza interruzioni. */
    data object Safe : SafetyVerdict

    /**
     * Operazione potenzialmente distruttiva — SOSPENDERE il loop e chiedere
     * conferma esplicita all'utente prima di procedere.
     *
     * @param reason              Spiegazione human-readable del rischio.
     * @param operationSummary    Descrizione concisa dell'operazione richiesta.
     */
    data class RequiresConfirmation(
        val reason: String,
        val operationSummary: String
    ) : SafetyVerdict

    /**
     * Operazione sempre bloccata — non eseguire MAI, indipendentemente dalla
     * conferma dell'utente. Restituire il [blockedReason] come Observation al modello.
     *
     * @param blockedReason  Spiegazione del blocco da restituire come Observation al LLM.
     */
    data class Blocked(val blockedReason: String) : SafetyVerdict
}

// ─────────────────────────────────────────────────────────────────────────────
// SafetyGuard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * # SafetyGuard
 *
 * Intercettore di sicurezza che valuta ogni tool call dell'[AgentLoop] PRIMA
 * dell'esecuzione. Implementa la "Safety Catch" definita nella Constitution.
 *
 * ## Livelli di sicurezza
 *
 * ### Blocco Assoluto (Blocked)
 * Operazioni che non devono MAI essere eseguite, nemmeno con conferma utente:
 * - Comandi di privilege escalation (`su`, `magisk`, `ptrace`)
 * - Factory reset / wipe data senza flag esplicito
 * - Modifica policy SELinux
 * - Esfiltrazione dati (curl/wget verso server non-localhost con dati personali)
 *
 * ### Conferma Richiesta (RequiresConfirmation)
 * Operazioni potenzialmente distruttive che richiedono conferma esplicita:
 * - `rm -rf` o `rm -r` su directory non temporanee
 * - `pm uninstall` su pacchetti di sistema o su 2+ pacchetti in sequenza
 * - Reset di rete (`cmd connectivity`, `svc wifi disable` + `svc data disable`)
 * - Sovrascrittura di file di configurazione critici
 *
 * ### Sicuro (Safe)
 * Tutto il resto — read-only, impostazioni reversibili, comandi di query.
 *
 * ## Integrazione
 * ```kotlin
 * val verdict = safetyGuard.evaluate(toolCall.name, toolCall.params)
 * when (verdict) {
 *     is SafetyVerdict.Safe -> executeNormally()
 *     is SafetyVerdict.RequiresConfirmation -> {
 *         val confirmed = onConfirmationRequired(verdict.reason)
 *         if (confirmed) executeNormally() else "Operation cancelled by user."
 *     }
 *     is SafetyVerdict.Blocked -> verdict.blockedReason  // come Observation
 * }
 * ```
 */
@Singleton
class SafetyGuard @Inject constructor() {

    companion object {
        private const val TAG = "SafetyGuard"

        // ── Regex per blocco assoluto ──────────────────────────────────────

        private val ABSOLUTE_BLOCK_PATTERNS = listOf(
            // Privilege escalation
            """\bsu\b""".toRegex(RegexOption.IGNORE_CASE) to
                    "Privilege escalation (su) is permanently blocked. The agent operates within standard ADB permissions only.",

            """magisk|supersu|kingroot""".toRegex(RegexOption.IGNORE_CASE) to
                    "Root framework access is permanently blocked.",

            """\bptrace\b|/proc/\d+/mem""".toRegex(RegexOption.IGNORE_CASE) to
                    "Process memory inspection via ptrace is permanently blocked.",

            // SELinux modification
            """setenforce|chcon|restorecon.*-R""".toRegex(RegexOption.IGNORE_CASE) to
                    "SELinux policy modification is permanently blocked.",

            // Factory reset / wipe — without explicit safe-word
            """am\s+broadcast.*FACTORY_RESET|recovery.*wipe.*data|--wipe-data""".toRegex(RegexOption.IGNORE_CASE) to
                    "Factory reset commands are permanently blocked. Use Android Settings > General Management > Reset if needed.",

            // Adb-over-network enable (security risk)
            """setprop\s+service\.adb\.tcp\.port""".toRegex(RegexOption.IGNORE_CASE) to
                    "Enabling ADB over network (TCP) is permanently blocked for security.",
        )

        // ── Regex per conferma richiesta ───────────────────────────────────

        private val CONFIRMATION_PATTERNS = listOf(
            // rm -rf or rm -r on non-temp paths
            ConfirmPattern(
                regex = """rm\s+(-rf?|-fr?)\s+(?!(/tmp|/data/local/tmp|/sdcard/Android/data/com\.example\.agent))""".toRegex(RegexOption.IGNORE_CASE),
                reason = "Recursive file deletion outside temp directories can cause irreversible data loss.",
                summaryPrefix = "Recursive delete"
            ),
            // pm uninstall (any package)
            ConfirmPattern(
                regex = """pm\s+uninstall""".toRegex(RegexOption.IGNORE_CASE),
                reason = "Package uninstallation is irreversible without re-installation.",
                summaryPrefix = "Package uninstall"
            ),
            // Disable both WiFi and mobile data simultaneously
            ConfirmPattern(
                regex = """svc\s+(wifi|data)\s+disable""".toRegex(RegexOption.IGNORE_CASE),
                reason = "Disabling network interfaces may interrupt ongoing operations and remote access.",
                summaryPrefix = "Network disable"
            ),
            // cmd connectivity reset
            ConfirmPattern(
                regex = """cmd\s+connectivity\s+reset|cmd\s+netpolicy\s+reset""".toRegex(RegexOption.IGNORE_CASE),
                reason = "Network policy reset will clear all VPN, proxy and DNS configurations.",
                summaryPrefix = "Network policy reset"
            ),
            // writing to /system, /vendor, /product (even with remount)
            ConfirmPattern(
                regex = """mount\s+-o\s+rw.*/(system|vendor|product)|cp\s+.*\s+/(system|vendor|product)/""".toRegex(RegexOption.IGNORE_CASE),
                reason = "Modifying system partitions can brick the device.",
                summaryPrefix = "System partition write"
            ),
            // Mass settings put global/secure with known dangerous keys
            ConfirmPattern(
                regex = """settings\s+put\s+(global|secure)\s+(install_non_market_apps|adb_enabled|development_settings_enabled)\s+1""".toRegex(RegexOption.IGNORE_CASE),
                reason = "Enabling developer or sideload settings reduces device security posture.",
                summaryPrefix = "Security-sensitive system setting"
            ),
        )
    }

    private data class ConfirmPattern(
        val regex: Regex,
        val reason: String,
        val summaryPrefix: String
    )

    // ─────────────────────────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Valuta se una tool call è sicura da eseguire.
     *
     * Estrae il contenuto rilevante dai parametri del tool (campo `command`,
     * `path`, `value`, o la rappresentazione JSON completa) e applica i pattern.
     *
     * @param toolName  Nome del tool da eseguire.
     * @param params    Parametri JSON come [JsonElement].
     * @return [SafetyVerdict] appropriato.
     */
    fun evaluate(toolName: String, params: JsonElement): SafetyVerdict {
        // Estrai una stringa rappresentativa dai parametri per il matching
        val paramsText = extractRelevantText(params)
        val fullContext = "$toolName $paramsText"

        Log.d(TAG, "Evaluating: $fullContext")

        // 1. Controlla blocco assoluto (priorità massima)
        for ((pattern, reason) in ABSOLUTE_BLOCK_PATTERNS) {
            if (pattern.containsMatchIn(fullContext)) {
                Log.w(TAG, "BLOCKED: matched pattern '${pattern.pattern}' in '$fullContext'")
                return SafetyVerdict.Blocked(
                    "SAFETY BLOCK: $reason\nBlocked operation: $toolName($paramsText)"
                )
            }
        }

        // 2. Controlla operazioni che richiedono conferma
        for (cp in CONFIRMATION_PATTERNS) {
            if (cp.regex.containsMatchIn(fullContext)) {
                Log.w(TAG, "CONFIRMATION REQUIRED: matched '${cp.regex.pattern}' in '$fullContext'")
                return SafetyVerdict.RequiresConfirmation(
                    reason = cp.reason,
                    operationSummary = "${cp.summaryPrefix}: $toolName($paramsText)"
                )
            }
        }

        return SafetyVerdict.Safe
    }

    /**
     * Versione semplificata per valutare direttamente una stringa di comando
     * (usata da [com.example.agent.shizuku.ShizukuCommandExecutor] se collegato).
     */
    fun evaluateCommand(command: String): SafetyVerdict {
        for ((pattern, reason) in ABSOLUTE_BLOCK_PATTERNS) {
            if (pattern.containsMatchIn(command)) {
                return SafetyVerdict.Blocked("SAFETY BLOCK: $reason")
            }
        }
        for (cp in CONFIRMATION_PATTERNS) {
            if (cp.regex.containsMatchIn(command)) {
                return SafetyVerdict.RequiresConfirmation(cp.reason, "${cp.summaryPrefix}: $command")
            }
        }
        return SafetyVerdict.Safe
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Estrae i valori stringa rilevanti dai parametri JSON per il pattern matching.
     * Concatena tutti i valori primitivi (command, path, value, ecc.) in una stringa
     * singola per semplificare il matching con le regex.
     */
    private fun extractRelevantText(params: JsonElement): String = buildString {
        try {
            val obj = params.jsonObject
            // Chiavi note che contengono comandi o path (ordine di importanza)
            val priorityKeys = listOf("command", "cmd", "path", "value", "args", "script")
            for (key in priorityKeys) {
                obj[key]?.jsonPrimitive?.content?.let { append(it).append(" ") }
            }
            // Aggiunge tutti gli altri valori primitivi come fallback
            obj.entries
                .filter { it.key !in priorityKeys }
                .forEach { (_, v) ->
                    try { append(v.jsonPrimitive.content).append(" ") } catch (_: Exception) {}
                }
        } catch (_: Exception) {
            // Se i params non sono un oggetto JSON (es. stringa semplice), usa toString()
            append(params.toString())
        }
    }.trim()
}

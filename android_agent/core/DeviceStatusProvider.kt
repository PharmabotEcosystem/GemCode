package com.example.agent.core

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import com.example.agent.service.ResourceManager
import com.example.agent.shizuku.ShizukuCommandExecutor
import com.example.agent.shizuku.ShizukuStatus
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

// ─────────────────────────────────────────────────────────────────────────────
// Data model
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Snapshot dello stato fisico del dispositivo al momento della lettura.
 * Immutabile — ogni chiamata a [DeviceStatusProvider.getStatus] produce un nuovo snapshot.
 */
data class DeviceStatus(
    /** Livello batteria 0–100. -1 se non disponibile. */
    val batteryLevelPercent: Int,
    /** True se il dispositivo è in carica (via USB, wireless o dock). */
    val isCharging: Boolean,
    /** True se la batteria è < [BATTERY_LOW_THRESHOLD_PERCENT]. */
    val isLowBattery: Boolean,
    /** True se la batteria è < [BATTERY_CRITICAL_THRESHOLD_PERCENT] E non in carica. */
    val isCriticalBattery: Boolean,
    /** RAM disponibile per il sistema in MB (da ActivityManager.MemoryInfo). */
    val freeRamMb: Long,
    /** RAM totale del dispositivo in MB. */
    val totalRamMb: Long,
    /** True se la RAM libera è sotto la soglia critica di ResourceManager. */
    val isLowRam: Boolean,
    /** Stato corrente del daemon Shizuku. */
    val shizukuStatus: ShizukuStatus,
    /** Percentuale di utilizzo della context window [0.0, 1.0] — calcolata esternamente. */
    val contextWindowUsageFraction: Float = 0f
) {
    val isShizukuActive: Boolean
        get() = shizukuStatus == ShizukuStatus.Available

    /** Stringa di diagnostica compatta da inserire nel system prompt. */
    fun toPromptSection(): String = buildString {
        appendLine("CURRENT DEVICE STATUS (live snapshot):")
        appendLine("  Battery: ${batteryLevelPercent}%${if (isCharging) " (CHARGING)" else ""}${if (isCriticalBattery) " ⚠ CRITICAL" else if (isLowBattery) " ⚠ LOW" else ""}")
        appendLine("  RAM: ${freeRamMb}MB free / ${totalRamMb}MB total${if (isLowRam) " ⚠ LOW" else ""}")
        appendLine("  Shizuku: ${when (shizukuStatus) {
            ShizukuStatus.Available      -> "ACTIVE — shell commands available"
            ShizukuStatus.DaemonNotRunning -> "DISCONNECTED — SettingsTool/ShellTool will fail"
            ShizukuStatus.PermissionDenied -> "RUNNING but UNAUTHORIZED — request permission first"
        }}")
        if (contextWindowUsageFraction > 0f) {
            appendLine("  Context window: ${(contextWindowUsageFraction * 100).toInt()}% used")
        }
    }

    companion object {
        const val BATTERY_CRITICAL_THRESHOLD_PERCENT = 5
        const val BATTERY_LOW_THRESHOLD_PERCENT = 15
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

/**
 * # DeviceStatusProvider
 *
 * Raccoglie dati di stato fisico del dispositivo da sorgenti di sistema:
 * - Batteria: via sticky broadcast [Intent.ACTION_BATTERY_CHANGED]
 * - RAM: via [android.app.ActivityManager.MemoryInfo]
 * - Shizuku: via [ShizukuCommandExecutor.checkStatus]
 *
 * Singleton — le letture sono economiche (nessun I/O pesante, solo binder call).
 * [getStatus] è sospensiva per compatibilità con le coroutine, ma non blocca.
 *
 * ## Perché sticky broadcast per la batteria?
 * `registerReceiver(null, IntentFilter(ACTION_BATTERY_CHANGED))` restituisce
 * immediatamente l'ultimo Intent "appiccicoso" del sistema senza registrare un
 * BroadcastReceiver permanente — zero leak e nessuna callback da gestire.
 */
@Singleton
class DeviceStatusProvider @Inject constructor(
    @ApplicationContext private val context: Context,
    private val shizukuExecutor: ShizukuCommandExecutor
) {
    /**
     * Restituisce uno snapshot dello stato fisico corrente del dispositivo.
     * Chiamare su qualsiasi dispatcher — tutte le operazioni sono non-bloccanti.
     *
     * @param contextWindowUsageFraction  Frazione [0.0, 1.0] dell'utilizzo corrente
     *                                    della context window (calcolato dal chiamante).
     */
    fun getStatus(contextWindowUsageFraction: Float = 0f): DeviceStatus {
        val (batteryLevel, isCharging) = readBattery()
        val (freeRam, totalRam) = readRam()
        val shizukuStatus = shizukuExecutor.checkStatus()

        val isLowBattery = batteryLevel in 0 until DeviceStatus.BATTERY_LOW_THRESHOLD_PERCENT
        val isCriticalBattery = batteryLevel in 0 until DeviceStatus.BATTERY_CRITICAL_THRESHOLD_PERCENT && !isCharging
        val isLowRam = freeRam < ResourceManager.MIN_FREE_RAM_MB

        return DeviceStatus(
            batteryLevelPercent = batteryLevel,
            isCharging = isCharging,
            isLowBattery = isLowBattery,
            isCriticalBattery = isCriticalBattery,
            freeRamMb = freeRam,
            totalRamMb = totalRam,
            isLowRam = isLowRam,
            shizukuStatus = shizukuStatus,
            contextWindowUsageFraction = contextWindowUsageFraction
        )
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private readers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Legge la batteria via sticky broadcast.
     * Non richiede il permesso BATTERY_STATS.
     * @return Pair(livello 0–100, isCharging)
     */
    private fun readBattery(): Pair<Int, Boolean> {
        val intent = context.registerReceiver(
            null,
            IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        ) ?: return Pair(-1, false)

        val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
        val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)

        val batteryPercent = if (level >= 0 && scale > 0) (level * 100 / scale) else -1
        val isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING
                || status == BatteryManager.BATTERY_STATUS_FULL

        return Pair(batteryPercent, isCharging)
    }

    /**
     * Legge la RAM via [android.app.ActivityManager.MemoryInfo].
     * Identico a [ResourceManager.checkMemoryAvailable] ma restituisce solo i valori raw.
     * @return Pair(freeMb, totalMb)
     */
    private fun readRam(): Pair<Long, Long> {
        val am = context.getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
        val info = android.app.ActivityManager.MemoryInfo()
        am.getMemoryInfo(info)
        return Pair(
            info.availMem / (1024L * 1024L),
            info.totalMem / (1024L * 1024L)
        )
    }
}

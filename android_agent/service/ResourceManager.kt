package com.example.agent.service

import android.app.ActivityManager
import android.content.Context
import android.util.Log
import java.io.File

// ─────────────────────────────────────────────────────────────────────────────
// Result type returned by every memory check
// ─────────────────────────────────────────────────────────────────────────────

data class MemoryCheckResult(
    /** False → refuse model activation; True → safe to proceed. */
    val isAvailable: Boolean,
    val availableMb: Long,
    val totalMb: Long,
    /** Human-readable suggestion shown in the notification / UI on failure. */
    val suggestion: String = ""
)

/**
 * # ResourceManager
 *
 * Singleton that monitors system RAM and enforces safe model-loading thresholds.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ## mmap & model loading — architectural note
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **DO NOT** load Gemma weights via `File.readBytes()`, `InputStream.readBytes()`,
 * or any other call that materialises the entire file as a heap-allocated ByteArray.
 * A 2B int4 model is ~1.35 GB; doing so would immediately trigger an OutOfMemoryError
 * and then the OOM killer.
 *
 * **Correct approach — mmap via MediaPipe / LiteRT:**
 * `LlmInference.LlmInferenceOptions.builder().setModelPath(absolutePath)` passes
 * the path directly to the native LiteRT (TFLite) flat-buffer loader, which calls
 * `mmap(fd, MAP_SHARED | MAP_POPULATE)` under the hood. The kernel then:
 *   1. Maps the file into the process's virtual address space (no physical copy).
 *   2. Loads pages on-demand as the CPU/NPU accesses weight tensors during inference.
 *   3. Can evict clean (unmodified) pages under memory pressure and reload from disk —
 *      no data loss, just a minor latency spike on re-access.
 *
 * **JNI / C++ note (if bypassing MediaPipe):**
 * If you need direct control (e.g., for a custom runtime), the equivalent C++ snippet is:
 *
 * ```cpp
 * // model_loader.cpp  — called via JNI
 * #include <sys/mman.h>
 * #include <fcntl.h>
 * #include <sys/stat.h>
 *
 * void* mmapModel(const char* path, size_t* outSize) {
 *     int fd = open(path, O_RDONLY);
 *     if (fd < 0) return nullptr;
 *
 *     struct stat sb{};
 *     fstat(fd, &sb);
 *     *outSize = sb.st_size;
 *
 *     // MAP_SHARED + MAP_POPULATE: pre-fault pages to avoid first-token latency spikes.
 *     // Use MAP_PRIVATE if you need copy-on-write (e.g. weight quantisation at load time).
 *     void* addr = mmap(nullptr, sb.st_size, PROT_READ, MAP_SHARED | MAP_POPULATE, fd, 0);
 *     close(fd);  // fd can be closed after mmap — the mapping persists independently
 *
 *     if (addr == MAP_FAILED) return nullptr;
 *
 *     // Advise the kernel: sequential read pattern → prefetch aggressively
 *     madvise(addr, sb.st_size, MADV_SEQUENTIAL);
 *     return addr;
 * }
 *
 * void unmapModel(void* addr, size_t size) {
 *     if (addr && addr != MAP_FAILED) munmap(addr, size);
 * }
 * ```
 *
 * Register the JNI functions in your `CMakeLists.txt` and call via
 * `System.loadLibrary("agent_native")` + a `@JvmStatic external fun` declaration.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ## Model file location
 * ─────────────────────────────────────────────────────────────────────────────
 * Store model `.bin` files in `Context.filesDir` (internal storage):
 *   - Protected from other apps (no READ_EXTERNAL_STORAGE needed)
 *   - Excluded from backups by default (avoids bloating cloud backup quotas)
 *   - Accessible to native code via the standard file path
 *
 * NEVER place model files in `assets/` — the AssetManager would need to
 * extract them to a temp file first, doubling the disk I/O on first run.
 */
object ResourceManager {

    private const val TAG = "ResourceManager"

    /** Below this threshold, refuse model activation entirely. */
    const val MIN_FREE_RAM_MB = 1536L       // 1.5 GB

    /** Below this threshold, allow activation but warn + suggest int4. */
    const val WARN_FREE_RAM_MB = 2048L      // 2.0 GB

    /** Estimated KV-cache + activation buffer overhead during inference. */
    private const val INFERENCE_OVERHEAD_MB = 512L

    // ─────────────────────────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Queries [ActivityManager.MemoryInfo] for current system RAM availability.
     *
     * [ActivityManager.MemoryInfo.availMem] returns the amount of memory the kernel
     * considers "available" — this includes file-cache pages that can be reclaimed
     * instantly, making it a more accurate signal than `/proc/meminfo MemFree`.
     *
     * [ActivityManager.MemoryInfo.lowMemory] is the kernel's own low-memory flag;
     * if true, the LMK is already running and we must not start inference.
     */
    fun checkMemoryAvailable(context: Context): MemoryCheckResult {
        val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val info = ActivityManager.MemoryInfo()
        am.getMemoryInfo(info)

        val availMb = info.availMem / (1024L * 1024L)
        val totalMb = info.totalMem / (1024L * 1024L)
        val thresholdMb = info.threshold / (1024L * 1024L)

        Log.d(TAG, "RAM: ${availMb}MB avail / ${totalMb}MB total | " +
                "LMK threshold: ${thresholdMb}MB | lowMemory=${info.lowMemory}")

        return when {
            info.lowMemory || availMb < MIN_FREE_RAM_MB -> MemoryCheckResult(
                isAvailable = false,
                availableMb = availMb,
                totalMb = totalMb,
                suggestion = buildString {
                    append("RAM insufficiente: ${availMb}MB liberi (minimo: ${MIN_FREE_RAM_MB}MB). ")
                    append("Chiudi le app in background e riprova. ")
                    if (totalMb < 4096) append("Considera di usare il modello Gemma 2B int4 (~1.35GB).")
                }
            )

            availMb < WARN_FREE_RAM_MB -> MemoryCheckResult(
                isAvailable = true,
                availableMb = availMb,
                totalMb = totalMb,
                suggestion = "Memoria limitata (${availMb}MB). " +
                        "Per migliori prestazioni usa Gemma 2B int4 che richiede ~1.35GB."
            )

            else -> MemoryCheckResult(
                isAvailable = true,
                availableMb = availMb,
                totalMb = totalMb
            )
        }
    }

    /**
     * Checks whether there is enough free RAM to load a specific model file,
     * accounting for both the model's mmap footprint and the inference overhead buffer.
     *
     * Note: for mmap'd files the "cost" is virtual address space + resident pages,
     * not a full physical allocation. However, we conservatively budget the full
     * file size to avoid starvation under heavy access patterns.
     */
    fun canLoadModel(context: Context, modelPath: String): MemoryCheckResult {
        val modelMb = estimateModelFootprintMb(modelPath)
        val requiredMb = modelMb + INFERENCE_OVERHEAD_MB

        val base = checkMemoryAvailable(context)
        return if (!base.isAvailable) {
            base
        } else if (base.availableMb < requiredMb) {
            base.copy(
                isAvailable = false,
                suggestion = "Il modello richiede ~${requiredMb}MB " +
                        "(${modelMb}MB pesi mmap + ${INFERENCE_OVERHEAD_MB}MB KV-cache). " +
                        "Disponibili: ${base.availableMb}MB. " +
                        "Usa Gemma 2B int4 o chiudi app in background."
            )
        } else {
            base
        }
    }

    /**
     * Returns the on-disk size of the model file in MB.
     * For mmap, this approximates the maximum resident set size under full access.
     */
    fun estimateModelFootprintMb(modelPath: String): Long {
        val file = File(modelPath)
        return if (file.exists()) file.length() / (1024L * 1024L) else 0L
    }

    /**
     * Best-effort memory release.
     *
     * Sends GC hints to the JVM. Has NO effect on mmap'd native pages
     * (those are managed by the kernel page cache, not the JVM GC).
     *
     * For a more aggressive reclaim, the user should clear background apps.
     * We surface this advice via [MemoryCheckResult.suggestion].
     */
    fun requestMemoryRelease() {
        Runtime.getRuntime().gc()
        System.gc()
        Log.d(TAG, "GC hint sent. Note: mmap pages are kernel-managed — GC does not affect them.")
    }

    /**
     * Returns a human-readable memory report for display in the debug UI or logs.
     */
    fun getMemoryReport(context: Context): String {
        val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val info = ActivityManager.MemoryInfo()
        am.getMemoryInfo(info)

        val availMb = info.availMem / (1024L * 1024L)
        val totalMb = info.totalMem / (1024L * 1024L)
        val usedMb = totalMb - availMb

        val runtime = Runtime.getRuntime()
        val jvmUsedMb = (runtime.totalMemory() - runtime.freeMemory()) / (1024L * 1024L)
        val jvmMaxMb = runtime.maxMemory() / (1024L * 1024L)

        return buildString {
            appendLine("=== Memory Report ===")
            appendLine("System: ${availMb}MB free / ${totalMb}MB total (${usedMb}MB used)")
            appendLine("JVM heap: ${jvmUsedMb}MB used / ${jvmMaxMb}MB max")
            appendLine("Low memory flag: ${info.lowMemory}")
            appendLine("LMK threshold: ${info.threshold / (1024L * 1024L)}MB")
        }
    }
}

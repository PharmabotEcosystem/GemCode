package com.example.agent

import org.junit.Assert.*
import org.junit.Test

/**
 * Integrity checks for [AVAILABLE_MODELS].
 *
 * These tests guard against common catalog regressions:
 *  - Re-introducing broken Google Storage URLs that 404
 *  - Adding on-device models without a download URL or size
 *  - Duplicating model names
 *  - Server-mode entries growing a URL/filename by mistake
 *
 * They do NOT make network requests.
 */
class AvailableModelsIntegrityTest {

    // ─────────────────────────────────────────────────────────────────────────
    // Basic sanity
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    fun `AVAILABLE_MODELS is not empty`() {
        assertTrue("AVAILABLE_MODELS must not be empty", AVAILABLE_MODELS.isNotEmpty())
    }

    @Test
    fun `all model names are unique`() {
        val names = AVAILABLE_MODELS.map { it.name }
        val distinct = names.distinct()
        assertEquals(
            "Duplicate model names found: ${names - distinct.toSet()}",
            distinct.size,
            names.size
        )
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Forbidden Google Storage URLs (they all 404)
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    fun `no model uses storage googleapis com URLs`() {
        val badModels = AVAILABLE_MODELS.filter {
            it.url.contains("storage.googleapis.com")
        }
        assertTrue(
            "Models using forbidden Google Storage URLs: ${badModels.map { it.name }}",
            badModels.isEmpty()
        )
    }

    @Test
    fun `no model uses mediapipe-models bucket`() {
        val badModels = AVAILABLE_MODELS.filter {
            it.url.contains("mediapipe-models")
        }
        assertTrue(
            "Models using forbidden mediapipe-models bucket: ${badModels.map { it.name }}",
            badModels.isEmpty()
        )
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Server-mode backends (LM_STUDIO, OLLAMA)
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    fun `server mode models have blank url`() {
        val serverModels = AVAILABLE_MODELS.filter {
            it.backend == ModelBackend.LM_STUDIO || it.backend == ModelBackend.OLLAMA
        }
        val withUrl = serverModels.filter { it.url.isNotBlank() }
        assertTrue(
            "Server-mode models must not have a URL: ${withUrl.map { it.name }}",
            withUrl.isEmpty()
        )
    }

    @Test
    fun `server mode models have blank filename`() {
        val serverModels = AVAILABLE_MODELS.filter {
            it.backend == ModelBackend.LM_STUDIO || it.backend == ModelBackend.OLLAMA
        }
        val withFilename = serverModels.filter { it.filename.isNotBlank() }
        assertTrue(
            "Server-mode models must not have a filename: ${withFilename.map { it.name }}",
            withFilename.isEmpty()
        )
    }

    @Test
    fun `server mode models have zero fileSizeMb`() {
        val serverModels = AVAILABLE_MODELS.filter {
            it.backend == ModelBackend.LM_STUDIO || it.backend == ModelBackend.OLLAMA
        }
        val withSize = serverModels.filter { it.fileSizeMb != 0 }
        assertTrue(
            "Server-mode models must declare fileSizeMb = 0: ${withSize.map { it.name }}",
            withSize.isEmpty()
        )
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Downloadable on-device models (LITERT, MEDIAPIPE)
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    fun `downloadable models have non-blank url`() {
        val onDevice = AVAILABLE_MODELS.filter {
            it.backend == ModelBackend.LITERT || it.backend == ModelBackend.MEDIAPIPE
        }
        val missingUrl = onDevice.filter { it.url.isBlank() }
        assertTrue(
            "On-device models must have a download URL: ${missingUrl.map { it.name }}",
            missingUrl.isEmpty()
        )
    }

    @Test
    fun `downloadable models have non-blank filename`() {
        val onDevice = AVAILABLE_MODELS.filter {
            it.backend == ModelBackend.LITERT || it.backend == ModelBackend.MEDIAPIPE
        }
        val missingFilename = onDevice.filter { it.filename.isBlank() }
        assertTrue(
            "On-device models must have a filename: ${missingFilename.map { it.name }}",
            missingFilename.isEmpty()
        )
    }

    @Test
    fun `downloadable models have positive fileSizeMb`() {
        val onDevice = AVAILABLE_MODELS.filter {
            it.backend == ModelBackend.LITERT || it.backend == ModelBackend.MEDIAPIPE
        }
        val zeroSize = onDevice.filter { it.fileSizeMb <= 0 }
        assertTrue(
            "On-device models must declare a positive fileSizeMb: ${zeroSize.map { it.name }}",
            zeroSize.isEmpty()
        )
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LITERT-specific: HuggingFace + .litertlm extension
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    fun `LITERT models download from huggingface litert-community`() {
        val litert = AVAILABLE_MODELS.filter { it.backend == ModelBackend.LITERT }
        val notHuggingFace = litert.filter {
            !it.url.contains("huggingface.co/litert-community")
        }
        assertTrue(
            "LITERT models must use huggingface.co/litert-community: ${notHuggingFace.map { it.name }}",
            notHuggingFace.isEmpty()
        )
    }

    @Test
    fun `LITERT model filenames end with litertlm extension`() {
        val litert = AVAILABLE_MODELS.filter { it.backend == ModelBackend.LITERT }
        val badExt = litert.filter { !it.filename.endsWith(".litertlm") }
        assertTrue(
            "LITERT filenames must end with .litertlm: ${badExt.map { it.name }}",
            badExt.isEmpty()
        )
    }

    @Test
    fun `LITERT model urls point to litertlm files`() {
        val litert = AVAILABLE_MODELS.filter { it.backend == ModelBackend.LITERT }
        val badUrl = litert.filter { !it.url.contains(".litertlm") }
        assertTrue(
            "LITERT download URLs must reference a .litertlm file: ${badUrl.map { it.name }}",
            badUrl.isEmpty()
        )
    }

    @Test
    fun `no model url ends with task or bin legacy mediapipe extensions`() {
        // Guard against accidentally re-adding old MediaPipe model formats
        val legacyExtensions = listOf(".task", ".bin")
        val badModels = AVAILABLE_MODELS.filter { model ->
            legacyExtensions.any { ext -> model.url.substringBefore("?").endsWith(ext) }
        }
        assertTrue(
            "Models using deprecated .task/.bin URLs: ${badModels.map { it.name }}",
            badModels.isEmpty()
        )
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CPU/GPU pairing — every GPU model should have a matching CPU counterpart
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    fun `every GPU model has a corresponding CPU counterpart`() {
        val gpuModels = AVAILABLE_MODELS.filter { it.useGpu }
        val gpuBaseNames = gpuModels.map { it.name.replace(" (GPU)", "") }

        val cpuNames = AVAILABLE_MODELS.filter { !it.useGpu }.map { it.name }

        val missingCpu = gpuBaseNames.filter { baseName ->
            "$baseName (CPU)" !in cpuNames
        }
        assertTrue(
            "GPU models without a CPU counterpart: $missingCpu",
            missingCpu.isEmpty()
        )
    }

    @Test
    fun `CPU and GPU variants of the same model share the same url`() {
        val cpuModels  = AVAILABLE_MODELS.filter { !it.useGpu && it.backend == ModelBackend.LITERT }
        val gpuModels  = AVAILABLE_MODELS.filter {  it.useGpu && it.backend == ModelBackend.LITERT }

        for (gpu in gpuModels) {
            val baseName = gpu.name.replace(" (GPU)", "")
            val cpu = cpuModels.find { it.name == "$baseName (CPU)" } ?: continue
            assertEquals(
                "CPU and GPU variant of '$baseName' must share the same download URL",
                cpu.url, gpu.url
            )
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Presence of required backends
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    fun `catalog contains at least one OLLAMA entry`() {
        assertTrue(
            "Catalog must include at least one OLLAMA server model",
            AVAILABLE_MODELS.any { it.backend == ModelBackend.OLLAMA }
        )
    }

    @Test
    fun `catalog contains at least one LM_STUDIO entry`() {
        assertTrue(
            "Catalog must include at least one LM_STUDIO server model",
            AVAILABLE_MODELS.any { it.backend == ModelBackend.LM_STUDIO }
        )
    }

    @Test
    fun `catalog contains at least one LITERT on-device model`() {
        assertTrue(
            "Catalog must include at least one on-device LITERT model",
            AVAILABLE_MODELS.any { it.backend == ModelBackend.LITERT }
        )
    }
}

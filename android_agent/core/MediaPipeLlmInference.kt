package com.example.agent.core

import android.content.Context
import android.util.Log
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/**
 * Motore di inferenza LLM locale basato su MediaPipe Tasks GenAI.
 *
 * Supporta tutti i modelli distribuiti da Google AI Edge in formato `.bin` (Gemma 2B legacy)
 * e `.task` (Gemma 3 / Gemma 4 e successivi).
 *
 * ## Backend
 * - [useGpu] = false → CPU (universale, richiede ~30% RAM in più vs GPU path)
 * - [useGpu] = true  → GPU via OpenCL/OpenGL (API 29+); fallback automatico a CPU
 *   se la GPU del dispositivo non supporta il modello richiesto.
 *
 * ## mmap safety
 * `setModelPath()` attiva `mmap(MAP_SHARED | MAP_POPULATE)` nel layer nativo LiteRT.
 * I pesi NON vengono mai copiati nell'heap JVM — nessun rischio OOM da ByteArray.
 *
 * @param modelPath  Percorso assoluto del file modello (`.bin` o `.task`)
 * @param useGpu     True per richiedere accelerazione GPU (fallback CPU automatico)
 * @param maxTokens  Finestra di contesto massima in token (Gemma 2B: 1024; Gemma 3/4: 8192)
 */
class MediaPipeLlmInference(
    private val context: Context,
    private val modelPath: String,
    private val useGpu: Boolean = false,
    private val maxTokens: Int = 1024
) : LlmInferenceWrapper, AutoCloseable {

    private var llmInference: LlmInference? = null

    init {
        val modelFile = File(modelPath)
        if (!modelFile.exists()) {
            Log.w(TAG, "Model file not found at: $modelPath")
        } else {
            try {
                val optionsBuilder = LlmInference.LlmInferenceOptions.builder()
                    .setModelPath(modelPath)
                    .setMaxTokens(maxTokens)

                if (useGpu) {
                    try {
                        // GPU backend via OpenCL/OpenGL — richiede API 29+ e driver compatibili.
                        // Se la GPU non supporta il modello, MediaPipe lancia un'eccezione
                        // che intercettiamo qui per fare fallback a CPU.
                        optionsBuilder.setPreferredBackend(LlmInference.Backend.GPU)
                        Log.d(TAG, "GPU backend requested for: $modelPath")
                    } catch (e: NoSuchMethodError) {
                        // Versione della libreria troppo vecchia per supportare setPreferredBackend
                        Log.w(TAG, "setPreferredBackend not available in this tasks-genai version, using CPU")
                    }
                }

                llmInference = LlmInference.createFromOptions(context, optionsBuilder.build())
                Log.i(TAG, "Model loaded successfully: ${modelFile.name} " +
                        "(backend=${if (useGpu) "GPU" else "CPU"}, maxTokens=$maxTokens)")

            } catch (gpuException: Exception) {
                if (useGpu) {
                    // GPU fallback: riprova con CPU prima di arrendersi
                    Log.w(TAG, "GPU initialization failed (${gpuException.message}), retrying with CPU")
                    try {
                        val cpuOptions = LlmInference.LlmInferenceOptions.builder()
                            .setModelPath(modelPath)
                            .setMaxTokens(maxTokens)
                            .build()
                        llmInference = LlmInference.createFromOptions(context, cpuOptions)
                        Log.i(TAG, "Model loaded on CPU fallback: ${modelFile.name}")
                    } catch (cpuException: Exception) {
                        Log.e(TAG, "CPU fallback also failed: ${cpuException.message}")
                    }
                } else {
                    Log.e(TAG, "Failed to initialize model: ${gpuException.message}")
                }
            }
        }
    }

    override suspend fun generateResponse(prompt: String): String = withContext(Dispatchers.IO) {
        val inference = llmInference
            ?: return@withContext "Error: Local model not initialized. File not found or failed to load: $modelPath"
        try {
            // generateResponse è una chiamata bloccante — eseguita su Dispatchers.IO
            inference.generateResponse(prompt)
        } catch (e: Exception) {
            Log.e(TAG, "Inference error: ${e.message}")
            "Error generating response: ${e.message}"
        }
    }

    /** Rilascia le risorse native del motore di inferenza. */
    override fun close() {
        try {
            llmInference?.close()
        } catch (_: Exception) { }
        llmInference = null
    }

    private companion object {
        const val TAG = "MediaPipeLlm"
    }
}

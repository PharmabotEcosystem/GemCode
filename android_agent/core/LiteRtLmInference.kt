package com.example.agent.core

import android.content.Context
import android.util.Log
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Conversation
import com.google.ai.edge.litertlm.ConversationConfig
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import com.google.ai.edge.litertlm.SamplerConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/**
 * Motore di inferenza LLM locale basato su Google LiteRT-LM.
 *
 * Questo è il successore di [MediaPipeLlmInference] ed è necessario per eseguire
 * i modelli Gemma 4 (formato `.litertlm`). La MediaPipe LLM Inference API è
 * deprecata e non supporta Gemma 4.
 *
 * ## Modelli supportati
 * - Gemma 4 E2B IT (`gemma-4-E2B-it.litertlm`, ~2.6 GB)
 * - Gemma 4 E4B IT (`gemma-4-E4B-it.litertlm`, ~3.7 GB)
 * - Qualsiasi modello nel formato `.litertlm` da Google AI Edge
 *
 * ## Backend
 * - [useGpu] = false → CPU (sempre disponibile)
 * - [useGpu] = true  → GPU via OpenCL, fallback automatico a CPU se non supportato
 * - [useNpu] = true  → NPU (Qualcomm, MediaTek) — richiede librerie native nel dispositivo
 *
 * ## Architettura conversazione
 * LiteRT-LM gestisce la history multi-turn tramite l'oggetto [Conversation].
 * Poiché [AgentLoop] costruisce il prompt completo (Constitution + history + tools)
 * come singola stringa, creiamo una nuova [Conversation] per ogni inferenza.
 * Questo mantiene la compatibilità con l'interfaccia [LlmInferenceWrapper] senza
 * modificare [AgentLoop].
 *
 * @param modelPath  Percorso assoluto del file `.litertlm` su disco
 * @param useGpu     Richiede backend GPU (fallback CPU automatico se non supportato)
 * @param useNpu     Richiede backend NPU — mutualmente esclusivo con [useGpu]
 * @param temperature Temperatura del sampler (0.0 = deterministic, 1.0 = creative)
 */
class LiteRtLmInference(
    private val context: Context,
    private val modelPath: String,
    private val useGpu: Boolean = false,
    private val useNpu: Boolean = false,
    private val temperature: Float = 0.7f
) : LlmInferenceWrapper, AutoCloseable {

    private var engine: Engine? = null

    init {
        val modelFile = File(modelPath)
        if (!modelFile.exists()) {
            Log.w(TAG, "Model file not found: $modelPath")
        } else {
            initializeEngine()
        }
    }

    private fun initializeEngine() {
        val backend = selectBackend()
        try {
            engine = buildEngine(backend)
            Log.i(TAG, "LiteRT-LM engine ready: ${File(modelPath).name} " +
                    "(backend=${backendLabel()}, temperature=$temperature)")
        } catch (e: Exception) {
            if (useGpu || useNpu) {
                // Fallback a CPU se il backend accelerato non è disponibile sul dispositivo
                Log.w(TAG, "${backendLabel()} init failed (${e.message}), falling back to CPU")
                try {
                    engine = buildEngine(Backend.CPU())
                    Log.i(TAG, "LiteRT-LM CPU fallback ready: ${File(modelPath).name}")
                } catch (cpuEx: Exception) {
                    Log.e(TAG, "CPU fallback failed: ${cpuEx.message}")
                }
            } else {
                Log.e(TAG, "Failed to initialize LiteRT-LM engine: ${e.message}")
            }
        }
    }

    private fun selectBackend(): Backend = when {
        useNpu -> Backend.NPU(context.applicationInfo.nativeLibraryDir)
        useGpu -> Backend.GPU()
        else   -> Backend.CPU()
    }

    private fun buildEngine(backend: Backend): Engine {
        val config = EngineConfig(
            modelPath = modelPath,
            backend = backend,
            // Cache accelera i caricamenti successivi su disco (solo metadati, non i pesi)
            cacheDir = context.cacheDir.absolutePath
        )
        return Engine(config).apply {
            // initialize() è bloccante (~5-15 sec per mmap del modello)
            // Viene chiamato qui nell'init del costruttore su qualsiasi thread il chiamante
            // usi. AgentOrchestrator chiama loadModel() su Dispatchers.IO — corretto.
            initialize()
        }
    }

    /**
     * Genera una risposta al [prompt] usando LiteRT-LM.
     *
     * Crea una nuova [Conversation] per ogni chiamata così che [AgentLoop] possa
     * gestire autonomamente la history passando il prompt completo costruito.
     * La chiamata è sospendente e blocca il thread IO fino al completamento.
     */
    override suspend fun generateResponse(prompt: String): String = withContext(Dispatchers.IO) {
        val e = engine
            ?: return@withContext "Error: LiteRT-LM engine not initialized. " +
                    "Model not found or failed to load: $modelPath"
        try {
            val convConfig = ConversationConfig(
                samplerConfig = SamplerConfig(temperature = temperature)
            )
            e.createConversation(convConfig).use { conversation ->
                val response = conversation.sendMessage(prompt)
                // La risposta è un oggetto Message. Tentiamo prima .text (shortcut per
                // risposte solo-testo), poi toString() come fallback universale.
                extractText(response)
            }
        } catch (ex: Exception) {
            Log.e(TAG, "Inference error: ${ex.message}", ex)
            "Error generating response: ${ex.message}"
        }
    }

    /**
     * Estrae la stringa di testo da un oggetto Message di LiteRT-LM.
     * L'API v0.10.0 espone `.text` come property String sull'oggetto Message.
     */
    private fun extractText(message: Any?): String {
        if (message == null) return "Error: null response from LiteRT-LM"
        return try {
            // Tentativo 1: property .text (API standard LiteRT-LM 0.10.0)
            val textProp = message::class.java.getMethod("getText")
            (textProp.invoke(message) as? String)?.takeIf { it.isNotBlank() }
                ?: message.toString()
        } catch (_: Exception) {
            // Fallback: toString() — mai restituisce null
            message.toString().takeIf { it.isNotBlank() } ?: "Error: empty response"
        }
    }

    override fun close() {
        try { engine?.close() } catch (_: Exception) {}
        engine = null
    }

    private fun backendLabel(): String = when {
        useNpu -> "NPU"
        useGpu -> "GPU"
        else   -> "CPU"
    }

    private companion object {
        const val TAG = "LiteRtLmInference"
    }
}

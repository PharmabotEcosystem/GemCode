package com.example.agent.core

import android.content.Context
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

class MediaPipeLlmInference(private val context: Context, private val modelPath: String) : LlmInferenceWrapper {
    private var llmInference: LlmInference? = null

    init {
        if (File(modelPath).exists()) {
            try {
                val options = LlmInference.LlmInferenceOptions.builder()
                    .setModelPath(modelPath)
                    .setMaxTokens(1024)
                    .build()
                llmInference = LlmInference.createFromOptions(context, options)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    override suspend fun generateResponse(prompt: String): String = withContext(Dispatchers.IO) {
        val inference = llmInference ?: return@withContext "Error: Local model not initialized or not found at $modelPath"
        try {
            // MediaPipe generateResponse is a blocking call, so we run it in Dispatchers.IO
            inference.generateResponse(prompt)
        } catch (e: Exception) {
            "Error generating response: ${e.message}"
        }
    }
}

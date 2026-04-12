package com.example.agent.core

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

/**
 * Connettore al server LM Studio locale tramite API OpenAI-compatibile.
 *
 * LM Studio espone un server HTTP su porta 1234 con endpoint `/v1/chat/completions`
 * compatibile con OpenAI. Il modello GGUF (es. Gemma 4 E2B) gira sul PC e il
 * dispositivo Android si connette via rete locale (WiFi).
 *
 * @param serverUrl  URL base del server LM Studio, es: `http://192.168.1.100:1234`
 * @param modelName  Nome del modello caricato in LM Studio (vuoto = usa quello
 *                   correntemente attivo nello studio)
 */
class LmStudioLlmInference(
    private val serverUrl: String,
    private val modelName: String = "",
) : LlmInferenceWrapper {

    override suspend fun generateResponse(prompt: String): String = withContext(Dispatchers.IO) {
        try {
            val url = URL("$serverUrl/v1/chat/completions")
            val connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "POST"
            connection.setRequestProperty("Content-Type", "application/json")
            connection.doOutput = true
            connection.connectTimeout = 10_000
            connection.readTimeout   = 180_000

            val messages = JSONArray().put(
                JSONObject().put("role", "user").put("content", prompt)
            )
            val body = JSONObject().apply {
                if (modelName.isNotBlank()) put("model", modelName)
                put("messages", messages)
                put("temperature", 0.7)
                put("max_tokens", -1)   // -1 = usa il max del modello caricato
                put("stream", false)
            }

            OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use {
                it.write(body.toString())
            }

            if (connection.responseCode == HttpURLConnection.HTTP_OK) {
                val resp = connection.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
                JSONObject(resp)
                    .getJSONArray("choices")
                    .getJSONObject(0)
                    .getJSONObject("message")
                    .getString("content")
                    .trim()
            } else {
                val err = connection.errorStream?.bufferedReader()?.use { it.readText() }
                Log.e(TAG, "LM Studio HTTP ${connection.responseCode}: $err")
                "Errore: LM Studio ha risposto con HTTP ${connection.responseCode}. " +
                        "Assicurati che il server sia avviato e abbia un modello caricato."
            }
        } catch (e: Exception) {
            Log.e(TAG, "LM Studio connection error: ${e.message}", e)
            "Errore: impossibile raggiungere LM Studio su $serverUrl — ${e.message}\n" +
                    "Verifica che:\n" +
                    "• LM Studio sia aperto e un modello sia caricato\n" +
                    "• Il server locale sia attivo (pulsante ▶ in LM Studio)\n" +
                    "• Il dispositivo Android sia sulla stessa rete WiFi del PC\n" +
                    "• L'indirizzo IP del PC sia corretto nell'app"
        }
    }

    private companion object {
        const val TAG = "LmStudioLlmInference"
    }
}

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
    private val connectTimeoutMs: Int = 10_000,
    private val readTimeoutMs: Int = 180_000,
) : LlmInferenceWrapper {

    override suspend fun generateResponse(prompt: String): String = withContext(Dispatchers.IO) {
        val connection = (URL("$serverUrl/v1/chat/completions").openConnection() as HttpURLConnection)
            .also { conn ->
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json")
                conn.doOutput = true
                conn.connectTimeout = connectTimeoutMs
                conn.readTimeout    = readTimeoutMs
            }
        try {
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

            // Flush without closing so we can read the response code even if the
            // server sends an early error and closes the connection (broken pipe on
            // close() would otherwise swallow the HTTP status).
            connection.outputStream.bufferedWriter(Charsets.UTF_8).apply {
                write(body.toString())
                flush()
            }

            val code = connection.responseCode
            if (code == HttpURLConnection.HTTP_OK) {
                val resp = connection.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
                JSONObject(resp)
                    .getJSONArray("choices")
                    .getJSONObject(0)
                    .getJSONObject("message")
                    .getString("content")
                    .trim()
            } else {
                val err = connection.errorStream?.bufferedReader()?.use { it.readText() }
                Log.e(TAG, "LM Studio HTTP $code: $err")
                "Errore: LM Studio ha risposto con HTTP $code. " +
                        "Assicurati che il server sia avviato e abbia un modello caricato."
            }
        } catch (e: java.io.IOException) {
            // Broken pipe / early close: server sent an error status before we could finish
            // writing the request body. Try to recover the HTTP status from the response.
            val code = runCatching { connection.responseCode }.getOrNull()
            if (code != null && code != HttpURLConnection.HTTP_OK) {
                Log.e(TAG, "LM Studio HTTP $code (recovered from IOException)")
                "Errore: LM Studio ha risposto con HTTP $code. " +
                        "Assicurati che il server sia avviato e abbia un modello caricato."
            } else {
                Log.e(TAG, "LM Studio IO error: ${e.message}", e)
                "Errore: impossibile raggiungere LM Studio su $serverUrl — ${e.message}\n" +
                        "Verifica che:\n" +
                        "• LM Studio sia aperto e un modello sia caricato\n" +
                        "• Il server locale sia attivo (pulsante ▶ in LM Studio)\n" +
                        "• Il dispositivo Android sia sulla stessa rete WiFi del PC\n" +
                        "• L'indirizzo IP del PC sia corretto nell'app"
            }
        } catch (e: Exception) {
            // Non-network errors (JSON parsing, unexpected runtime exceptions, etc.)
            Log.e(TAG, "LM Studio error: ${e.message}", e)
            "Errore: impossibile raggiungere LM Studio su $serverUrl — ${e.message}\n" +
                    "Verifica che:\n" +
                    "• LM Studio sia aperto e un modello sia caricato\n" +
                    "• Il server locale sia attivo (pulsante ▶ in LM Studio)\n" +
                    "• Il dispositivo Android sia sulla stessa rete WiFi del PC\n" +
                    "• L'indirizzo IP del PC sia corretto nell'app"
        } finally {
            connection.disconnect()
        }
    }

    private companion object {
        const val TAG = "LmStudioLlmInference"
    }
}

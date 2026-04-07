package com.example.agent.service

import android.util.Log
import com.example.agent.core.LlmInferenceWrapper
import fi.iki.elonen.NanoHTTPD
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject

/**
 * Server HTTP locale che espone un'API compatibile con Ollama.
 *
 * Il browser (web frontend) chiama questo server esattamente come chiamarebbe
 * Ollama — nessuna modifica al frontend è necessaria, basta impostare l'host
 * nelle impostazioni del browser sull'IP del dispositivo Android.
 *
 * ## Endpoint
 *
 * | Method | Path       | Descrizione                              |
 * |--------|------------|------------------------------------------|
 * | GET    | /api/tags  | Restituisce la lista dei modelli (mock)  |
 * | POST   | /api/chat  | Esegue inferenza con Gemma 4             |
 * | OPTIONS| *          | CORS preflight per richieste browser     |
 *
 * ## Formato richiesta /api/chat (Ollama-compatible)
 * ```json
 * {
 *   "model": "gemma4",
 *   "messages": [
 *     { "role": "system",    "content": "..." },
 *     { "role": "user",      "content": "..." },
 *     { "role": "assistant", "content": "..." }
 *   ],
 *   "stream": false
 * }
 * ```
 *
 * ## Formato risposta
 * ```json
 * { "model": "gemma4", "message": { "role": "assistant", "content": "..." }, "done": true }
 * ```
 *
 * ## Note su CORS
 * Le richieste browser da `http://localhost:5173` (Vite dev) o qualsiasi altra
 * origine sono accettate tramite `Access-Control-Allow-Origin: *`.
 *
 * @param port         Porta TCP su cui ascoltare (default 8080)
 * @param llmInference Engine di inferenza locale (LiteRtLmInference / MediaPipeLlmInference)
 */
class InferenceHttpServer(
    private val port: Int = DEFAULT_PORT,
    private val llmInference: LlmInferenceWrapper,
) : NanoHTTPD(port) {

    override fun start() {
        super.start(SOCKET_READ_TIMEOUT, false /* daemon thread = false → sopravvive all'Activity */)
        Log.i(TAG, "Inference HTTP server started on port $port")
    }

    override fun stop() {
        super.stop()
        Log.i(TAG, "Inference HTTP server stopped")
    }

    override fun serve(session: IHTTPSession): Response {
        // CORS preflight
        if (session.method == Method.OPTIONS) {
            return corsResponse(Response.Status.OK, MIME_JSON, "{}")
        }
        return try {
            when {
                session.uri == "/api/tags" && session.method == Method.GET ->
                    handleTags()

                session.uri == "/api/chat" && session.method == Method.POST ->
                    handleChat(session)

                else ->
                    corsResponse(
                        Response.Status.NOT_FOUND,
                        MIME_JSON,
                        """{"error":"endpoint not found: ${session.method} ${session.uri}"}"""
                    )
            }
        } catch (e: Exception) {
            Log.e(TAG, "Request error: ${e.message}", e)
            corsResponse(
                Response.Status.INTERNAL_ERROR,
                MIME_JSON,
                """{"error":${JSONObject.quote(e.message ?: "internal error")}}"""
            )
        }
    }

    // ── /api/tags — restituisce i modelli disponibili ─────────────────────────

    private fun handleTags(): Response {
        val body = JSONObject().apply {
            put("models", JSONArray().apply {
                put(JSONObject().apply {
                    put("name", "gemma4")
                    put("model", "gemma4")
                    put("details", JSONObject().apply {
                        put("family", "gemma")
                        put("parameter_size", "E4B")
                        put("quantization_level", "LiteRT-LM")
                    })
                })
            })
        }
        return corsResponse(Response.Status.OK, MIME_JSON, body.toString())
    }

    // ── /api/chat — inferenza Gemma 4 ─────────────────────────────────────────

    private fun handleChat(session: IHTTPSession): Response {
        // Legge il body POST
        val bodyMap = mutableMapOf<String, String>()
        session.parseBody(bodyMap)
        val rawBody = bodyMap["postData"] ?: bodyMap.values.firstOrNull() ?: ""

        if (rawBody.isBlank()) {
            return corsResponse(
                Response.Status.BAD_REQUEST, MIME_JSON, """{"error":"empty request body"}"""
            )
        }

        val json = JSONObject(rawBody)
        val messages = json.optJSONArray("messages") ?: JSONArray()

        // Costruisce il prompt concatenando i messaggi nella forma attesa da Gemma
        val promptBuilder = StringBuilder()
        for (i in 0 until messages.length()) {
            val msg = messages.getJSONObject(i)
            val role    = msg.optString("role",    "user")
            val content = msg.optString("content", "")
            when (role) {
                "system"    -> promptBuilder.append("<start_of_turn>system\n$content<end_of_turn>\n")
                "user"      -> promptBuilder.append("<start_of_turn>user\n$content<end_of_turn>\n")
                "assistant" -> promptBuilder.append("<start_of_turn>model\n$content<end_of_turn>\n")
            }
        }
        promptBuilder.append("<start_of_turn>model\n")

        // Inferenza locale — bloccante (NanoHTTPD ha un thread pool proprio)
        val responseText = runBlocking {
            llmInference.generateResponse(promptBuilder.toString())
        }

        // Risposta in formato Ollama
        val responseJson = JSONObject().apply {
            put("model",   json.optString("model", "gemma4"))
            put("message", JSONObject().apply {
                put("role",    "assistant")
                put("content", responseText)
            })
            put("done", true)
        }

        return corsResponse(Response.Status.OK, MIME_JSON, responseJson.toString())
    }

    // ── CORS helpers ──────────────────────────────────────────────────────────

    private fun corsResponse(status: Response.Status, mimeType: String, body: String): Response =
        newFixedLengthResponse(status, mimeType, body).apply {
            addHeader("Access-Control-Allow-Origin",  "*")
            addHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            addHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
        }

    companion object {
        const val DEFAULT_PORT = 8080
        private const val TAG  = "InferenceHttpServer"
        private const val MIME_JSON = "application/json"
        private const val SOCKET_READ_TIMEOUT = 5000 // ms
    }
}

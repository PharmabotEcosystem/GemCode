package com.example.agent.service

import android.util.Log
import com.example.agent.core.LlmInferenceWrapper
import io.ktor.http.ContentType
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.application.install
import io.ktor.server.cio.CIO
import io.ktor.server.engine.ApplicationEngine
import io.ktor.server.engine.embeddedServer
import io.ktor.server.plugins.cors.routing.CORS
import io.ktor.server.request.receiveText
import io.ktor.server.response.respondText
import io.ktor.server.routing.get
import io.ktor.server.routing.options
import io.ktor.server.routing.post
import io.ktor.server.routing.routing
import org.json.JSONArray
import org.json.JSONObject

/**
 * Server HTTP locale basato su Ktor che espone un'API asincrona compatibile con Ollama.
 *
 * Il browser (web frontend) chiama questo server esattamente come chiamarebbe
 * Ollama — nessuna modifica al frontend è necessaria. Essendo basato su Ktor CIO,
 * il server è completamente asincrono e non blocca il thread di rete durante l'inferenza.
 *
 * @param port         Porta TCP su cui ascoltare (default 8080)
 * @param llmInference Engine di inferenza locale (LiteRtLmInference / MediaPipeLlmInference)
 */
class InferenceHttpServer(
    private val port: Int = DEFAULT_PORT,
    private val llmInference: LlmInferenceWrapper,
) {
    private var server: ApplicationEngine? = null

    fun start() {
        if (server != null) return

        server = embeddedServer(CIO, port = port) {
            install(CORS) {
                anyHost()
                allowMethod(HttpMethod.Options)
                allowMethod(HttpMethod.Get)
                allowMethod(HttpMethod.Post)
                allowHeader("Content-Type")
                allowHeader("Authorization")
            }

            routing {
                options("/{...}") {
                    call.respondText("", status = HttpStatusCode.OK)
                }

                get("/api/tags") {
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
                    call.respondText(body.toString(), ContentType.Application.Json, HttpStatusCode.OK)
                }

                post("/api/chat") {
                    val rawBody = call.receiveText()
                    if (rawBody.isBlank()) {
                        call.respondText(
                            """{"error":"empty request body"}""",
                            ContentType.Application.Json,
                            HttpStatusCode.BadRequest
                        )
                        return@post
                    }

                    try {
                        val json = JSONObject(rawBody)
                        val messages = json.optJSONArray("messages") ?: JSONArray()

                        val promptBuilder = StringBuilder()
                        for (i in 0 until messages.length()) {
                            val msg = messages.getJSONObject(i)
                            val role = msg.optString("role", "user")
                            val content = msg.optString("content", "")
                            when (role) {
                                "system" -> promptBuilder.append("<start_of_turn>system\n${content}<end_of_turn>\n")
                                "user" -> promptBuilder.append("<start_of_turn>user\n${content}<end_of_turn>\n")
                                "assistant" -> promptBuilder.append("<start_of_turn>model\n${content}<end_of_turn>\n")
                            }
                        }
                        promptBuilder.append("<start_of_turn>model\n")

                        // Inferenza asincrona: llmInference gestisce già l'IO dispatcher internamente
                        val responseText = llmInference.generateResponse(promptBuilder.toString())

                        val responseJson = JSONObject().apply {
                            put("model", json.optString("model", "gemma4"))
                            put("message", JSONObject().apply {
                                put("role", "assistant")
                                put("content", responseText)
                            })
                            put("done", true)
                        }

                        call.respondText(responseJson.toString(), ContentType.Application.Json, HttpStatusCode.OK)
                    } catch (e: Exception) {
                        Log.e(TAG, "Chat request error: ${e.message}", e)
                        call.respondText(
                            """{"error":${JSONObject.quote(e.message ?: "internal error")}}""",
                            ContentType.Application.Json,
                            HttpStatusCode.InternalServerError
                        )
                    }
                }
            }
        }

        server?.start(wait = false)
        Log.i(TAG, "Ktor Inference HTTP server started on port $port")
    }

    fun stop() {
        server?.stop(1000, 2000)
        server = null
        Log.i(TAG, "Ktor Inference HTTP server stopped")
    }

    companion object {
        const val DEFAULT_PORT = 8080
        private const val TAG = "InferenceHttpServer"
    }
}

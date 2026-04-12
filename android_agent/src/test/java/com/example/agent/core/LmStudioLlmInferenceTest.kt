package com.example.agent.core

import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

/**
 * Real HTTP tests for [LmStudioLlmInference] using MockWebServer.
 *
 * MockWebServer binds a real socket on localhost so [java.net.HttpURLConnection]
 * exercises the full request/response path without any mocking.  This covers:
 *   - Successful chat completions response parsing
 *   - HTTP error propagation (4xx / 5xx)
 *   - Network-level failures (server not running)
 *   - `model` field presence / absence in request body
 *   - Malformed JSON response handling
 */
class LmStudioLlmInferenceTest {

    private lateinit var server: MockWebServer

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    /** Returns a mock OpenAI-compatible chat completion JSON response. */
    private fun chatCompletionJson(content: String): String = """
        {
          "id": "chatcmpl-test",
          "object": "chat.completion",
          "choices": [
            {
              "index": 0,
              "message": { "role": "assistant", "content": "$content" },
              "finish_reason": "stop"
            }
          ]
        }
    """.trimIndent()

    private fun serverUrl(): String = server.url("/").toString().trimEnd('/')

    // ─────────────────────────────────────────────────────────────────────────
    // Happy path
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    fun `returns assistant content on 200 OK`() = runTest {
        server.enqueue(MockResponse()
            .setResponseCode(200)
            .setHeader("Content-Type", "application/json")
            .setBody(chatCompletionJson("Hello, I am your assistant.")))

        val inference = LmStudioLlmInference(serverUrl())
        val result = inference.generateResponse("Hi")

        assertEquals("Hello, I am your assistant.", result)
    }

    @Test
    fun `trims whitespace from assistant content`() = runTest {
        server.enqueue(MockResponse()
            .setResponseCode(200)
            .setHeader("Content-Type", "application/json")
            .setBody(chatCompletionJson("  answer with spaces  ")))

        val result = LmStudioLlmInference(serverUrl()).generateResponse("Test")

        assertEquals("answer with spaces", result)
    }

    @Test
    fun `sends POST to correct endpoint`() = runTest {
        server.enqueue(MockResponse().setResponseCode(200)
            .setBody(chatCompletionJson("ok")))

        LmStudioLlmInference(serverUrl()).generateResponse("Hello")

        val request: RecordedRequest = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/v1/chat/completions", request.path)
    }

    @Test
    fun `sends Content-Type application-json`() = runTest {
        server.enqueue(MockResponse().setResponseCode(200)
            .setBody(chatCompletionJson("ok")))

        LmStudioLlmInference(serverUrl()).generateResponse("Hello")

        val request = server.takeRequest()
        assertTrue(
            "Expected application/json Content-Type",
            request.getHeader("Content-Type")?.contains("application/json") == true
        )
    }

    @Test
    fun `request body contains user prompt`() = runTest {
        server.enqueue(MockResponse().setResponseCode(200)
            .setBody(chatCompletionJson("ok")))

        LmStudioLlmInference(serverUrl()).generateResponse("What is 2+2?")

        val body = server.takeRequest().body.readUtf8()
        val json = JSONObject(body)
        val messages = json.getJSONArray("messages")
        val userMsg = messages.getJSONObject(0)

        assertEquals("user", userMsg.getString("role"))
        assertEquals("What is 2+2?", userMsg.getString("content"))
    }

    // ─────────────────────────────────────────────────────────────────────────
    // modelName handling
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    fun `request body omits model field when modelName is blank`() = runTest {
        server.enqueue(MockResponse().setResponseCode(200)
            .setBody(chatCompletionJson("ok")))

        LmStudioLlmInference(serverUrl(), modelName = "").generateResponse("Hi")

        val body = JSONObject(server.takeRequest().body.readUtf8())
        assertFalse("model field must be absent when modelName is blank", body.has("model"))
    }

    @Test
    fun `request body includes model field when modelName is set`() = runTest {
        server.enqueue(MockResponse().setResponseCode(200)
            .setBody(chatCompletionJson("ok")))

        LmStudioLlmInference(serverUrl(), modelName = "gemma4:2b-instruct-q4_0")
            .generateResponse("Hi")

        val body = JSONObject(server.takeRequest().body.readUtf8())
        assertTrue("model field must be present", body.has("model"))
        assertEquals("gemma4:2b-instruct-q4_0", body.getString("model"))
    }

    @Test
    fun `whitespace-only modelName is treated as blank`() = runTest {
        server.enqueue(MockResponse().setResponseCode(200)
            .setBody(chatCompletionJson("ok")))

        LmStudioLlmInference(serverUrl(), modelName = "   ").generateResponse("Hi")

        val body = JSONObject(server.takeRequest().body.readUtf8())
        assertFalse("model field must be absent for whitespace-only name", body.has("model"))
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HTTP error codes
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    fun `returns error message on HTTP 500`() = runTest {
        server.enqueue(MockResponse().setResponseCode(500)
            .setBody("Internal Server Error"))

        val result = LmStudioLlmInference(serverUrl()).generateResponse("Hi")

        assertTrue("Expected HTTP 500 error in result", result.contains("500"))
    }

    @Test
    fun `returns error message on HTTP 404`() = runTest {
        server.enqueue(MockResponse().setResponseCode(404)
            .setBody("Not Found"))

        val result = LmStudioLlmInference(serverUrl()).generateResponse("Hi")

        assertTrue("Expected HTTP 404 error in result", result.contains("404"))
    }

    @Test
    fun `returns error message on HTTP 401 Unauthorized`() = runTest {
        server.enqueue(MockResponse().setResponseCode(401)
            .setBody("Unauthorized"))

        val result = LmStudioLlmInference(serverUrl()).generateResponse("Hi")

        assertTrue("Expected HTTP 401 in result", result.contains("401"))
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Network-level failures
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    fun `returns error message when server is unreachable`() = runTest {
        // Short timeouts so the test never hangs on machines with something listening
        // on this port but not responding with HTTP.
        val inference = LmStudioLlmInference(
            "http://127.0.0.1:19999",
            connectTimeoutMs = 500,
            readTimeoutMs = 500,
        )
        val result = inference.generateResponse("Hello")

        assertTrue("Expected error message on connection failure", result.startsWith("Errore:"))
    }

    @Test
    fun `error message contains the unreachable server URL`() = runTest {
        val badUrl = "http://127.0.0.1:19998"
        val result = LmStudioLlmInference(
            badUrl,
            connectTimeoutMs = 500,
            readTimeoutMs = 500,
        ).generateResponse("Hello")

        assertTrue(
            "Error message should mention the configured server URL",
            result.contains(badUrl)
        )
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Malformed JSON response
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    fun `returns error message on malformed JSON response`() = runTest {
        server.enqueue(MockResponse().setResponseCode(200)
            .setHeader("Content-Type", "application/json")
            .setBody("not valid json at all ###"))

        val result = LmStudioLlmInference(serverUrl()).generateResponse("Hi")

        assertTrue(
            "Expected error message on JSON parse failure, got: $result",
            result.startsWith("Errore:")
        )
    }

    @Test
    fun `returns error message when choices array is empty`() = runTest {
        server.enqueue(MockResponse().setResponseCode(200)
            .setBody("""{"id":"x","choices":[]}"""))

        val result = LmStudioLlmInference(serverUrl()).generateResponse("Hi")

        assertTrue(
            "Expected error on empty choices, got: $result",
            result.startsWith("Errore:")
        )
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Ollama-style request (modelName required)
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    fun `Ollama mode sends correct model name and gets response`() = runTest {
        server.enqueue(MockResponse().setResponseCode(200)
            .setBody(chatCompletionJson("Ciao dal modello Ollama!")))

        val result = LmStudioLlmInference(serverUrl(), "gemma4:2b-instruct-q4_0")
            .generateResponse("Ciao")

        assertEquals("Ciao dal modello Ollama!", result)

        val body = JSONObject(server.takeRequest().body.readUtf8())
        assertEquals("gemma4:2b-instruct-q4_0", body.getString("model"))
    }
}

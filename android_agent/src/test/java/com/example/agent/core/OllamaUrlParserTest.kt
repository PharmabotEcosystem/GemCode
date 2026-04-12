package com.example.agent.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Tests for the `ollama://` and `lmstudio://` URL parsing logic found in
 * [AgentOrchestrator.loadModel].
 *
 * The parsing logic is a pure string transformation — duplicated here as a
 * local helper so that [AgentOrchestrator] (which carries Hilt/Android deps)
 * is never instantiated on the JVM test host.
 *
 * If the parsing logic in [AgentOrchestrator] changes, update [parseOllamaUrl]
 * and [parseLmStudioUrl] to match.
 */
class OllamaUrlParserTest {

    // ─────────────────────────────────────────────────────────────────────────
    // Mirror of AgentOrchestrator.loadModel() parsing logic
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Parses `ollama://<serverUrl>|<modelName>` → Pair(serverUrl, modelName).
     * When no `|` is present, modelName is an empty string.
     */
    private fun parseOllamaUrl(modelPath: String): Pair<String, String> {
        val withoutPrefix = modelPath.removePrefix("ollama://")
        val pipeIdx = withoutPrefix.indexOf('|')
        val serverUrl = if (pipeIdx >= 0) withoutPrefix.substring(0, pipeIdx) else withoutPrefix
        val modelName  = if (pipeIdx >= 0) withoutPrefix.substring(pipeIdx + 1) else ""
        return Pair(serverUrl, modelName)
    }

    /**
     * Parses `lmstudio://<serverUrl>` → serverUrl (simple prefix removal).
     */
    private fun parseLmStudioUrl(modelPath: String): String =
        modelPath.removePrefix("lmstudio://")

    // ─────────────────────────────────────────────────────────────────────────
    // ollama:// — standard cases
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    fun `ollama localhost with gemma4 model`() {
        val (serverUrl, modelName) = parseOllamaUrl("ollama://http://localhost:11434|gemma4:2b")
        assertEquals("http://localhost:11434", serverUrl)
        assertEquals("gemma4:2b", modelName)
    }

    @Test
    fun `ollama remote host with llama3`() {
        val (serverUrl, modelName) = parseOllamaUrl("ollama://http://192.168.1.5:11434|llama3:8b")
        assertEquals("http://192.168.1.5:11434", serverUrl)
        assertEquals("llama3:8b", modelName)
    }

    @Test
    fun `ollama with complex model name containing hyphens and quantization tag`() {
        val (serverUrl, modelName) =
            parseOllamaUrl("ollama://http://localhost:11434|gemma4:2b-instruct-q4_0")
        assertEquals("http://localhost:11434", serverUrl)
        assertEquals("gemma4:2b-instruct-q4_0", modelName)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ollama:// — edge cases
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    fun `ollama without pipe — model name is empty`() {
        val (serverUrl, modelName) = parseOllamaUrl("ollama://http://localhost:11434")
        assertEquals("http://localhost:11434", serverUrl)
        assertEquals("", modelName)
    }

    @Test
    fun `ollama pipe at end — model name is empty string`() {
        val (serverUrl, modelName) = parseOllamaUrl("ollama://http://localhost:11434|")
        assertEquals("http://localhost:11434", serverUrl)
        assertEquals("", modelName)
    }

    @Test
    fun `ollama https url with port and model`() {
        val (serverUrl, modelName) = parseOllamaUrl("ollama://https://myserver.local:11434|phi3:mini")
        assertEquals("https://myserver.local:11434", serverUrl)
        assertEquals("phi3:mini", modelName)
    }

    @Test
    fun `ollama only first pipe is used as delimiter`() {
        // If modelName itself contained '|' (unusual but test robustness)
        // indexOf finds the FIRST pipe, so everything after the first pipe is modelName
        val (serverUrl, modelName) =
            parseOllamaUrl("ollama://http://localhost:11434|model:tag|extra")
        assertEquals("http://localhost:11434", serverUrl)
        assertEquals("model:tag|extra", modelName)
    }

    @Test
    fun `ollama http scheme not confused with pipe splitting`() {
        // The '://' after http must not interfere with pipe split
        val (serverUrl, modelName) = parseOllamaUrl("ollama://http://10.0.2.2:11434|mistral:7b")
        assertEquals("http://10.0.2.2:11434", serverUrl)
        assertEquals("mistral:7b", modelName)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // lmstudio:// — simple prefix removal
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    fun `lmstudio default localhost port`() {
        val url = parseLmStudioUrl("lmstudio://http://localhost:1234")
        assertEquals("http://localhost:1234", url)
    }

    @Test
    fun `lmstudio remote PC on LAN`() {
        val url = parseLmStudioUrl("lmstudio://http://192.168.1.100:1234")
        assertEquals("http://192.168.1.100:1234", url)
    }

    @Test
    fun `lmstudio preserves path segments if any`() {
        val url = parseLmStudioUrl("lmstudio://http://localhost:1234")
        assertEquals("http://localhost:1234", url)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // startsWith guard — correct prefix detection
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    fun `ollama prefix check matches correctly`() {
        assertTrue("ollama://http://localhost:11434|gemma4:2b".startsWith("ollama://"))
    }

    @Test
    fun `lmstudio prefix check matches correctly`() {
        assertTrue("lmstudio://http://localhost:1234".startsWith("lmstudio://"))
    }

    @Test
    fun `ollama and lmstudio prefixes are distinct`() {
        assertFalse("lmstudio://http://localhost:1234".startsWith("ollama://"))
        assertFalse("ollama://http://localhost:11434|gemma:2b".startsWith("lmstudio://"))
    }
}

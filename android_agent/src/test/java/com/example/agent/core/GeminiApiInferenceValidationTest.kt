package com.example.agent.core

import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test

/**
 * Validates [GeminiApiLlmInference] guard clauses that do NOT require network access.
 * Network-dependent paths are excluded — those belong in integration tests.
 */
class GeminiApiInferenceValidationTest {

    @Test
    fun `blank API key returns missing key error without network call`() = runTest {
        val inference = GeminiApiLlmInference("")
        val result = inference.generateResponse("Hello")
        assertTrue(
            "Expected missing key message, got: $result",
            result.startsWith("Error: Gemini API Key is missing")
        )
    }

    @Test
    fun `whitespace-only API key is treated as missing`() = runTest {
        val inference = GeminiApiLlmInference("   ")
        val result = inference.generateResponse("Hello")
        assertTrue(
            "Expected missing key message for whitespace key, got: $result",
            result.startsWith("Error: Gemini API Key is missing")
        )
    }

    @Test
    fun `placeholder YOUR_API_KEY value is treated as missing`() = runTest {
        val inference = GeminiApiLlmInference("YOUR_API_KEY")
        val result = inference.generateResponse("Hello")
        assertTrue(
            "Expected missing key message for placeholder, got: $result",
            result.startsWith("Error: Gemini API Key is missing")
        )
    }
}

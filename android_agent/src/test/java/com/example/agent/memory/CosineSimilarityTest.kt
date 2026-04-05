package com.example.agent.memory

import org.junit.Assert.*
import org.junit.Test
import kotlin.math.sqrt

/**
 * Tests for the cosine similarity algorithm used by [LocalMemoryManager] for RAG retrieval.
 *
 * The function is mirrored here (pure math, no Android deps) to test the algorithm
 * in isolation without needing Robolectric or Room.
 */
class CosineSimilarityTest {

    /** Mirrors LocalMemoryManager.cosineSimilarity */
    private fun cosineSimilarity(v1: FloatArray, v2: FloatArray): Float {
        var dotProduct = 0.0f
        var norm1 = 0.0f
        var norm2 = 0.0f
        for (i in v1.indices) {
            dotProduct += v1[i] * v2[i]
            norm1 += v1[i] * v1[i]
            norm2 += v2[i] * v2[i]
        }
        return if (norm1 == 0.0f || norm2 == 0.0f) 0.0f
        else dotProduct / (sqrt(norm1) * sqrt(norm2))
    }

    @Test
    fun `identical vectors have similarity 1`() {
        val v = floatArrayOf(0.1f, 0.5f, 0.3f, 0.8f)
        assertEquals(1.0f, cosineSimilarity(v, v), 0.0001f)
    }

    @Test
    fun `orthogonal vectors have similarity 0`() {
        val v1 = floatArrayOf(1.0f, 0.0f, 0.0f)
        val v2 = floatArrayOf(0.0f, 1.0f, 0.0f)
        assertEquals(0.0f, cosineSimilarity(v1, v2), 0.0001f)
    }

    @Test
    fun `opposite vectors have similarity -1`() {
        val v1 = floatArrayOf(1.0f, 0.0f)
        val v2 = floatArrayOf(-1.0f, 0.0f)
        assertEquals(-1.0f, cosineSimilarity(v1, v2), 0.0001f)
    }

    @Test
    fun `zero vector always returns 0`() {
        val zero = floatArrayOf(0.0f, 0.0f, 0.0f)
        val v = floatArrayOf(1.0f, 2.0f, 3.0f)
        assertEquals(0.0f, cosineSimilarity(zero, v), 0.0001f)
        assertEquals(0.0f, cosineSimilarity(v, zero), 0.0001f)
        assertEquals(0.0f, cosineSimilarity(zero, zero), 0.0001f)
    }

    @Test
    fun `similar vectors have high similarity`() {
        val v1 = floatArrayOf(0.9f, 0.1f, 0.0f)
        val v2 = floatArrayOf(0.8f, 0.2f, 0.0f)
        val sim = cosineSimilarity(v1, v2)
        assertTrue("Expected similarity > 0.95, got $sim", sim > 0.95f)
    }

    @Test
    fun `result is always bounded between -1 and 1`() {
        val v1 = floatArrayOf(3.5f, -1.2f, 0.7f, 2.1f)
        val v2 = floatArrayOf(-2.0f, 0.5f, 1.8f, -0.3f)
        val sim = cosineSimilarity(v1, v2)
        assertTrue("Similarity out of [-1, 1] bounds: $sim", sim in -1.0f..1.0f)
    }

    @Test
    fun `magnitude does not affect similarity`() {
        val v1 = floatArrayOf(1.0f, 0.0f)
        val v2 = floatArrayOf(100.0f, 0.0f)
        assertEquals(1.0f, cosineSimilarity(v1, v2), 0.0001f)
    }

    @Test
    fun `higher dimensional vectors are handled correctly`() {
        val dim = 384
        val v1 = FloatArray(dim) { 1.0f / sqrt(dim.toFloat()) }
        val v2 = FloatArray(dim) { 1.0f / sqrt(dim.toFloat()) }
        assertEquals(1.0f, cosineSimilarity(v1, v2), 0.001f)
    }
}

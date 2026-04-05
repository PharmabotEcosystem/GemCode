package com.example.agent.tools

import kotlinx.serialization.json.JsonElement
import org.junit.Assert.*
import org.junit.Test

/**
 * Unit tests for [DefaultToolRegistry].
 * Pure JVM — no Android runtime required.
 */
class DefaultToolRegistryTest {

    private fun fakeTool(name: String, description: String = "A test tool") = object : Tool {
        override val name = name
        override val description = description
        override val parametersSchema = "{}"
        override suspend fun execute(params: JsonElement) = "result-$name"
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Initial state
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    fun `getAll returns all tools provided at construction`() {
        val t1 = fakeTool("alpha")
        val t2 = fakeTool("beta")
        val registry = DefaultToolRegistry(setOf(t1, t2))

        assertEquals(2, registry.getAll().size)
        assertTrue(registry.getAll().map { it.name }.containsAll(listOf("alpha", "beta")))
    }

    @Test
    fun `empty registry returns empty set`() {
        val registry = DefaultToolRegistry(emptySet())
        assertTrue(registry.getAll().isEmpty())
    }

    // ─────────────────────────────────────────────────────────────────────────
    // findByName
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    fun `findByName returns correct tool by exact name`() {
        val tool = fakeTool("file_reader", "Reads files")
        val registry = DefaultToolRegistry(setOf(tool))

        assertSame(tool, registry.findByName("file_reader"))
    }

    @Test
    fun `findByName returns null for unknown name`() {
        val registry = DefaultToolRegistry(emptySet())
        assertNull(registry.findByName("nonexistent"))
    }

    @Test
    fun `findByName is case-sensitive`() {
        val tool = fakeTool("Echo")
        val registry = DefaultToolRegistry(setOf(tool))

        assertNotNull(registry.findByName("Echo"))
        assertNull(registry.findByName("echo"))
        assertNull(registry.findByName("ECHO"))
    }

    // ─────────────────────────────────────────────────────────────────────────
    // register / unregister
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    fun `register dynamically adds a new tool`() {
        val registry = DefaultToolRegistry(emptySet())
        val tool = fakeTool("dynamic")

        registry.register(tool)

        assertSame(tool, registry.findByName("dynamic"))
        assertEquals(1, registry.getAll().size)
    }

    @Test
    fun `register replaces existing tool with same name`() {
        val original = fakeTool("tool", "original")
        val registry = DefaultToolRegistry(setOf(original))
        val replacement = fakeTool("tool", "replacement")

        registry.register(replacement)

        assertEquals("replacement", registry.findByName("tool")?.description)
        assertEquals(1, registry.getAll().size)
    }

    @Test
    fun `unregister removes tool from registry`() {
        val tool = fakeTool("removable")
        val registry = DefaultToolRegistry(setOf(tool))

        registry.unregister("removable")

        assertNull(registry.findByName("removable"))
        assertTrue(registry.getAll().isEmpty())
    }

    @Test
    fun `unregister on unknown name does not throw`() {
        val registry = DefaultToolRegistry(emptySet())
        registry.unregister("does-not-exist") // must not throw
    }

    @Test
    fun `unregister does not affect other tools`() {
        val keep = fakeTool("keeper")
        val remove = fakeTool("removable")
        val registry = DefaultToolRegistry(setOf(keep, remove))

        registry.unregister("removable")

        assertEquals(1, registry.getAll().size)
        assertNotNull(registry.findByName("keeper"))
    }

    // ─────────────────────────────────────────────────────────────────────────
    // buildSystemPromptSection
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    fun `buildSystemPromptSection contains tool name and description`() {
        val tool = fakeTool("weather", "Gets current weather")
        val registry = DefaultToolRegistry(setOf(tool))

        val section = registry.buildSystemPromptSection()

        assertTrue("Expected tool name in section", section.contains("weather"))
        assertTrue("Expected description in section", section.contains("Gets current weather"))
    }

    @Test
    fun `buildSystemPromptSection is empty string for empty registry`() {
        val registry = DefaultToolRegistry(emptySet())
        assertEquals("", registry.buildSystemPromptSection().trim())
    }

    @Test
    fun `buildSystemPromptSection includes all registered tools`() {
        val t1 = fakeTool("tool_a", "Does A")
        val t2 = fakeTool("tool_b", "Does B")
        val registry = DefaultToolRegistry(setOf(t1, t2))

        val section = registry.buildSystemPromptSection()

        assertTrue(section.contains("tool_a"))
        assertTrue(section.contains("tool_b"))
        assertTrue(section.contains("Does A"))
        assertTrue(section.contains("Does B"))
    }
}

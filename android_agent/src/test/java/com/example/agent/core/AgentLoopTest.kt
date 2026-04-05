package com.example.agent.core

import com.example.agent.memory.LocalMemoryManager
import com.example.agent.tools.Tool
import com.example.agent.tools.ToolRegistry
import io.mockk.*
import io.mockk.coEvery
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

/**
 * Unit tests for [AgentLoop] — the ReAct reasoning engine.
 *
 * All Android-platform dependencies (LLM, memory, tools) are mocked via MockK.
 * No instrumentation or Android runtime required.
 */
class AgentLoopTest {

    private val llmInference: LlmInferenceWrapper = mockk()
    private val toolRegistry: ToolRegistry = mockk()
    private val memoryManager: LocalMemoryManager = mockk(relaxed = true)
    private val pruner: ContextPruningManager = mockk(relaxed = true)
    private lateinit var agentLoop: AgentLoop

    @Before
    fun setUp() {
        agentLoop = AgentLoop(
            llmInference = llmInference,
            toolRegistry = toolRegistry,
            memoryManager = memoryManager,
            pruner = pruner
        )
        coEvery { memoryManager.searchRelevantContext(any()) } returns "No previous context."
        coEvery { memoryManager.getConversationState() } returns null
        every { toolRegistry.buildSystemPromptSection() } returns ""
        every { toolRegistry.getAll() } returns emptySet()
    }

    // ─────────────────────────────────────────────────────────────────────────
    // run() — answer paths
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    fun `run returns direct answer when LLM produces no tool call`() = runTest {
        coEvery { llmInference.generateResponse(any()) } returns "Direct answer."

        val result = agentLoop.run("Hello")

        assertEquals("Direct answer.", result)
    }

    @Test
    fun `run executes tool and returns follow-up answer`() = runTest {
        val tool: Tool = mockk()
        every { tool.name } returns "echo"
        coEvery { tool.execute(any()) } returns "Echo: hello"
        every { toolRegistry.findByName("echo") } returns tool

        coEvery { llmInference.generateResponse(any()) } returnsMany listOf(
            "```json\n{ \"tool\": \"echo\", \"parameters\": { \"text\": \"hello\" } }\n```",
            "Done, echo executed."
        )

        val result = agentLoop.run("Echo hello")

        assertEquals("Done, echo executed.", result)
        coVerify(exactly = 1) { tool.execute(any()) }
    }

    @Test
    fun `run returns max iterations message when loop never terminates`() = runTest {
        val tool: Tool = mockk()
        every { tool.name } returns "noop"
        coEvery { tool.execute(any()) } returns "still going"
        every { toolRegistry.findByName("noop") } returns tool
        every { toolRegistry.getAll() } returns setOf(tool)

        coEvery { llmInference.generateResponse(any()) } returns
            "```json\n{ \"tool\": \"noop\", \"parameters\": {} }\n```"

        val result = agentLoop.run("Loop forever")

        assertTrue("Expected max iterations message, got: $result", result.contains("Max iterations"))
    }

    @Test
    fun `run handles unknown tool name gracefully and continues`() = runTest {
        every { toolRegistry.findByName("ghost") } returns null
        every { toolRegistry.getAll() } returns emptySet()

        coEvery { llmInference.generateResponse(any()) } returnsMany listOf(
            "```json\n{ \"tool\": \"ghost\", \"parameters\": {} }\n```",
            "Tool unavailable, here is my fallback answer."
        )

        val result = agentLoop.run("Use ghost tool")
        assertEquals("Tool unavailable, here is my fallback answer.", result)
    }

    @Test
    fun `run recovers from tool exception and continues loop`() = runTest {
        val tool: Tool = mockk()
        every { tool.name } returns "crasher"
        coEvery { tool.execute(any()) } throws RuntimeException("tool exploded")
        every { toolRegistry.findByName("crasher") } returns tool

        coEvery { llmInference.generateResponse(any()) } returnsMany listOf(
            "```json\n{ \"tool\": \"crasher\", \"parameters\": {} }\n```",
            "Recovered gracefully."
        )

        val result = agentLoop.run("Crash test")
        assertEquals("Recovered gracefully.", result)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // run() — phase change events
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    fun `run emits Thinking phase at every iteration`() = runTest {
        coEvery { llmInference.generateResponse(any()) } returns "Answer."

        val phases = mutableListOf<LoopPhase>()
        agentLoop.run("Test") { phase -> phases.add(phase) }

        assertTrue("Expected at least one Thinking phase", phases.any { it is LoopPhase.Thinking })
    }

    @Test
    fun `run emits InvokingTool phase with correct tool name`() = runTest {
        val tool: Tool = mockk()
        every { tool.name } returns "writer"
        coEvery { tool.execute(any()) } returns "written"
        every { toolRegistry.findByName("writer") } returns tool

        coEvery { llmInference.generateResponse(any()) } returnsMany listOf(
            "```json\n{ \"tool\": \"writer\", \"parameters\": {} }\n```",
            "File written."
        )

        val phases = mutableListOf<LoopPhase>()
        agentLoop.run("Write file") { phase -> phases.add(phase) }

        val invocations = phases.filterIsInstance<LoopPhase.InvokingTool>()
        assertTrue("Expected InvokingTool phase", invocations.isNotEmpty())
        assertEquals("writer", invocations.first().toolName)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // buildActiveSystemPrompt()
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    fun `buildActiveSystemPrompt includes RAG context in legacy mode`() {
        every { toolRegistry.buildSystemPromptSection() } returns "tool-section"

        val prompt = agentLoop.buildActiveSystemPrompt("rag: user prefers Kotlin")

        assertTrue("Expected RAG context in prompt", prompt.contains("rag: user prefers Kotlin"))
        assertTrue("Expected tool section in prompt", prompt.contains("tool-section"))
    }

    @Test
    fun `buildActiveSystemPrompt delegates to SystemPromptBuilder when injected`() {
        val builder: SystemPromptBuilder = mockk()
        every { builder.build(any()) } returns "custom-system-prompt"

        val loop = AgentLoop(
            llmInference = llmInference,
            toolRegistry = toolRegistry,
            memoryManager = memoryManager,
            pruner = pruner,
            systemPromptBuilder = builder
        )

        val prompt = loop.buildActiveSystemPrompt("rag-data")

        assertEquals("custom-system-prompt", prompt)
        verify { builder.build("rag-data") }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SafetyGuard integration
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    fun `run blocks tool call when SafetyGuard returns Blocked`() = runTest {
        val tool: Tool = mockk()
        every { tool.name } returns "risky"
        coEvery { tool.execute(any()) } returns "executed"
        every { toolRegistry.findByName("risky") } returns tool

        val safetyGuard: SafetyGuard = mockk()
        every { safetyGuard.evaluate(any(), any()) } returns
            SafetyVerdict.Blocked("Operation blocked: policy violation")

        val loop = AgentLoop(
            llmInference = llmInference,
            toolRegistry = toolRegistry,
            memoryManager = memoryManager,
            pruner = pruner,
            safetyGuard = safetyGuard
        )

        coEvery { llmInference.generateResponse(any()) } returnsMany listOf(
            "```json\n{ \"tool\": \"risky\", \"parameters\": {} }\n```",
            "Blocked, providing safe alternative."
        )

        val result = loop.run("Do risky thing")

        assertEquals("Blocked, providing safe alternative.", result)
        coVerify(exactly = 0) { tool.execute(any()) }
    }

    @Test
    fun `run executes tool when SafetyGuard requires confirmation and user confirms`() = runTest {
        val tool: Tool = mockk()
        every { tool.name } returns "sensitive"
        coEvery { tool.execute(any()) } returns "executed safely"
        every { toolRegistry.findByName("sensitive") } returns tool

        val safetyGuard: SafetyGuard = mockk()
        every { safetyGuard.evaluate(any(), any()) } returns
            SafetyVerdict.RequiresConfirmation("This modifies system settings", "Modify brightness")

        val loop = AgentLoop(
            llmInference = llmInference,
            toolRegistry = toolRegistry,
            memoryManager = memoryManager,
            pruner = pruner,
            safetyGuard = safetyGuard
        )

        coEvery { llmInference.generateResponse(any()) } returnsMany listOf(
            "```json\n{ \"tool\": \"sensitive\", \"parameters\": {} }\n```",
            "Done with confirmation."
        )

        val result = loop.run("Do sensitive thing", onConfirmationRequired = { true })

        assertEquals("Done with confirmation.", result)
        coVerify(exactly = 1) { tool.execute(any()) }
    }

    @Test
    fun `run skips tool when SafetyGuard requires confirmation and user denies`() = runTest {
        val tool: Tool = mockk()
        every { tool.name } returns "sensitive"
        coEvery { tool.execute(any()) } returns "should not run"
        every { toolRegistry.findByName("sensitive") } returns tool

        val safetyGuard: SafetyGuard = mockk()
        every { safetyGuard.evaluate(any(), any()) } returns
            SafetyVerdict.RequiresConfirmation("This modifies system settings", "Modify brightness")

        val loop = AgentLoop(
            llmInference = llmInference,
            toolRegistry = toolRegistry,
            memoryManager = memoryManager,
            pruner = pruner,
            safetyGuard = safetyGuard
        )

        coEvery { llmInference.generateResponse(any()) } returnsMany listOf(
            "```json\n{ \"tool\": \"sensitive\", \"parameters\": {} }\n```",
            "User denied, aborting."
        )

        val result = loop.run("Do sensitive thing", onConfirmationRequired = { false })

        assertEquals("User denied, aborting.", result)
        coVerify(exactly = 0) { tool.execute(any()) }
    }
}

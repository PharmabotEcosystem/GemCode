package com.example.agent.core

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

// ─────────────────────────────────────────────────────────────────────────────
// Data types
// ─────────────────────────────────────────────────────────────────────────────

/** A single parsed turn from the flat conversation string. */
data class ConversationTurn(val role: String, val content: String) {
    fun toFlatString(): String = "$role: $content"
}

/** Result of a pruning decision. */
data class PruneDecision(
    val shouldPrune: Boolean,
    val estimatedTokens: Int,
    val thresholdTokens: Int
)

/**
 * # ContextPruningManager
 *
 * Manages context-window capacity for the Gemma agent to prevent truncation
 * and OOM conditions caused by unbounded conversation growth.
 *
 * ## Problem
 * Gemma 2B has a context window of 8192 tokens (LiteRT default; configurable
 * via `setMaxTokens`). The ReAct loop appends User/Assistant/Observation turns
 * on every iteration. After ~20 multi-step tasks, the accumulated history
 * can easily exceed 6000 tokens, forcing MediaPipe to silently truncate early
 * turns — causing the agent to "forget" previous context.
 *
 * ## Solution — Recursive Summarisation
 * When total token usage crosses [pruneThresholdPercent] of [maxContextTokens]:
 *   1. Split the history into **old turns** (all but the last [keepLastNTurns]) and
 *      **recent turns** (the last [keepLastNTurns], kept verbatim).
 *   2. Ask the *same* Gemma model to produce a compact summary of the old turns.
 *   3. Replace old turns with the summary, prefixed with `[SUMMARY OF PREVIOUS CONTEXT]`.
 *
 * This is "recursive" because future pruning cycles will summarise summaries,
 * progressively condensing history while preserving the most recent, actionable context.
 *
 * ## Token estimation
 * Exact token counts require running the model's tokeniser (a native call).
 * We use the heuristic: **1 token ≈ 3 characters** (conservative; typical
 * English prose is ~4 chars/token, code is ~3 chars/token). Rounding down
 * prevents false negatives (not pruning when needed).
 *
 * @param maxContextTokens    Max tokens the model supports. Default 8192 for Gemma 2B.
 * @param pruneThresholdPercent  Prune when usage exceeds this fraction. Default 0.75 (75%).
 * @param keepLastNTurns      Number of most-recent turns preserved verbatim. Default 4.
 */
class ContextPruningManager(
    val maxContextTokens: Int = 8192,
    val pruneThresholdPercent: Float = 0.75f,
    val keepLastNTurns: Int = 4
) {
    companion object {
        private const val TAG = "ContextPruner"

        /**
         * Conservative chars-per-token ratio.
         * Lower = more aggressive pruning = fewer missed prune-points.
         */
        private const val CHARS_PER_TOKEN = 3

        /** Known role prefixes for turn parsing. Order matters — longer first. */
        private val ROLE_PREFIXES = listOf("Observation: ", "Assistant: ", "User: ")
    }

    val pruneThresholdTokens: Int
        get() = (maxContextTokens * pruneThresholdPercent).toInt()

    // ─────────────────────────────────────────────────────────────────────────
    // Token estimation
    // ─────────────────────────────────────────────────────────────────────────

    /** Estimates token count from a raw string. O(n) — never allocates. */
    fun estimateTokens(text: String): Int =
        if (text.isEmpty()) 0 else maxOf(1, text.length / CHARS_PER_TOKEN)

    // ─────────────────────────────────────────────────────────────────────────
    // Prune decision
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Returns a [PruneDecision] indicating whether pruning is needed.
     *
     * All three components (history + RAG context + system prompt) count toward
     * the context window, so we sum them here to get an accurate budget.
     */
    fun evaluatePruneNeed(
        conversationHistory: String,
        ragContext: String,
        systemPrompt: String
    ): PruneDecision {
        val historyTokens = estimateTokens(conversationHistory)
        val ragTokens = estimateTokens(ragContext)
        val sysTokens = estimateTokens(systemPrompt)
        val total = historyTokens + ragTokens + sysTokens

        Log.d(TAG, "Token budget: history=$historyTokens + rag=$ragTokens + sys=$sysTokens" +
                " = $total / $maxContextTokens (threshold: $pruneThresholdTokens)")

        return PruneDecision(
            shouldPrune = total >= pruneThresholdTokens,
            estimatedTokens = total,
            thresholdTokens = pruneThresholdTokens
        )
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Conversation parsing / serialisation
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Parses a flat conversation string into a list of [ConversationTurn].
     *
     * Handles multi-line content correctly: lines that don't start with a known
     * role prefix are appended to the current turn's content.
     */
    fun parseTurns(history: String): List<ConversationTurn> {
        val turns = mutableListOf<ConversationTurn>()
        var currentRole = ""
        val currentContent = StringBuilder()

        for (line in history.split("\n")) {
            val matchedPrefix = ROLE_PREFIXES.firstOrNull { line.startsWith(it) }
            if (matchedPrefix != null) {
                if (currentRole.isNotEmpty()) {
                    turns += ConversationTurn(currentRole, currentContent.toString().trimEnd())
                    currentContent.clear()
                }
                // Role key without trailing ": "
                currentRole = matchedPrefix.trimEnd(':', ' ')
                currentContent.append(line.removePrefix(matchedPrefix)).append("\n")
            } else if (currentRole.isNotEmpty()) {
                currentContent.append(line).append("\n")
            }
            // Lines before the first recognised role are silently ignored
        }

        if (currentRole.isNotEmpty()) {
            turns += ConversationTurn(currentRole, currentContent.toString().trimEnd())
        }
        return turns
    }

    /** Reconstructs a flat conversation string from [ConversationTurn] list. */
    fun turnsToString(turns: List<ConversationTurn>): String =
        turns.joinToString("\n") { "${it.role}: ${it.content}" } + "\n"

    // ─────────────────────────────────────────────────────────────────────────
    // Main pruning entry point
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Prunes [history] by:
     *   1. Keeping the last [keepLastNTurns] turns verbatim.
     *   2. Summarising all older turns with [llm].
     *   3. Returning the new history string: `[SUMMARY] + recent turns`.
     *
     * **Thread-safety:** runs entirely on [Dispatchers.IO]. Safe to call from
     * any coroutine context; the LLM call is already dispatched to IO inside
     * [LlmInferenceWrapper.generateResponse].
     *
     * **Fallback:** if the LLM summarisation call throws, we fall back to a
     * simple truncation of the old turns to their first 400 characters, clearly
     * labelled as `[TRUNCATED]`. The agent can still operate with degraded context.
     */
    suspend fun pruneHistory(
        history: String,
        llm: LlmInferenceWrapper
    ): String = withContext(Dispatchers.IO) {
        val turns = parseTurns(history)

        if (turns.size <= keepLastNTurns) {
            Log.d(TAG, "Pruning skipped — only ${turns.size} turns, need > $keepLastNTurns.")
            return@withContext history
        }

        val oldTurns = turns.dropLast(keepLastNTurns)
        val recentTurns = turns.takeLast(keepLastNTurns)
        val oldText = turnsToString(oldTurns)

        val tokensBefore = estimateTokens(oldText)
        val summary = generateSummary(oldText, llm)
        val tokensAfter = estimateTokens(summary)

        Log.d(TAG, "Pruned ${oldTurns.size} old turns: " +
                "~${tokensBefore} tokens → ~${tokensAfter} tokens " +
                "(saved ~${tokensBefore - tokensAfter} tokens)")

        buildString {
            appendLine("[SUMMARY OF PREVIOUS CONTEXT]")
            appendLine(summary.trim())
            appendLine("[END SUMMARY]")
            appendLine()
            append(turnsToString(recentTurns))
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private: LLM summarisation
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Asks the LLM to compress [turnsText] into a ≤200-word paragraph.
     *
     * The prompt is carefully structured so Gemma does not emit tool-call JSON
     * (it should just produce prose). We instruct it to preserve:
     *   - Key facts and named entities
     *   - Tool calls executed and their outcomes
     *   - Any persistent state the agent needs for future decisions
     */
    private suspend fun generateSummary(
        turnsText: String,
        llm: LlmInferenceWrapper
    ): String {
        // We deliberately keep the system prompt short to leave room for the turns text
        val summaryPrompt = """
            Condensa la seguente cronologia di conversazione in un paragrafo compatto (max 200 parole).
            Preserva: fatti chiave, decisioni prese, tool chiamati e i loro risultati,
            contesto persistente che l'agente potrebbe necessitare in futuro.
            NON includere JSON o chiamate ai tool nel riassunto — solo testo descrittivo.

            Cronologia da condensare:
            $turnsText

            Riassunto conciso:
        """.trimIndent()

        return try {
            val result = llm.generateResponse(summaryPrompt)
            // Sanity check: if the model returned an empty or trivially short string,
            // fall back to truncation
            if (result.isBlank() || result.length < 20) {
                Log.w(TAG, "LLM returned empty summary, using truncation fallback.")
                truncationFallback(turnsText)
            } else {
                result.trim()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Summarisation LLM call failed: ${e.message}. Using truncation fallback.")
            truncationFallback(turnsText)
        }
    }

    /**
     * Emergency fallback: keep the first 400 characters of old turns
     * and mark them as truncated so the agent knows context is incomplete.
     */
    private fun truncationFallback(turnsText: String): String {
        val truncated = turnsText.take(400)
        return "$truncated\n[...CONTEXT TRUNCATED — summary generation failed...]"
    }
}

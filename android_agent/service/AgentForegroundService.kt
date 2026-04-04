package com.example.agent.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Binder
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.example.agent.core.AgentLoop
import com.example.agent.core.LlmInferenceWrapper
import com.example.agent.memory.LocalMemoryManager
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

// ─────────────────────────────────────────────────────────────────────────────
// Sealed hierarchy for agent lifecycle states — observed by UI via StateFlow.
// ─────────────────────────────────────────────────────────────────────────────
sealed class AgentServiceState {
    /** Model loaded, waiting for prompt. */
    object Idle : AgentServiceState()

    /** LLM generating next token(s). */
    object Thinking : AgentServiceState()

    /** ReAct loop dispatched a tool call. */
    data class ExecutingTool(val toolName: String) : AgentServiceState()

    /** Non-fatal recoverable error (e.g. low RAM, tool failure). */
    data class Error(val message: String) : AgentServiceState()
}

/**
 * # AgentForegroundService
 *
 * A persistent Android Foreground Service that hosts the Gemma agent loop.
 *
 * ## Why Foreground?
 * Android's LMK (Low-Memory Killer) aggressively reclaims background process memory.
 * A Foreground Service with `startForeground()` promotes our process to the
 * "foreground service" oom_adj level (~200), far above the "cached" level (~900+)
 * where the OOM killer targets first. This keeps Gemma's mmap'd pages resident.
 *
 * ## Binding pattern (same-process, no AIDL needed)
 * Since MainActivity and the service share the same process, we use a simple
 * [AgentBinder] (extends [Binder]) to expose typed Kotlin APIs directly.
 * AIDL would only be required for cross-process IPC (e.g. a Tasker plugin APK).
 *
 * For Tasker / external trigger support, the service also handles
 * [ACTION_SUBMIT_PROMPT] intents via [onStartCommand].
 *
 * ## Threading
 * All LLM inference runs on [Dispatchers.IO] via [serviceScope], never on the
 * Main thread. UI observes [agentState] (StateFlow) and [tokenStream] (SharedFlow).
 *
 * ## Memory safety
 * - [serviceScope] is cancelled in [onDestroy], which propagates cancellation to
 *   any running inference coroutine — MediaPipe's native session is then freed
 *   when [AgentLoop]'s [LlmInferenceWrapper] is closed by MainActivity.
 * - We never hold a ByteArray reference to model weights here.
 */
class AgentForegroundService : Service() {

    companion object {
        private const val TAG = "AgentForegroundSvc"
        const val CHANNEL_ID = "agent_foreground_channel"
        const val NOTIFICATION_ID = 1001

        /** External intent action — send a prompt from Tasker or a BroadcastReceiver. */
        const val ACTION_SUBMIT_PROMPT = "com.example.agent.ACTION_SUBMIT_PROMPT"
        const val EXTRA_PROMPT = "extra_prompt"
    }

    // ── Reactive state ────────────────────────────────────────────────────────

    private val _agentState = MutableStateFlow<AgentServiceState>(AgentServiceState.Idle)

    /**
     * Collect this in a Compose `collectAsState()` or a `lifecycleScope.launch` block
     * to drive the UI. Guaranteed to replay the last value to new collectors.
     */
    val agentState: StateFlow<AgentServiceState> = _agentState.asStateFlow()

    /**
     * Hot stream of raw LLM tokens (or final response strings).
     * Use `extraBufferCapacity = 64` to avoid backpressure drops during fast inference.
     * Collect with `tokenStream.collect { token -> appendToChat(token) }`.
     */
    private val _tokenStream = MutableSharedFlow<String>(replay = 0, extraBufferCapacity = 64)
    val tokenStream: SharedFlow<String> = _tokenStream.asSharedFlow()

    // ── Coroutine scope ───────────────────────────────────────────────────────

    /**
     * SupervisorJob ensures that a failed inference coroutine does NOT cancel
     * sibling coroutines (e.g. the state-update collector).
     */
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var currentJob: Job? = null

    // ── Dependencies (injected post-bind) ─────────────────────────────────────

    private var agentLoop: AgentLoop? = null
    private var resourceManager: ResourceManager? = null

    // ─────────────────────────────────────────────────────────────────────────
    // Binder
    // ─────────────────────────────────────────────────────────────────────────

    inner class AgentBinder : Binder() {
        /** Typed reference — safe because binding is same-process only. */
        val service: AgentForegroundService get() = this@AgentForegroundService

        /**
         * Call from MainActivity after binding to inject the fully-initialised
         * [AgentLoop] and [ResourceManager].
         */
        fun setup(loop: AgentLoop, resManager: ResourceManager) {
            agentLoop = loop
            resourceManager = resManager
            Log.d(TAG, "AgentLoop + ResourceManager injected.")
        }

        /**
         * Submit a user prompt. Suspends until the agent returns a final answer.
         * Designed to be called from a `lifecycleScope.launch {}` block in the UI.
         */
        suspend fun submitPrompt(prompt: String) =
            this@AgentForegroundService.submitPrompt(prompt)

        /**
         * Signal the currently-running inference to stop gracefully.
         * The [serviceScope]'s SupervisorJob keeps the service alive.
         */
        fun cancelCurrentTask() {
            currentJob?.cancel()
            transitionState(AgentServiceState.Idle)
            Log.d(TAG, "Current inference job cancelled by user.")
        }

        /** Called by AgentLoop to propagate tool-execution state to the notification. */
        fun notifyToolExecution(toolName: String) =
            transitionState(AgentServiceState.ExecutingTool(toolName))
    }

    private val binder = AgentBinder()

    // ─────────────────────────────────────────────────────────────────────────
    // Service lifecycle
    // ─────────────────────────────────────────────────────────────────────────

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        // startForeground() MUST be called within 5 seconds of onCreate() on API 26+
        // and within the same ANR timeout on API 34+ (targetSdk >= 34 enforcement).
        startForeground(NOTIFICATION_ID, buildNotification("Idle"))
        Log.d(TAG, "Foreground service started.")
    }

    override fun onBind(intent: Intent?): IBinder = binder

    /**
     * Handles intents from external triggers (Tasker, BroadcastReceiver).
     *
     * Example Tasker HTTP/Shell action:
     *   am startservice -n com.example.agent/.service.AgentForegroundService
     *                   -a com.example.agent.ACTION_SUBMIT_PROMPT
     *                   --es extra_prompt "What is the battery level?"
     */
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_SUBMIT_PROMPT) {
            val prompt = intent.getStringExtra(EXTRA_PROMPT)
            if (!prompt.isNullOrBlank()) {
                serviceScope.launch { submitPrompt(prompt) }
            }
        }
        // START_STICKY: if the OS kills the service under memory pressure,
        // it will be restarted with a null intent — the agent returns to Idle.
        return START_STICKY
    }

    /**
     * CRITICAL: Cancel [serviceScope] here.
     *
     * This propagates CancellationException to any running inference coroutine.
     * MediaPipe's LlmInference session is then released by the caller (MainActivity)
     * via its own onDestroy. We do NOT hold a direct reference to the native session
     * in this service to avoid double-free.
     */
    override fun onDestroy() {
        serviceScope.cancel("AgentForegroundService destroyed")
        Log.d(TAG, "Service destroyed — coroutine scope cancelled.")
        super.onDestroy()
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Core inference dispatch
    // ─────────────────────────────────────────────────────────────────────────

    private suspend fun submitPrompt(prompt: String) {
        val loop = agentLoop ?: run {
            val msg = "AgentLoop not initialised. Call AgentBinder.setup() first."
            Log.e(TAG, msg)
            _tokenStream.emit("Error: $msg")
            return
        }

        // ── Memory guard ──────────────────────────────────────────────────────
        resourceManager?.let { rm ->
            val check = rm.checkMemoryAvailable(applicationContext)
            if (!check.isAvailable) {
                val msg = "Insufficient RAM: ${check.availableMb}MB free. ${check.suggestion}"
                Log.w(TAG, msg)
                transitionState(AgentServiceState.Error(msg))
                _tokenStream.emit(msg)
                return
            }
            if (check.suggestion.isNotEmpty()) {
                Log.w(TAG, "Memory warning: ${check.suggestion}")
            }
        }

        // ── Cancel any previous running job (single-task policy) ─────────────
        currentJob?.cancel()

        currentJob = serviceScope.launch {
            try {
                transitionState(AgentServiceState.Thinking)
                val response = loop.run(prompt)
                _tokenStream.emit(response)
                transitionState(AgentServiceState.Idle)
            } catch (e: CancellationException) {
                // Normal cancellation — do not log as error
                transitionState(AgentServiceState.Idle)
                Log.d(TAG, "Inference cancelled.")
            } catch (e: Exception) {
                Log.e(TAG, "Inference error: ${e.message}", e)
                transitionState(AgentServiceState.Error(e.message ?: "Unknown inference error"))
                _tokenStream.emit("Error: ${e.message}")
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // State management & notification
    // ─────────────────────────────────────────────────────────────────────────

    private fun transitionState(state: AgentServiceState) {
        _agentState.tryEmit(state)
        val statusText = when (state) {
            is AgentServiceState.Idle -> "Idle — pronto"
            is AgentServiceState.Thinking -> "Pensando..."
            is AgentServiceState.ExecutingTool -> "Esecuzione: ${state.toolName}"
            is AgentServiceState.Error -> "Errore: ${state.message.take(50)}"
        }
        updateNotification(statusText)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Notification helpers
    // ─────────────────────────────────────────────────────────────────────────

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Agent Status",
                // IMPORTANCE_LOW → silent, no heads-up, but persistent in shade
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Mostra lo stato corrente dell'agente autonomo"
                setShowBadge(false)
                enableVibration(false)
                enableLights(false)
            }
            getSystemService(NotificationManager::class.java)
                .createNotificationChannel(channel)
        }
    }

    private fun buildNotification(status: String): Notification {
        val launchPi = PendingIntent.getActivity(
            this, 0,
            packageManager.getLaunchIntentForPackage(packageName),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Autonomous Agent")
            .setContentText(status)
            // Use a built-in icon; replace with R.drawable.ic_agent in production
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setContentIntent(launchPi)
            .setOngoing(true)          // Cannot be dismissed by swipe
            .setOnlyAlertOnce(true)    // No repeated sound/vibration on updates
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun updateNotification(status: String) {
        getSystemService(NotificationManager::class.java)
            .notify(NOTIFICATION_ID, buildNotification(status))
    }
}

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
import dagger.hilt.android.AndroidEntryPoint
import com.example.agent.core.AgentLoop
import com.example.agent.core.LlmInferenceWrapper
import com.example.agent.memory.LocalMemoryManager
import javax.inject.Inject
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

import com.example.agent.orchestrator.AgentOrchestrator
import com.example.agent.mvi.AgentState
import com.example.agent.mvi.AgentIntent
import com.example.agent.mvi.toStatusLabel
import kotlinx.coroutines.flow.collectLatest

/**
 * # AgentForegroundService
 *
 * A persistent Android Foreground Service that hosts the Gemma agent loop by
 * delegating to [AgentOrchestrator].
 *
 * It acts as the "priority anchor" for the process and provides status updates
 * via a persistent Notification.
 */
@AndroidEntryPoint
class AgentForegroundService : Service() {

    companion object {
        private const val TAG = "AgentForegroundSvc"
        const val CHANNEL_ID = "agent_foreground_channel"
        const val NOTIFICATION_ID = 1001

        const val ACTION_SUBMIT_PROMPT = "com.example.agent.ACTION_SUBMIT_PROMPT"
        const val EXTRA_PROMPT = "extra_prompt"
    }

    @Inject lateinit var orchestrator: AgentOrchestrator

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    inner class AgentBinder : Binder() {
        val service: AgentForegroundService get() = this@AgentForegroundService
        
        fun submitPrompt(prompt: String) {
            orchestrator.dispatch(AgentIntent.UserPrompt(prompt))
        }

        fun cancelCurrentTask() {
            orchestrator.dispatch(AgentIntent.CancelInference)
        }
    }

    private val binder = AgentBinder()

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification("Sincronizzazione in corso..."))
        
        // Observe orchestrator state to update notification
        serviceScope.launch {
            orchestrator.state.collectLatest { state ->
                updateNotification(state.toStatusLabel())
            }
        }
        Log.d(TAG, "Foreground service started and bound to Orchestrator.")
    }

    override fun onBind(intent: Intent?): IBinder = binder

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_SUBMIT_PROMPT) {
            val prompt = intent.getStringExtra(EXTRA_PROMPT)
            if (!prompt.isNullOrBlank()) {
                orchestrator.dispatch(AgentIntent.UserPrompt(prompt))
            }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        serviceScope.cancel("AgentForegroundService destroyed")
        super.onDestroy()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Agent Status",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Mostra lo stato corrente dell'agente autonomo"
                setShowBadge(false)
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    private fun buildNotification(status: String): Notification {
        val launchPi = PendingIntent.getActivity(
            this, 0,
            packageManager.getLaunchIntentForPackage(packageName),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("GemCode Agent")
            .setContentText(status)
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setContentIntent(launchPi)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }

    private fun updateNotification(status: String) {
        getSystemService(NotificationManager::class.java)
            .notify(NOTIFICATION_ID, buildNotification(status))
    }
}

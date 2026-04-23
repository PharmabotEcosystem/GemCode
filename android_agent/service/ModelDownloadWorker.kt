package com.example.agent.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.example.agent.core.ModelDownloader
import kotlinx.coroutines.flow.collect
import java.io.File

class ModelDownloadWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    companion object {
        const val KEY_URL = "url"
        const val KEY_DEST_PATH = "dest_path"
        const val PROGRESS_KEY = "progress"
    }

    private val notificationManager =
        appContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    override suspend fun doWork(): Result {
        val url = inputData.getString(KEY_URL) ?: return Result.failure()
        val destPath = inputData.getString(KEY_DEST_PATH) ?: return Result.failure()

        val destFile = File(destPath)
        createNotificationChannel()

        val notification = createNotification("Starting download...", 0, true)
        
        // Use the appropriate foreground service type depending on Android version
        val foregroundInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ForegroundInfo(1002, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            ForegroundInfo(1002, notification)
        }
        
        setForeground(foregroundInfo)

        return try {
            var success = false
            ModelDownloader.downloadModel(url, destFile).collect { state ->
                when (state) {
                    is com.example.agent.core.DownloadState.Downloading -> {
                        val p = state.progress?.let { (it * 100).toInt() } ?: 0
                        setProgress(workDataOf(PROGRESS_KEY to p))
                        notificationManager.notify(1002, createNotification("Downloading...", p, false))
                    }
                    is com.example.agent.core.DownloadState.Success -> {
                        success = true
                    }
                    is com.example.agent.core.DownloadState.Error -> {
                        success = false
                    }
                    else -> {}
                }
            }
            if (success) Result.success() else Result.failure()
        } catch (e: Exception) {
            Result.failure()
        }
    }

    private fun createNotification(text: String, progress: Int, indeterminate: Boolean): Notification {
        return NotificationCompat.Builder(applicationContext, "download_channel")
            .setContentTitle("Downloading Model")
            .setContentText(if (progress > 0) "$text $progress%" else text)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setProgress(100, progress, indeterminate)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                "download_channel",
                "Model Downloads",
                NotificationManager.IMPORTANCE_LOW
            )
            notificationManager.createNotificationChannel(channel)
        }
    }
}

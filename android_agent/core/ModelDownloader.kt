package com.example.agent.core

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

sealed class DownloadState {
    object Idle : DownloadState()
    data class Downloading(val progress: Float) : DownloadState()
    data class Success(val file: File) : DownloadState()
    data class Error(val message: String) : DownloadState()
}

object ModelDownloader {
    fun downloadModel(urlStr: String, destFile: File): Flow<DownloadState> = flow {
        try {
            emit(DownloadState.Downloading(0f))
            var currentUrl = urlStr
            var connection: HttpURLConnection
            var redirects = 0
            val maxRedirects = 5

            while (true) {
                val url = URL(currentUrl)
                connection = url.openConnection() as HttpURLConnection
                connection.instanceFollowRedirects = true // Try auto-follow first

                val status = connection.responseCode
                if (status == HttpURLConnection.HTTP_MOVED_TEMP ||
                    status == HttpURLConnection.HTTP_MOVED_PERM ||
                    status == HttpURLConnection.HTTP_SEE_OTHER ||
                    status == 307 || status == 308) {
                    
                    if (redirects >= maxRedirects) {
                        emit(DownloadState.Error("Too many redirects"))
                        return@flow
                    }
                    val newUrl = connection.getHeaderField("Location")
                    Log.d("ModelDownloader", "Redirecting to: $newUrl")
                    currentUrl = newUrl
                    redirects++
                    continue
                }
                break
            }

            if (connection.responseCode != HttpURLConnection.HTTP_OK) {
                emit(DownloadState.Error("Server returned HTTP ${connection.responseCode}"))
                return@flow
            }

            val fileLength = connection.contentLength
            val input = connection.inputStream
            val output = FileOutputStream(destFile)

            val data = ByteArray(8192)
            var total: Long = 0
            var count: Int

            while (input.read(data).also { count = it } != -1) {
                total += count
                if (fileLength > 0) {
                    emit(DownloadState.Downloading(total.toFloat() / fileLength.toFloat()))
                }
                output.write(data, 0, count)
            }

            output.flush()
            output.close()
            input.close()
            emit(DownloadState.Success(destFile))
        } catch (e: Exception) {
            emit(DownloadState.Error(e.message ?: "Unknown download error"))
        }
    }.flowOn(Dispatchers.IO)
}

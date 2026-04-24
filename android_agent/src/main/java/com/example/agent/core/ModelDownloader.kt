package com.example.agent.core

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

sealed class DownloadState {
    object Idle : DownloadState()
    data class Downloading(
        val progress: Float?,
        val downloadedBytes: Long,
        val totalBytes: Long?,
    ) : DownloadState()
    data class Success(val file: File) : DownloadState()
    data class Error(val message: String) : DownloadState()
}

object ModelDownloader {
    fun downloadModel(urlStr: String, destFile: File, expectedMinBytes: Long = 1L): Flow<DownloadState> = flow {
        val tmpFile = File(destFile.parentFile, "${destFile.name}.download")
        try {
            destFile.parentFile?.mkdirs()
            if (tmpFile.exists()) tmpFile.delete()

            emit(DownloadState.Downloading(progress = 0f, downloadedBytes = 0L, totalBytes = null))
            var currentUrl = urlStr
            var connection: HttpURLConnection
            var redirects = 0
            val maxRedirects = 5

            while (true) {
                val url = URL(currentUrl)
                connection = url.openConnection() as HttpURLConnection
                connection.instanceFollowRedirects = true
                connection.connectTimeout = 20_000
                connection.readTimeout = 60_000

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
                    if (newUrl.isNullOrBlank()) {
                        emit(DownloadState.Error("Redirect without Location header"))
                        return@flow
                    }
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

            val fileLength = connection.contentLengthLong.takeIf { it > 0L }

            val data = ByteArray(8192)
            var total: Long = 0
            var count: Int

            connection.inputStream.use { input ->
                FileOutputStream(tmpFile).use { output ->
                    while (input.read(data).also { count = it } != -1) {
                        total += count
                        if (fileLength != null) {
                            emit(
                                DownloadState.Downloading(
                                    progress = total.toFloat() / fileLength.toFloat(),
                                    downloadedBytes = total,
                                    totalBytes = fileLength,
                                ),
                            )
                        } else {
                            emit(
                                DownloadState.Downloading(
                                    progress = null,
                                    downloadedBytes = total,
                                    totalBytes = null,
                                ),
                            )
                        }
                        output.write(data, 0, count)
                    }
                    output.flush()
                }
            }

            if (total < expectedMinBytes) {
                tmpFile.delete()
                emit(DownloadState.Error("Downloaded file is too small (${total} bytes)"))
                return@flow
            }

            if (destFile.exists()) destFile.delete()
            if (!tmpFile.renameTo(destFile)) {
                tmpFile.delete()
                emit(DownloadState.Error("Could not finalize downloaded file"))
                return@flow
            }

            emit(DownloadState.Success(destFile))
        } catch (e: CancellationException) {
            tmpFile.delete()
            throw e
        } catch (e: Exception) {
            tmpFile.delete()
            emit(DownloadState.Error(e.message ?: "Unknown download error"))
        }
    }.flowOn(Dispatchers.IO)
}

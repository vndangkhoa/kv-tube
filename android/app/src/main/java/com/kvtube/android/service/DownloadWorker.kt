package com.kvtube.android.service

import android.app.Notification
import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import com.kvtube.android.data.extractor.ExtractorHelper
import com.kvtube.android.data.local.DownloadedVideoEntity
import com.kvtube.android.data.model.DownloadProgress
import com.kvtube.android.data.model.DownloadStatus
import com.kvtube.android.data.model.Quality
import com.kvtube.android.data.repository.DownloadRepository
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream
import com.kvtube.android.data.api.KVApi
import com.kvtube.android.data.model.PlaybackInfo
import com.kvtube.android.data.model.PlaybackFormat
import com.kvtube.android.data.model.ExtractedStream

@HiltWorker
class DownloadWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted workerParams: WorkerParameters,
    private val downloadRepository: DownloadRepository,
    private val extractorHelper: ExtractorHelper,
    private val okHttpClient: OkHttpClient,
    private val api: KVApi
) : CoroutineWorker(appContext, workerParams) {

    companion object {
        const val PROGRESS = "progress"
        const val VIDEO_ID = "video_id"
        const val QUALITY = "quality"
        const val TITLE = "title"
        const val THUMBNAIL = "thumbnail"
        const val CHANNEL_TITLE = "channel_title"
        const val DURATION = "duration"
    }

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val videoId = inputData.getString(VIDEO_ID) ?: return@withContext Result.failure()
        val qualityStr = inputData.getString(QUALITY) ?: "recommended"
        val title = inputData.getString(TITLE) ?: "Unknown"
        val thumbnail = inputData.getString(THUMBNAIL) ?: ""
        val channelTitle = inputData.getString(CHANNEL_TITLE) ?: ""
        val duration = inputData.getString(DURATION) ?: ""

        val quality = when (qualityStr) {
            "low" -> Quality.LOW
            "best" -> Quality.BEST
            else -> Quality.RECOMMENDED
        }

        setForeground(createForegroundInfo("Starting download...", 0, true))

        try {
            // Phase 1: Extract stream URL via NewPipeExtractor
            updateProgress(
                videoId = videoId,
                status = DownloadStatus.EXTRACTING,
                message = "Extracting video URL...",
                title = title,
                thumbnail = thumbnail,
                channelTitle = channelTitle,
                duration = duration,
                quality = qualityStr
            )

            var extracted = try {
                extractorHelper.extractStreamUrl(videoId, quality)
            } catch (e: Exception) {
                ExtractedStream(videoUrl = "")
            }

            if (extracted.videoUrl.isEmpty()) {
                val playbackInfo = api.getPlaybackInfo(videoId)
                val format = selectPlaybackFormat(playbackInfo, quality)
                if (format != null) {
                    extracted = ExtractedStream(
                        videoUrl = format.url,
                        height = format.height,
                        isDash = !format.hasAudio
                    )
                }
            }

            if (extracted.videoUrl.isEmpty()) {
                throw Exception("No suitable stream found (tried client extraction and server fallback)")
            }

            // Phase 2: Download file(s)
            updateProgress(
                videoId = videoId,
                status = DownloadStatus.DOWNLOADING,
                message = "Downloading...",
                title = title,
                thumbnail = thumbnail,
                channelTitle = channelTitle,
                duration = duration,
                quality = qualityStr
            )

            val outputDir = downloadRepository.getDownloadDir(applicationContext)
            val baseName = sanitizeFileName(title)
            val outputFile = File(outputDir, "${baseName}_${videoId}.mp4")

            if (extracted.isDash && extracted.audioUrl != null) {
                throw Exception("DASH merging not yet implemented; try a lower quality")
            } else {
                // Progressive: single file download
                downloadFile(extracted.videoUrl, outputFile) { percent, speed, eta ->
                    updateProgress(
                        videoId = videoId,
                        percent = percent,
                        speed = speed,
                        eta = eta,
                        status = DownloadStatus.DOWNLOADING,
                        message = "Downloading ${percent.toInt()}%",
                        title = title,
                        thumbnail = thumbnail,
                        channelTitle = channelTitle,
                        duration = duration,
                        quality = qualityStr
                    )
                }
            }

            // Phase 3: Save to Room DB
            val entity = DownloadedVideoEntity(
                videoId = videoId,
                title = title,
                quality = qualityStr,
                filePath = outputFile.absolutePath,
                fileSize = outputFile.length(),
                duration = duration,
                thumbnail = thumbnail,
                channelTitle = channelTitle,
                downloadedAt = System.currentTimeMillis()
            )
            downloadRepository.insertDownload(entity)

            updateProgress(
                videoId = videoId,
                percent = 100f,
                status = DownloadStatus.COMPLETED,
                message = "Download complete",
                title = title,
                thumbnail = thumbnail,
                channelTitle = channelTitle,
                duration = duration,
                quality = qualityStr
            )

            Result.success()
        } catch (e: Exception) {
            e.printStackTrace()
            updateProgress(
                videoId = videoId,
                status = DownloadStatus.ERROR,
                message = e.message ?: "Download failed",
                title = title,
                thumbnail = thumbnail,
                channelTitle = channelTitle,
                duration = duration,
                quality = qualityStr
            )
            Result.failure()
        }
    }

    private fun downloadFile(
        url: String,
        outputFile: File,
        onProgress: (percent: Float, speed: String, eta: String) -> Unit
    ) {
        val request = Request.Builder()
            .url(url)
            .build()

        okHttpClient.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw Exception("Download failed: HTTP ${response.code}")
            }

            val body = response.body ?: throw Exception("Empty response body")
            val contentLength = body.contentLength()

            val inputStream = body.byteStream()
            val outputStream = FileOutputStream(outputFile)
            val buffer = ByteArray(8 * 1024)
            var bytesRead: Long = 0
            var lastUpdate = System.currentTimeMillis()
            var lastBytes = 0L

            inputStream.use { input ->
                outputStream.use { output ->
                    var read: Int
                    while (input.read(buffer).also { read = it } != -1) {
                        output.write(buffer, 0, read)
                        bytesRead += read

                        val now = System.currentTimeMillis()
                        if (now - lastUpdate > 500 || bytesRead >= contentLength) {
                            val elapsed = (now - lastUpdate) / 1000f
                            if (contentLength > 0 && elapsed > 0) {
                                val percent = (bytesRead.toFloat() / contentLength) * 100f
                                val speedBytes = ((bytesRead - lastBytes) / elapsed).toLong()
                                val speedStr = formatSpeed(speedBytes)
                                val remaining = ((contentLength - bytesRead).toFloat() / speedBytes).toLong()
                                val etaStr = formatEta(remaining)

                                onProgress(percent, speedStr, etaStr)
                            } else {
                                onProgress(0f, "", "")
                            }

                            lastUpdate = now
                            lastBytes = bytesRead
                        }
                    }
                }
            }
        }
    }

    private fun updateProgress(
        videoId: String,
        percent: Float = 0f,
        speed: String = "",
        eta: String = "",
        status: DownloadStatus,
        message: String,
        title: String,
        thumbnail: String,
        channelTitle: String,
        duration: String,
        quality: String
    ) {
        downloadRepository.updateProgress(
            videoId,
            DownloadProgress(
                videoId = videoId,
                percent = percent,
                speed = speed,
                eta = eta,
                status = status,
                message = message,
                title = title,
                thumbnail = thumbnail,
                channelTitle = channelTitle,
                duration = duration,
                quality = quality
            )
        )
    }

    private fun createForegroundInfo(
        message: String,
        progress: Int,
        indeterminate: Boolean
    ): ForegroundInfo {
        val notification: Notification = NotificationCompat.Builder(
            applicationContext, DownloadService.CHANNEL_ID
        )
            .setContentTitle("Download")
            .setContentText(message)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .apply {
                if (!indeterminate) {
                    setProgress(100, progress, false)
                }
            }
            .setOngoing(true)
            .build()

        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ForegroundInfo(
                DownloadService.NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            )
        } else {
            ForegroundInfo(DownloadService.NOTIFICATION_ID, notification)
        }
    }

    private fun sanitizeFileName(name: String): String {
        return name.replace(Regex("[/\\\\:*?\"<>|]"), "_")
            .take(100)
    }

    private fun selectPlaybackFormat(playbackInfo: PlaybackInfo, quality: Quality): PlaybackFormat? {
        val maxHeight = when (quality) {
            Quality.LOW -> 360
            Quality.RECOMMENDED -> 1080
            Quality.BEST -> Int.MAX_VALUE
        }

        val progressive = playbackInfo.videoFormats.filter { it.hasAudio && it.url.isNotEmpty() }
        val bestProgressive = progressive.filter { it.height <= maxHeight }
            .maxByOrNull { it.height }
            ?: progressive.minByOrNull { it.height }

        if (bestProgressive != null) {
            return bestProgressive
        }

        val videoOnly = playbackInfo.videoFormats.filter { !it.hasAudio && it.url.isNotEmpty() }
        return videoOnly.filter { it.height <= maxHeight }
            .maxByOrNull { it.height }
            ?: videoOnly.minByOrNull { it.height }
    }

    private fun formatSpeed(bytesPerSec: Long): String {
        return when {
            bytesPerSec < 1024 -> "$bytesPerSec B/s"
            bytesPerSec < 1024 * 1024 -> "${bytesPerSec / 1024} KB/s"
            else -> String.format("%.1f MB/s", bytesPerSec / (1024f * 1024f))
        }
    }

    private fun formatEta(seconds: Long): String {
        return when {
            seconds < 60 -> "${seconds}s"
            seconds < 3600 -> "${seconds / 60}m ${seconds % 60}s"
            else -> "${seconds / 3600}h ${(seconds % 3600) / 60}m"
        }
    }
}

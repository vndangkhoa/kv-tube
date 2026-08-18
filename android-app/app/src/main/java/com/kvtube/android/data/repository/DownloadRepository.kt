package com.kvtube.android.data.repository

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.kvtube.android.data.local.DownloadedVideoDao
import com.kvtube.android.data.local.DownloadedVideoEntity
import com.kvtube.android.data.local.SettingsDataStore
import com.kvtube.android.data.model.DownloadProgress
import com.kvtube.android.data.model.DownloadStatus
import com.kvtube.android.data.model.Quality
import com.kvtube.android.service.DownloadWorker
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileInputStream
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class DownloadRepository @Inject constructor(
    private val downloadDao: DownloadedVideoDao,
    private val settingsDataStore: SettingsDataStore
) {
    companion object {
        private const val TAG = "DownloadRepository"
    }

    private val _activeDownloads = MutableStateFlow<Map<String, DownloadProgress>>(emptyMap())
    val activeDownloads = _activeDownloads.asStateFlow()

    fun updateProgress(videoId: String, progress: DownloadProgress) {
        val current = _activeDownloads.value.toMutableMap()
        current[videoId] = progress
        _activeDownloads.value = current
    }

    fun removeProgress(videoId: String) {
        val current = _activeDownloads.value.toMutableMap()
        current.remove(videoId)
        _activeDownloads.value = current
    }

    fun getAllDownloads(): Flow<List<DownloadedVideoEntity>> = downloadDao.getAll()

    suspend fun getDownload(videoId: String): DownloadedVideoEntity? = downloadDao.getByVideoId(videoId)

    suspend fun insertDownload(entity: DownloadedVideoEntity) = downloadDao.insert(entity)

    suspend fun deleteByVideoId(context: Context, videoId: String) = withContext(Dispatchers.IO) {
        cancelDownload(context, videoId)
        val entity = downloadDao.getByVideoId(videoId)
        if (entity != null) {
            try {
                val file = File(entity.filePath)
                if (file.exists()) file.delete()

                if (!entity.contentUri.isNullOrEmpty()) {
                    val uri = Uri.parse(entity.contentUri)
                    context.contentResolver.delete(uri, null, null)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error deleting file for $videoId: ${e.message}")
            }
        }
        downloadDao.deleteByVideoId(videoId)
        removeProgress(videoId)
    }

    suspend fun renameDownload(videoId: String, newName: String) {
        downloadDao.updateTitle(videoId, newName)
    }

    fun enqueueDownload(
        context: Context,
        videoId: String,
        title: String,
        thumbnail: String,
        channelTitle: String,
        duration: String,
        quality: Quality
    ) {
        val inputData = Data.Builder()
            .putString(DownloadWorker.VIDEO_ID, videoId)
            .putString(DownloadWorker.TITLE, title)
            .putString(DownloadWorker.THUMBNAIL, thumbnail)
            .putString(DownloadWorker.CHANNEL_TITLE, channelTitle)
            .putString(DownloadWorker.DURATION, duration)
            .putString(DownloadWorker.QUALITY, quality.value)
            .build()

        val workRequest = OneTimeWorkRequestBuilder<DownloadWorker>()
            .setInputData(inputData)
            .addTag("download_$videoId")
            .build()

        updateProgress(
            videoId,
            DownloadProgress(
                videoId = videoId,
                percent = 0f,
                status = DownloadStatus.QUEUED,
                message = "Download queued",
                title = title,
                thumbnail = thumbnail,
                channelTitle = channelTitle,
                duration = duration,
                quality = quality.value
            )
        )

        WorkManager.getInstance(context).enqueueUniqueWork(
            "download_$videoId",
            ExistingWorkPolicy.KEEP,
            workRequest
        )
    }

    fun cancelDownload(context: Context, videoId: String) {
        WorkManager.getInstance(context).cancelUniqueWork("download_$videoId")
        removeProgress(videoId)
    }

    fun getDownloadDir(context: Context): File {
        val dir = File(context.filesDir, "downloads")
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

    fun getTempDownloadDir(context: Context): File {
        val dir = File(context.cacheDir, "temp_downloads")
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

    fun saveToMediaStore(context: Context, sourceFile: File, fileName: String): String? {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val contentValues = ContentValues().apply {
                put(MediaStore.Video.Media.DISPLAY_NAME, fileName)
                put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
                put(MediaStore.Video.Media.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/KVTube")
                put(MediaStore.Video.Media.IS_PENDING, 1)
            }

            val resolver = context.contentResolver
            val uri = resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, contentValues) ?: return null

            try {
                resolver.openOutputStream(uri)?.use { output ->
                    FileInputStream(sourceFile).use { input ->
                        input.copyTo(output)
                    }
                }
                contentValues.clear()
                contentValues.put(MediaStore.Video.Media.IS_PENDING, 0)
                resolver.update(uri, contentValues, null, null)
                return uri.toString()
            } catch (e: Exception) {
                Log.e(TAG, "Failed to copy to MediaStore: ${e.message}")
                resolver.delete(uri, null, null)
                return null
            }
        }
        return null
    }
}

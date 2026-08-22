package com.kvtube.android.data.update

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.core.content.FileProvider
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class UpdateManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val okHttpClient: OkHttpClient,
    private val json: Json
) {
    companion object {
        private const val TAG = "UpdateManager"
        private const val GITHUB_API_URL =
            "https://api.github.com/repos/vndangkhoa/kv-tube/releases?per_page=30"
    }

    suspend fun checkForUpdate(currentVersion: String): UpdateInfo? = withContext(Dispatchers.IO) {
        try {
            val req = Request.Builder()
                .url(GITHUB_API_URL)
                .header("Accept", "application/vnd.github.v3+json")
                .build()

            val response = okHttpClient.newCall(req).execute()
            if (!response.isSuccessful) return@withContext null

            val body = response.body?.string() ?: return@withContext null
            val releases = json.parseToJsonElement(body).jsonArray

            // Phone releases only: skip tv-* tags and any TV-named APK asset so
            // the phone never downloads the Android TV build.
            for (element in releases) {
                val root = element.jsonObject
                val tagName = root["tag_name"]?.jsonPrimitive?.content ?: ""
                if (tagName.removePrefix("v").startsWith("tv")) continue

                val releaseNotes = root["body"]?.jsonPrimitive?.content ?: ""
                val latestVer = tagName.removePrefix("v").trim()
                val currentVer = currentVersion.removePrefix("v").trim()

                val assets = root["assets"]?.jsonArray
                var apkUrl = ""
                assets?.forEach { assetElement ->
                    val assetObj = assetElement.jsonObject
                    val name = assetObj["name"]?.jsonPrimitive?.content ?: ""
                    if (name.endsWith(".apk", ignoreCase = true) &&
                        !name.contains("tv", ignoreCase = true)
                    ) {
                        apkUrl = assetObj["browser_download_url"]?.jsonPrimitive?.content ?: ""
                    }
                }

                if (apkUrl.isNotEmpty() && isNewerVersion(latestVer, currentVer)) {
                    return@withContext UpdateInfo(
                        latestVersion = latestVer,
                        downloadUrl = apkUrl,
                        releaseNotes = releaseNotes
                    )
                }
                // Newest non-TV release has no newer phone build — stop early.
                if (apkUrl.isNotEmpty()) return@withContext null
            }
            null
        } catch (e: Exception) {
            Log.e(TAG, "Check update error: ${e.message}")
            null
        }
    }

    private fun isNewerVersion(latest: String, current: String): Boolean {
        try {
            val latestParts = latest.split(".").map { it.filter { c -> c.isDigit() }.toIntOrNull() ?: 0 }
            val currentParts = current.split(".").map { it.filter { c -> c.isDigit() }.toIntOrNull() ?: 0 }

            val maxLen = maxOf(latestParts.size, currentParts.size)
            for (i in 0 until maxLen) {
                val l = latestParts.getOrElse(i) { 0 }
                val c = currentParts.getOrElse(i) { 0 }
                if (l > c) return true
                if (l < c) return false
            }
        } catch (_: Exception) {}
        return false
    }

    suspend fun downloadUpdate(url: String, onProgress: (Float) -> Unit): File? = withContext(Dispatchers.IO) {
        try {
            val req = Request.Builder().url(url).build()
            val resp = okHttpClient.newCall(req).execute()
            if (!resp.isSuccessful) return@withContext null

            val body = resp.body ?: return@withContext null
            val totalBytes = body.contentLength()
            val updateFile = File(context.cacheDir, "update.apk")

            body.byteStream().use { input ->
                FileOutputStream(updateFile).use { output ->
                    val buffer = ByteArray(8 * 1024)
                    var bytesRead: Long = 0
                    var read: Int
                    while (input.read(buffer).also { read = it } != -1) {
                        output.write(buffer, 0, read)
                        bytesRead += read
                        if (totalBytes > 0) {
                            onProgress(bytesRead.toFloat() / totalBytes)
                        }
                    }
                }
            }
            updateFile
        } catch (e: Exception) {
            Log.e(TAG, "Download update failed: ${e.message}")
            null
        }
    }

    fun installApk(apkFile: File) {
        try {
            val uri: Uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                FileProvider.getUriForFile(
                    context,
                    "${context.packageName}.fileprovider",
                    apkFile
                )
            } else {
                Uri.fromFile(apkFile)
            }

            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Install apk failed: ${e.message}")
        }
    }
}

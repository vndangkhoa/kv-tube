package com.kvtube.tv.data.repository

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.core.content.FileProvider
import com.kvtube.tv.data.model.TvUpdateInfo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.TimeUnit

/**
 * TV Update checker — mirrors android-app UpdateManager but tailored for TV (no Hilt).
 * Checks GitHub tags + releases + Forgejo tags, compares with BuildConfig.VERSION_NAME.
 * Download uses cacheDir/update-tv.apk and FileProvider install.
 */
object TvUpdateManager {
    private const val TAG = "TvUpdateManager"
    private const val GITHUB_TAGS_URL = "https://api.github.com/repos/vndangkhoa/kv-tube/tags"
    private const val GITHUB_RELEASE_LATEST_URL = "https://api.github.com/repos/vndangkhoa/kv-tube/releases/latest"
    private const val FORGEJO_TAGS_URL = "https://git.khoavo.myds.me/api/v1/repos/vndangkhoa/kv-tube/tags"

    private val client: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(12, TimeUnit.SECONDS)
            .readTimeout(12, TimeUnit.SECONDS)
            .build()
    }

    suspend fun checkForUpdate(currentVersion: String): TvUpdateInfo? = withContext(Dispatchers.IO) {
        try {
            // Try GitHub release first (has apk assets when published)
            val ghRelease = tryGithubRelease(currentVersion)
            if (ghRelease != null) return@withContext ghRelease

            // Fall back to tags (no assets, but we can still inform user of newer version)
            val ghTag = tryGithubTags(currentVersion)
            if (ghTag != null) return@withContext ghTag

            // Try Forgejo tags as last resort
            val fjTag = tryForgejoTags(currentVersion)
            if (fjTag != null) return@withContext fjTag

            null
        } catch (e: Exception) {
            Log.e(TAG, "checkForUpdate error: ${e.message}", e)
            null
        }
    }

    private fun tryGithubRelease(currentVersion: String): TvUpdateInfo? {
        return try {
            val req = Request.Builder()
                .url(GITHUB_RELEASE_LATEST_URL)
                .header("Accept", "application/vnd.github.v3+json")
                .header("User-Agent", "KV-Tube-TV")
                .build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return null
                val body = resp.body?.string() ?: return null
                val root = JSONObject(body)
                val tagName = root.optString("tag_name", "")
                if (tagName.isBlank()) return null
                val latestVer = tagName.removePrefix("v").trim()
                val currentVer = currentVersion.removePrefix("v").trim().removeSuffix("-tv")
                if (!isNewerVersion(latestVer, currentVer)) return null

                val releaseNotes = root.optString("body", "")
                // Find apk asset — prefer tv, then generic apk
                var apkUrl = ""
                val assets = root.optJSONArray("assets")
                if (assets != null) {
                    apkUrl = findBestApkUrl(assets)
                }
                // If no apk asset, fallback to generic download URL pattern
                if (apkUrl.isBlank()) {
                    apkUrl = "https://github.com/vndangkhoa/kv-tube/releases/download/$tagName/kv-tube-tv.apk"
                }
                TvUpdateInfo(
                    latestVersion = latestVer,
                    currentVersion = currentVersion,
                    downloadUrl = apkUrl,
                    releaseNotes = releaseNotes,
                    tagName = tagName
                )
            }
        } catch (e: Exception) {
            Log.w(TAG, "GitHub release check failed: ${e.message}")
            null
        }
    }

    private fun tryGithubTags(currentVersion: String): TvUpdateInfo? {
        return try {
            val req = Request.Builder()
                .url(GITHUB_TAGS_URL)
                .header("Accept", "application/vnd.github.v3+json")
                .header("User-Agent", "KV-Tube-TV")
                .build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return null
                val body = resp.body?.string() ?: return null
                val arr = JSONArray(body)
                if (arr.length() == 0) return null
                // Tags are ordered newest first by GitHub API; pick first non-draft that is newer
                for (i in 0 until minOf(arr.length(), 20)) {
                    val obj = arr.optJSONObject(i) ?: continue
                    val name = obj.optString("name", "")
                    if (name.isBlank()) continue
                    val ver = name.removePrefix("v").trim()
                    val cur = currentVersion.removePrefix("v").trim().removeSuffix("-tv")
                    // Consider only tags that look like version (skip non-semver)
                    if (!ver.matches(Regex("""\d+(\.\d+){1,2}.*"""))) continue
                    if (isNewerVersion(ver, cur)) {
                        return TvUpdateInfo(
                            latestVersion = ver,
                            currentVersion = currentVersion,
                            downloadUrl = "https://github.com/vndangkhoa/kv-tube/releases/download/$name/kv-tube-tv.apk",
                            releaseNotes = obj.optString("message", "New version $name available. Check GitHub releases for changelog."),
                            tagName = name
                        )
                    }
                }
                null
            }
        } catch (e: Exception) {
            Log.w(TAG, "GitHub tags check failed: ${e.message}")
            null
        }
    }

    private fun tryForgejoTags(currentVersion: String): TvUpdateInfo? {
        return try {
            val req = Request.Builder()
                .url(FORGEJO_TAGS_URL)
                .header("Accept", "application/json")
                .header("User-Agent", "KV-Tube-TV")
                .build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return null
                val body = resp.body?.string() ?: return null
                val arr = JSONArray(body)
                if (arr.length() == 0) return null
                for (i in 0 until minOf(arr.length(), 20)) {
                    val obj = arr.optJSONObject(i) ?: continue
                    val name = obj.optString("name", "")
                    if (name.isBlank()) continue
                    val ver = name.removePrefix("v").trim()
                    val cur = currentVersion.removePrefix("v").trim().removeSuffix("-tv")
                    if (!ver.matches(Regex("""\d+(\.\d+){1,2}.*"""))) continue
                    if (isNewerVersion(ver, cur)) {
                        return TvUpdateInfo(
                            latestVersion = ver,
                            currentVersion = currentVersion,
                            downloadUrl = "https://git.khoavo.myds.me/vndangkhoa/kv-tube/releases/download/$name/kv-tube-tv.apk",
                            releaseNotes = obj.optString("message", "New version $name available."),
                            tagName = name
                        )
                    }
                }
                null
            }
        } catch (e: Exception) {
            Log.w(TAG, "Forgejo tags check failed: ${e.message}")
            null
        }
    }

    private fun findBestApkUrl(assets: JSONArray): String {
        var tvApk = ""
        var genericApk = ""
        for (i in 0 until assets.length()) {
            val a = assets.optJSONObject(i) ?: continue
            val name = a.optString("name", "")
            if (!name.endsWith(".apk", ignoreCase = true)) continue
            val url = a.optString("browser_download_url", "")
            if (url.isBlank()) continue
            val lower = name.lowercase()
            when {
                lower.contains("tv") || lower.contains("android-tv") -> {
                    tvApk = url
                    break // prefer tv immediately
                }
                genericApk.isBlank() -> genericApk = url
            }
        }
        return tvApk.ifBlank { genericApk }
    }

    fun isNewerVersion(latest: String, current: String): Boolean {
        return try {
            val lParts = latest.split(".").map { it.filter { c -> c.isDigit() }.toIntOrNull() ?: 0 }
            val cParts = current.split(".").map { it.filter { c -> c.isDigit() }.toIntOrNull() ?: 0 }
            val maxLen = maxOf(lParts.size, cParts.size)
            for (i in 0 until maxLen) {
                val l = lParts.getOrElse(i) { 0 }
                val c = cParts.getOrElse(i) { 0 }
                if (l > c) return true
                if (l < c) return false
            }
            false
        } catch (_: Exception) { false }
    }

    suspend fun downloadUpdate(context: Context, url: String, onProgress: (Float) -> Unit): File? = withContext(Dispatchers.IO) {
        try {
            Log.i(TAG, "Downloading update from $url")
            val req = Request.Builder()
                .url(url)
                .header("User-Agent", "KV-Tube-TV")
                .build()
            val resp = client.newCall(req).execute()
            if (!resp.isSuccessful) {
                Log.e(TAG, "Download failed HTTP ${resp.code}")
                return@withContext null
            }
            val body = resp.body ?: return@withContext null
            val totalBytes = body.contentLength()
            val outFile = File(context.cacheDir, "update-tv.apk")
            if (outFile.exists()) outFile.delete()
            body.byteStream().use { input ->
                FileOutputStream(outFile).use { output ->
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
            if (outFile.length() < 1024) {
                Log.e(TAG, "Downloaded file too small: ${outFile.length()}")
                outFile.delete()
                return@withContext null
            }
            outFile
        } catch (e: Exception) {
            Log.e(TAG, "Download update failed: ${e.message}", e)
            null
        }
    }

    fun installApk(context: Context, apkFile: File): Boolean {
        return try {
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
            true
        } catch (e: Exception) {
            Log.e(TAG, "Install apk failed: ${e.message}", e)
            false
        }
    }
}

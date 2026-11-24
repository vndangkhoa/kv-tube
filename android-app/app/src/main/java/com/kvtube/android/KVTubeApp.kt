package com.kvtube.android

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import androidx.work.WorkManager
import coil3.ImageLoader
import coil3.SingletonImageLoader
import coil3.disk.DiskCache
import coil3.memory.MemoryCache
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import coil3.request.crossfade
import com.kvtube.android.data.api.KVApi
import com.kvtube.android.data.local.SettingsDataStore
import com.kvtube.android.data.local.logToFile
import dagger.hilt.android.HiltAndroidApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import okio.Path.Companion.toOkioPath
import javax.inject.Inject

@HiltAndroidApp
class KVTubeApp : Application(), Configuration.Provider, SingletonImageLoader.Factory {

    @Inject
    lateinit var workerFactory: HiltWorkerFactory

    @Inject
    lateinit var kvApi: KVApi

    @Inject
    lateinit var settingsDataStore: SettingsDataStore

    @Inject
    lateinit var fileLogger: com.kvtube.android.data.local.FileLogger

    private val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .build()

    override fun onCreate() {
        super.onCreate()
        // Persist diagnostics to a pullable file — adb logcat is restricted on
        // some devices this app runs on.
        fileLogger.installCrashHandler()

        // Blocking init to ensure server URL + token + gateway mode are set before any API call
        runBlocking {
            val url = settingsDataStore.serverUrl.first()
            val token = settingsDataStore.invidiousToken.first()
            val cachedGateway = settingsDataStore.serverIsGateway.first()
            if (url.isNotBlank()) {
                kvApi.setServerUrl(url, cachedGateway)
            }
            kvApi.setToken(token)
            com.kvtube.android.data.local.ThumbnailRouter.setServer(url, kvApi.isGateway())
            logToFile("Startup", "server=$url token=${token.isNotBlank()} cachedGateway=$cachedGateway")
        }

        kvApi.onGatewayResolved = { _, isGateway ->
            applicationScope.launch {
                settingsDataStore.setServerIsGateway(isGateway)
            }
        }

        // Create notification channel for downloads (needed for WorkManager setForeground)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                "download_channel",
                "Downloads",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Download progress notifications"
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }

        // Manually initialize WorkManager with Hilt worker factory
        try {
            WorkManager.initialize(
                this,
                Configuration.Builder()
                    .setWorkerFactory(workerFactory)
                    .build()
            )
        } catch (e: Exception) {
            // Log or ignore if already initialized
        }
    }

    override fun newImageLoader(context: Context): ImageLoader {
        val okHttpClient = com.kvtube.android.data.net.KvHttp.client
        return ImageLoader.Builder(context)
            .memoryCache {
                MemoryCache.Builder()
                    .maxSizePercent(context, 0.25)
                    .build()
            }
            .diskCache {
                DiskCache.Builder()
                    .directory(context.cacheDir.resolve("image_cache").toOkioPath())
                    .maxSizeBytes(100L * 1024 * 1024)
                    .build()
            }
            .crossfade(120)
            .components {
                add(OkHttpNetworkFetcherFactory(okHttpClient))
            }
            .build()
    }
}

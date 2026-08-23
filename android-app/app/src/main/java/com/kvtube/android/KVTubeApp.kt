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
import coil3.gif.AnimatedImageDecoder
import coil3.gif.GifDecoder
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
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
import okhttp3.OkHttpClient
import java.io.File
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

        // Blocking init to ensure server URL + token are set before any API call
        runBlocking {
            val url = settingsDataStore.serverUrl.first()
            if (url.isNotBlank()) {
                kvApi.setServerUrl(url)
            }
            kvApi.setToken(settingsDataStore.invidiousToken.first())
            // All images route through the Invidious proxy too.
            com.kvtube.android.data.local.ThumbnailRouter.setServer(url)
            logToFile("Startup", "server=$url token=${settingsDataStore.invidiousToken.first().isNotBlank()}")
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
        val okHttpClient = OkHttpClient.Builder().build()
        return ImageLoader.Builder(context)
            .components {
                add(OkHttpNetworkFetcherFactory(okHttpClient))
                if (Build.VERSION.SDK_INT >= 28) {
                    add(AnimatedImageDecoder.Factory())
                } else {
                    add(GifDecoder.Factory())
                }
            }
            .build()
    }
}

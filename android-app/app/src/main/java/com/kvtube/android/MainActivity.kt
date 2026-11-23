package com.kvtube.android

import android.Manifest
import android.app.PictureInPictureParams
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.kvtube.android.data.local.SettingsDataStore
import com.kvtube.android.ui.MainScreen
import com.kvtube.android.ui.screens.watch.ExoPlayerView
import com.kvtube.android.ui.theme.KVTubeTheme
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var settingsDataStore: SettingsDataStore

    @Inject
    lateinit var playbackManager: com.kvtube.android.player.PlaybackManager

    private val _isInPipMode = MutableStateFlow(false)
    val isInPipMode: StateFlow<Boolean> = _isInPipMode

    private val _pipVideoUrl = MutableStateFlow<String?>(null)
    val pipVideoUrl: StateFlow<String?> = _pipVideoUrl

    private val _pipAudioUrl = MutableStateFlow<String?>(null)
    val pipAudioUrl: StateFlow<String?> = _pipAudioUrl

    fun setPipVideo(videoUrl: String, audioUrl: String?) {
        _pipVideoUrl.value = videoUrl
        _pipAudioUrl.value = audioUrl
    }

    /** Asks once for the notification permission — without it Android 13+
     *  silently hides the media card (notification + lock screen controls). */
    private val notificationPermissionRequest = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { /* denied → the media card simply stays hidden */ }

    private fun ensureNotificationPermission() {
        if (android.os.Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermissionRequest.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        ensureNotificationPermission()
        window.decorView.setBackgroundColor(0xFF000000.toInt())
        setContent {
            val themeMode by settingsDataStore.themeMode.collectAsState(initial = "dark")
            val isInPip by isInPipMode.collectAsState()
            val pipVideoUrl by pipVideoUrl.collectAsState()
            val pipAudioUrl by pipAudioUrl.collectAsState()

            KVTubeTheme(themeMode = themeMode) {
                com.kvtube.android.ui.adaptive.ProvideWidthClass {
                Surface(modifier = Modifier.fillMaxSize()) {
                if (isInPip && pipVideoUrl != null) {
                    // PiP mode: reattach to the app-wide player instead of
                    // creating a second one — avoids double audio and makes the
                    // fullscreen <-> PiP switch seamless.
                    LaunchedEffect(pipVideoUrl, pipAudioUrl) {
                        val url = pipVideoUrl!!
                        if (!playbackManager.isLoadedFor(url)) {
                            // Keep the real video id so later quality switches
                            // still recognise the item as "same video" and
                            // preserve the playback position.
                            val id = playbackManager.nowPlaying.value?.videoId?.ifBlank { null } ?: "pip"
                            playbackManager.play(id, url, pipAudioUrl)
                        }
                    }
                    ExoPlayerView(
                        videoUrl = pipVideoUrl!!,
                        audioUrl = pipAudioUrl,
                        sharedPlayer = playbackManager.player,
                        isFullscreen = true,
                        modifier = Modifier.fillMaxSize()
                    )
                } else {
                    MainScreen()
                }
                }
                }
            }
        }
    }

    override fun onPictureInPictureModeChanged(
        isInPictureInPictureMode: Boolean,
        newConfig: Configuration
    ) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        _isInPipMode.value = isInPictureInPictureMode
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
    }
}


package com.kvtube.android

import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import com.kvtube.android.data.local.SettingsDataStore
import com.kvtube.android.ui.MainScreen
import com.kvtube.android.ui.theme.KVTubeTheme
import com.kvtube.android.ui.theme.YTBackgroundDark
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var settingsDataStore: SettingsDataStore

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        window.decorView.setBackgroundColor(Color.parseColor("#0F0F0F"))
        setContent {
            val themeMode by settingsDataStore.themeMode.collectAsState(initial = "dark")

            KVTubeTheme(themeMode = themeMode) {
                Surface(modifier = Modifier.fillMaxSize()) {
                    AppEntry()
                }
            }
        }
    }
}

@Composable
private fun AppEntry() {
    var showSplash by remember { mutableStateOf(true) }

    Box(modifier = Modifier.fillMaxSize()) {
        // Main content — always composed but invisible during splash
        Box(
            modifier = Modifier
                .fillMaxSize()
                .scale(
                    animateFloatAsState(
                        targetValue = if (showSplash) 0.95f else 1f,
                        animationSpec = spring(
                            dampingRatio = Spring.DampingRatioMediumBouncy,
                            stiffness = Spring.StiffnessLow
                        ),
                        label = "contentScale"
                    ).value
                )
        ) {
            MainScreen()
        }

        // Splash overlay
        AnimatedVisibility(
            visible = showSplash,
            enter = fadeIn(animationSpec = tween(400)),
            exit = fadeOut(animationSpec = tween(400)) + scaleOut(
                targetScale = 1.2f,
                animationSpec = tween(400)
            ),
            modifier = Modifier.fillMaxSize()
        ) {
            SplashScreen()
        }
    }

    LaunchedEffect(Unit) {
        delay(2000)
        showSplash = false
    }
}

@Composable
private fun SplashScreen() {
    var scale by remember { mutableStateOf(0.6f) }

    val animatedScale by animateFloatAsState(
        targetValue = scale,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessLow
        ),
        label = "logoScale"
    )

    LaunchedEffect(Unit) {
        scale = 1f
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(YTBackgroundDark),
        contentAlignment = Alignment.Center
    ) {
        Image(
            painter = painterResource(id = R.drawable.ic_splash_logo),
            contentDescription = "KV-Tube",
            modifier = Modifier
                .size(140.dp)
                .scale(animatedScale)
        )
    }
}

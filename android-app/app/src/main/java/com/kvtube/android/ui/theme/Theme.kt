package com.kvtube.android.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val DarkColorScheme = darkColorScheme(
    primary = YTBlue,
    onPrimary = YTTextPrimaryDark,
    secondary = YTTextSecondaryDark,
    background = YTBackgroundDark,
    surface = YTSurfaceDark,
    surfaceVariant = YTHoverDark,
    onBackground = YTTextPrimaryDark,
    onSurface = YTTextPrimaryDark,
    onSurfaceVariant = YTTextSecondaryDark,
    outline = YTBorderDark,
    error = YTBrandRed,
)

private val AmoledColorScheme = DarkColorScheme.copy(
    background = Color.Black,
    surface = Color(0xFF0C0C0C),
    surfaceVariant = Color(0xFF181818),
    outline = Color(0xFF2E2E2E),
)

private val LightColorScheme = lightColorScheme(
    primary = YTBlue,
    onPrimary = YTTextPrimaryLight,
    secondary = YTTextSecondaryLight,
    background = YTBackgroundLight,
    surface = YTSurfaceLight,
    surfaceVariant = YTHoverLight,
    onBackground = YTTextPrimaryLight,
    onSurface = YTTextPrimaryLight,
    onSurfaceVariant = YTTextSecondaryLight,
    outline = YTBorderLight,
    error = YTBrandRed,
)

@Composable
fun KVTubeTheme(
    themeMode: String = "dark",
    content: @Composable () -> Unit
) {
    val isAmoled = themeMode == "amoled"
    val darkTheme = when (themeMode) {
        "light" -> false
        "system" -> isSystemInDarkTheme()
        else -> true
    }
    val colorScheme = when {
        isAmoled -> AmoledColorScheme
        darkTheme -> DarkColorScheme
        else -> LightColorScheme
    }

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = colorScheme.background.toArgb()
            window.navigationBarColor = colorScheme.background.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}

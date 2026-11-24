package com.kvtube.android.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

/**
 * Maps the Astryx neutral-theme roles onto a Material 3 [ColorScheme] so all
 * existing Compose components adopt the Astryx look without being rewritten.
 *
 *   --color-background-body  → background        --color-accent      → primary
 *   --color-background-card  → surface           --color-text-*      → onSurface(Variant)
 *   --color-neutral (fill)   → surfaceVariant    --color-border-*    → outlineVariant / outline
 */
private fun AstryxColors.toScheme(dark: Boolean): ColorScheme {
    // `--color-neutral` is translucent: composite it over the body to get a solid fill.
    val fill = neutralFill.compositeOver(backgroundBody)
    val borderSolid = border.compositeOver(backgroundBody)
    return if (dark) {
        darkColorScheme(
            primary = accent,
            onPrimary = onAccent,
            primaryContainer = accentMuted,
            onPrimaryContainer = textPrimary,
            secondary = textSecondary,
            onSecondary = onAccent,
            tertiary = info,
            background = backgroundBody,
            onBackground = textPrimary,
            surface = backgroundCard,
            onSurface = textPrimary,
            surfaceVariant = fill,
            onSurfaceVariant = textSecondary,
            surfaceContainerLowest = backgroundBody,
            surfaceContainerLow = backgroundCard,
            surfaceContainer = backgroundSurface,
            surfaceContainerHigh = fill,
            surfaceContainerHighest = fill,
            outline = borderEmphasized,
            outlineVariant = borderSolid,
            error = error,
            onError = onError,
            errorContainer = errorMuted,
            scrim = overlay,
        )
    } else {
        lightColorScheme(
            primary = accent,
            onPrimary = onAccent,
            primaryContainer = accentMuted,
            onPrimaryContainer = textPrimary,
            secondary = textSecondary,
            onSecondary = onAccent,
            tertiary = info,
            background = backgroundBody,
            onBackground = textPrimary,
            surface = backgroundCard,
            onSurface = textPrimary,
            surfaceVariant = fill,
            onSurfaceVariant = textSecondary,
            surfaceContainerLowest = backgroundSurface,
            surfaceContainerLow = backgroundSurface,
            surfaceContainer = backgroundSurface,
            surfaceContainerHigh = fill,
            surfaceContainerHighest = fill,
            outline = borderEmphasized,
            outlineVariant = borderSolid,
            error = error,
            onError = onError,
            errorContainer = errorMuted,
            scrim = overlay,
        )
    }
}

/** Astryx `--radius-*` mapped to Material shape roles. */
val AstryxShapes = Shapes(
    extraSmall = RoundedCornerShape(AstryxRadius.inner),
    small = RoundedCornerShape(AstryxRadius.element),
    medium = RoundedCornerShape(AstryxRadius.container),
    large = RoundedCornerShape(16.dp),
    extraLarge = RoundedCornerShape(AstryxRadius.page),
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
    val tokens = when {
        isAmoled -> AstryxAmoled
        darkTheme -> AstryxDark
        else -> AstryxLight
    }
    val colorScheme = tokens.toScheme(dark = darkTheme || isAmoled)

    val view = LocalView.current
    val isDarkSurface = darkTheme || isAmoled
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            @Suppress("DEPRECATION")
            window.statusBarColor = Color.Transparent.toArgb()
            @Suppress("DEPRECATION")
            window.navigationBarColor = Color.Transparent.toArgb()
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = !isDarkSurface
                isAppearanceLightNavigationBars = !isDarkSurface
            }
        }
    }

    CompositionLocalProvider(
        LocalAstryx provides tokens,
        LocalIsDarkGlassTheme provides isDarkSurface,
        LocalIsAmoledGlassTheme provides isAmoled,
    ) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = Typography,
            shapes = AstryxShapes,
            content = content
        )
    }
}

/** Convenience accessor for the raw Astryx tokens inside composables. */
val astryx: AstryxColors
    @Composable get() = LocalAstryx.current

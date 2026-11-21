package com.kvtube.android.ui.adaptive

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.platform.LocalConfiguration

/**
 * Material window width classes (Compact < 600dp, Medium 600–839dp, Expanded >= 840dp).
 * Layouts key off the *window* width, not the device type, so foldables
 * (fold/unfold), split-screen and tablets all re-lay out live.
 */
enum class WidthClass { Compact, Medium, Expanded;
    val isCompact get() = this == Compact
    val isWide get() = this != Compact
    companion object {
        fun forWidthDp(dp: Int): WidthClass = when {
            dp < 600 -> Compact
            dp < 840 -> Medium
            else -> Expanded
        }
    }
}

/** Current window width class. Provided once in MainActivity via [ProvideWidthClass]. */
val LocalWidthClass = compositionLocalOf { WidthClass.Compact }

/** Max readable content width on very large windows (centre content beyond this). */
const val MaxContentWidthDp = 1280

@Composable
fun ProvideWidthClass(content: @Composable () -> Unit) {
    // LocalConfiguration updates on resize/fold even though MainActivity handles
    // configChanges itself (Compose observes onConfigurationChanged).
    val widthDp = LocalConfiguration.current.screenWidthDp
    CompositionLocalProvider(LocalWidthClass provides WidthClass.forWidthDp(widthDp)) {
        content()
    }
}

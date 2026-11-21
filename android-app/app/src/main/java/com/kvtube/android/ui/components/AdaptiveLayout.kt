package com.kvtube.android.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.kvtube.android.ui.adaptive.LocalWidthClass
import com.kvtube.android.ui.adaptive.MaxContentWidthDp
import com.kvtube.android.ui.adaptive.WidthClass

/** Narrower cap for text-heavy screens (settings, comments, lists of rows). */
const val MaxReadableWidthDp = 720

/** Width a single video card is never allowed to exceed on wide windows. */
const val MaxVideoCardWidthDp = 420

/**
 * Predictable column count for video-card grids:
 * Compact 1 · Medium 2 · Expanded 3 (4 on very wide windows > 1200dp).
 */
fun videoGridColumnCount(widthClass: WidthClass, windowWidthDp: Int): Int = when (widthClass) {
    WidthClass.Compact -> 1
    WidthClass.Medium -> 2
    WidthClass.Expanded -> if (windowWidthDp > 1200) 4 else 3
}

/** [GridCells] for video grids, tuned to the current window width class. */
@Composable
fun rememberVideoGridCells(): GridCells {
    val widthClass = LocalWidthClass.current
    val widthDp = LocalConfiguration.current.screenWidthDp
    return remember(widthClass, widthDp) {
        GridCells.Fixed(videoGridColumnCount(widthClass, widthDp))
    }
}

/**
 * Column count for grids of compact horizontal rows (thumbnail + text), e.g. history:
 * Compact 1 · Medium/Expanded 2 · very wide (> 1200dp) 3.
 */
fun rowGridColumnCount(widthClass: WidthClass, windowWidthDp: Int): Int = when (widthClass) {
    WidthClass.Compact -> 1
    else -> if (windowWidthDp > 1200) 3 else 2
}

@Composable
fun rememberRowGridCells(): GridCells {
    val widthClass = LocalWidthClass.current
    val widthDp = LocalConfiguration.current.screenWidthDp
    return remember(widthClass, widthDp) {
        GridCells.Fixed(rowGridColumnCount(widthClass, widthDp))
    }
}

/**
 * Fills the available space but caps the content at [maxWidth] and centres it
 * horizontally (TopCenter) so grids/lists don't stretch endlessly on huge windows.
 */
@Composable
fun CenteredContent(
    modifier: Modifier = Modifier,
    maxWidth: Dp = MaxContentWidthDp.dp,
    content: @Composable BoxScope.() -> Unit
) {
    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.TopCenter
    ) {
        Box(
            modifier = Modifier
                .widthIn(max = maxWidth)
                .fillMaxSize(),
            content = content
        )
    }
}

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
import kotlin.math.roundToInt
import com.kvtube.android.ui.adaptive.LocalWidthClass
import com.kvtube.android.ui.adaptive.LocalWindowState
import com.kvtube.android.ui.adaptive.WidthClass
import com.kvtube.android.ui.adaptive.WindowState

/** Narrower cap for text-heavy screens (settings, comments, lists of rows). */
const val MaxReadableWidthDp = 720

/** Navigation rail width shown next to the content on unfolded foldables and tablets. */
const val NavRailWidthDp = 76

/** Horizontal content padding + grid gutter used by dense wide grids. */
const val WideGridPaddingDp = 12
const val WideGridSpacingDp = 12

/** Grid content may grow wider than the default centred cap so cards fill their columns. */
const val MaxGridContentWidthDp = 2400

/** Width available to content (minus rail when shown) and horizontal padding. */
private fun availableGridWidthDp(windowWidthDp: Int, hasRail: Boolean): Int =
    (windowWidthDp - (if (hasRail) NavRailWidthDp else 0) - 2 * WideGridPaddingDp).coerceAtLeast(320)

/**
 * Column count for video-card grids following YouTube's foldable & tablet layout:
 * - Compact phone (< 600dp): 1 column
 * - Medium (600–839dp, e.g. unfolded foldable portrait): 2 columns (large cards)
 * - Expanded (>= 840dp): 3–5 columns sized by ~310dp target width
 */
fun videoGridColumnCount(windowState: WindowState): Int = when (windowState.widthClass) {
    WidthClass.Compact -> 1
    WidthClass.Medium -> 2
    WidthClass.Expanded -> {
        val avail = availableGridWidthDp(windowState.widthDp, windowState.useNavigationRail)
        (avail / 310f).toInt().coerceIn(3, 5)
    }
}

/** Backwards-compatible overload keyed on widthClass + windowWidthDp. */
fun videoGridColumnCount(widthClass: WidthClass, windowWidthDp: Int): Int = when (widthClass) {
    WidthClass.Compact -> 1
    WidthClass.Medium -> 2
    WidthClass.Expanded -> {
        val avail = availableGridWidthDp(windowWidthDp, hasRail = widthClass.isWide)
        (avail / 310f).toInt().coerceIn(3, 5)
    }
}

/** [GridCells] for video grids, tuned to the current window state. */
@Composable
fun rememberVideoGridCells(): GridCells {
    val windowState = LocalWindowState.current
    return remember(windowState.widthClass, windowState.widthDp, windowState.useNavigationRail) {
        GridCells.Fixed(videoGridColumnCount(windowState))
    }
}

/**
 * Column count for grids of compact horizontal rows (thumbnail + text), e.g. history:
 * Compact 1; Medium 2; Expanded 2..4.
 */
fun rowGridColumnCount(windowState: WindowState): Int = when (windowState.widthClass) {
    WidthClass.Compact -> 1
    WidthClass.Medium -> 2
    WidthClass.Expanded -> {
        val avail = availableGridWidthDp(windowState.widthDp, windowState.useNavigationRail)
        (avail / 360f).toInt().coerceIn(2, 4)
    }
}

fun rowGridColumnCount(widthClass: WidthClass, windowWidthDp: Int): Int =
    if (widthClass.isCompact) 1
    else (availableGridWidthDp(windowWidthDp, hasRail = widthClass.isWide).toFloat() / 360f)
        .roundToInt().coerceIn(2, 4)

@Composable
fun rememberRowGridCells(): GridCells {
    val windowState = LocalWindowState.current
    return remember(windowState.widthClass, windowState.widthDp, windowState.useNavigationRail) {
        GridCells.Fixed(rowGridColumnCount(windowState))
    }
}

/** Horizontal gap between video-grid cells: 12dp on wide windows, [compact] on phones. */
@Composable
fun gridHorizontalSpacing(compact: Dp = 8.dp): Dp =
    if (LocalWidthClass.current.isWide) WideGridSpacingDp.dp else compact

/** Vertical gap between video-grid rows (cards carry their own bottom padding). */
@Composable
fun gridVerticalSpacing(compact: Dp = 16.dp): Dp =
    if (LocalWidthClass.current.isWide) 8.dp else compact

/** Horizontal content padding of video grids: 12dp on every size class. */
const val GridContentPaddingDp = 12

/**
 * Fills the available space but caps the content at [maxWidth] and centres it
 * horizontally (TopCenter) so grids/lists don't stretch endlessly on huge windows.
 */
@Composable
fun CenteredContent(
    modifier: Modifier = Modifier,
    maxWidth: Dp = MaxGridContentWidthDp.dp,
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

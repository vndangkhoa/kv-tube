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
import com.kvtube.android.ui.adaptive.WidthClass

/** Narrower cap for text-heavy screens (settings, comments, lists of rows). */
const val MaxReadableWidthDp = 720

/** Navigation rail width shown next to the content on wide windows. */
const val NavRailWidthDp = 88

/** Target (ideal) video card width on wide windows; column count is derived from it. */
const val TargetVideoCardWidthDp = 260

/** Target width of a horizontal row card (thumbnail + text) on wide windows. */
const val TargetRowCardWidthDp = 360

/** Horizontal content padding + grid gutter used by dense wide grids. */
const val WideGridPaddingDp = 12
const val WideGridSpacingDp = 10

/** Grid content may grow wider than the default centred cap so cards fill their columns. */
const val MaxGridContentWidthDp = 2400

/** Width available to content next to the rail, minus the horizontal grid padding. */
private fun availableGridWidthDp(windowWidthDp: Int): Int =
    windowWidthDp - NavRailWidthDp - 2 * WideGridPaddingDp

/**
 * Column count for video-card grids, derived from the available width:
 * Compact (phones) 1; wide windows round(available / ~260dp) clamped to 2..6
 * (700dp -> 2, 800dp -> 3, 1066dp -> 4, 1400dp -> 5, 1600dp+ -> 6).
 */
fun videoGridColumnCount(widthClass: WidthClass, windowWidthDp: Int): Int =
    if (widthClass.isCompact) 1
    else (availableGridWidthDp(windowWidthDp).toFloat() / TargetVideoCardWidthDp)
        .roundToInt().coerceIn(2, 6)

/** [GridCells] for video grids, tuned to the current window width. */
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
 * Compact 1; wide round(available / ~360dp) clamped to 2..4.
 */
fun rowGridColumnCount(widthClass: WidthClass, windowWidthDp: Int): Int =
    if (widthClass.isCompact) 1
    else (availableGridWidthDp(windowWidthDp).toFloat() / TargetRowCardWidthDp)
        .roundToInt().coerceIn(2, 4)

@Composable
fun rememberRowGridCells(): GridCells {
    val widthClass = LocalWidthClass.current
    val widthDp = LocalConfiguration.current.screenWidthDp
    return remember(widthClass, widthDp) {
        GridCells.Fixed(rowGridColumnCount(widthClass, widthDp))
    }
}

/** Horizontal gap between video-grid cells: 10dp on wide windows, [compact] on phones. */
@Composable
fun gridHorizontalSpacing(compact: Dp = 8.dp): Dp =
    if (LocalWidthClass.current.isWide) WideGridSpacingDp.dp else compact

/** Vertical gap between video-grid rows (cards carry their own bottom padding). */
@Composable
fun gridVerticalSpacing(compact: Dp = 16.dp): Dp =
    if (LocalWidthClass.current.isWide) 4.dp else compact

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

package com.kvtube.tv.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandHorizontally
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkHorizontally
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.NewReleases
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.NewReleases
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.*
import com.kvtube.tv.ui.theme.YTBackground
import com.kvtube.tv.ui.theme.YTFocus
import com.kvtube.tv.ui.theme.YTFocusGlow
import com.kvtube.tv.ui.theme.YTFocusInk
import com.kvtube.tv.ui.theme.YTPlayBadgeRed
import com.kvtube.tv.ui.theme.YTTextPrimary
import com.kvtube.tv.ui.theme.YTTextSecondary
import com.kvtube.tv.ui.theme.ytExponentialScrimStops

data class NavItem(
    val route: String,
    val label: String,
    val icon: ImageVector,
    val selectedIcon: ImageVector = icon,
)

val ytNavItems = listOf(
    NavItem("home", "Home", Icons.Outlined.Home, Icons.Filled.Home),
    NavItem("latest", "Latest", Icons.Outlined.NewReleases, Icons.Filled.NewReleases),
    NavItem("search", "Search", Icons.Outlined.Search, Icons.Filled.Search),
    NavItem("library", "You", Icons.Outlined.Person, Icons.Filled.Person),
    NavItem("settings", "Settings", Icons.Outlined.Settings, Icons.Filled.Settings),
)

// Content always reserves the collapsed 72dp rail column so expanding overlays cleanly without reflow.
const val TV_NAV_RAIL_WIDTH = 72
const val TV_NAV_EXPANDED_WIDTH = 224

/**
 * Shared KV-Tube brand lockup modeled after YouTube TV's top badge + wordmark proportions,
 * strictly preserving KV-Tube branding.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun KvBrandLockup(
    showWordmark: Boolean = true,
    badgeWidth: Dp = 36.dp,
    badgeHeight: Dp = 25.dp,
    wordmarkSizeSp: Float = 19f,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(width = badgeWidth, height = badgeHeight)
                .clip(RoundedCornerShape((badgeHeight.value * 0.28f).dp))
                .background(YTPlayBadgeRed),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.PlayArrow,
                contentDescription = "KV-Tube",
                tint = Color.White,
                modifier = Modifier.size((badgeHeight.value * 0.72f).dp),
            )
        }
        AnimatedVisibility(
            visible = showWordmark,
            enter = fadeIn(tween(150)) + expandHorizontally(tween(180)),
            exit = fadeOut(tween(110)) + shrinkHorizontally(tween(140)),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Spacer(Modifier.width(10.dp))
                Text(
                    text = "KV-Tube",
                    color = YTTextPrimary,
                    fontSize = wordmarkSizeSp.sp,
                    fontWeight = FontWeight.ExtraBold,
                    fontFamily = FontFamily.SansSerif,
                    letterSpacing = (-0.5).sp,
                    maxLines = 1,
                )
            }
        }
    }
}

/**
 * Google YouTube for Android TV 8.03.300 style collapsible Left Guide.
 * - Idle: compact 72dp translucent/obsidian rail with crisp outlined/filled icons.
 * - Focused: glides open smoothly to 224dp over an exponential #0F0F0F scrim gradient
 *   without shifting underlying rows or thumbnails.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun YtSideNav(
    currentRoute: String?,
    onNavigate: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var hasRailFocus by remember { mutableStateOf(false) }

    val guideWidth by animateDpAsState(
        targetValue = if (hasRailFocus) TV_NAV_EXPANDED_WIDTH.dp else TV_NAV_RAIL_WIDTH.dp,
        animationSpec = tween(durationMillis = 180, easing = FastOutSlowInEasing),
        label = "YtGuideWidth",
    )
    val scrimWidth by animateDpAsState(
        targetValue = if (hasRailFocus) 320.dp else TV_NAV_RAIL_WIDTH.dp,
        animationSpec = tween(durationMillis = 180, easing = FastOutSlowInEasing),
        label = "YtGuideScrimWidth",
    )

    Box(
        modifier = modifier
            .width(scrimWidth)
            .fillMaxHeight()
            .onFocusChanged { hasRailFocus = it.hasFocus },
    ) {
        // Exponential horizontal overlay scrim when guide expands (exact Kabuki gradient feel)
        if (hasRailFocus) {
            Box(
                Modifier
                    .fillMaxSize()
                    .background(
                        Brush.horizontalGradient(
                            0.0f to YTBackground,
                            0.74f to YTBackground.copy(alpha = 0.98f),
                            *ytExponentialScrimStops(
                                baseColor = YTBackground,
                                startFraction = 0.74f,
                                endFraction = 1.0f,
                                maxAlpha = 0.98f,
                                reverse = true,
                            ),
                        )
                    )
            )
        } else {
            Box(
                Modifier
                    .width(TV_NAV_RAIL_WIDTH.dp)
                    .fillMaxHeight()
                    .background(YTBackground)
            )
        }

        Column(
            modifier = Modifier
                .width(guideWidth)
                .fillMaxHeight()
                .padding(top = 24.dp, bottom = 20.dp, start = 12.dp, end = 12.dp),
            horizontalAlignment = Alignment.Start,
        ) {
            // Top KV-Tube lockup (badge collapses cleanly in 48dp lane; expands with KV-Tube wordmark)
            Box(
                modifier = Modifier
                    .height(36.dp)
                    .padding(start = 6.dp),
                contentAlignment = Alignment.CenterStart,
            ) {
                KvBrandLockup(showWordmark = hasRailFocus)
            }

            Spacer(Modifier.height(36.dp))

            Column(
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                ytNavItems.forEach { item ->
                    val selected = currentRoute == item.route || (item.route == "home" && currentRoute == null)
                    YtNavRailButton(
                        item = item,
                        selected = selected,
                        expanded = hasRailFocus,
                        onClick = { onNavigate(item.route) },
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun YtNavRailButton(
    item: NavItem,
    selected: Boolean,
    expanded: Boolean,
    onClick: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }

    Surface(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .height(46.dp)
            .onFocusChanged { focused = it.isFocused }
            .semantics { contentDescription = item.label },
        shape = ClickableSurfaceDefaults.shape(CircleShape),
        scale = ClickableSurfaceDefaults.scale(focusedScale = 1.03f),
        glow = ClickableSurfaceDefaults.glow(
            focusedGlow = Glow(elevationColor = YTFocusGlow, elevation = 10.dp),
        ),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = if (selected) Color.White.copy(alpha = 0.14f) else Color.Transparent,
            focusedContainerColor = YTFocus,
            contentColor = if (selected) YTTextPrimary else YTTextSecondary,
            focusedContentColor = YTFocusInk,
        ),
        border = ClickableSurfaceDefaults.border(
            border = Border.None,
            focusedBorder = Border(BorderStroke(1.dp, YTFocus)),
        ),
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = if (expanded) 14.dp else 0.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = if (expanded) Arrangement.Start else Arrangement.Center,
        ) {
            Icon(
                imageVector = if (selected || focused) item.selectedIcon else item.icon,
                contentDescription = item.label,
                modifier = Modifier.size(22.dp),
            )
            if (expanded) {
                Spacer(Modifier.width(14.dp))
                Text(
                    text = item.label,
                    style = MaterialTheme.typography.labelLarge.copy(
                        fontSize = 14.sp,
                        fontWeight = if (selected || focused) FontWeight.Bold else FontWeight.Medium,
                    ),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

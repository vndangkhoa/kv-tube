package com.kvtube.android.ui.navigation

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.displayCutout
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import com.kvtube.android.ui.theme.LocalIsDarkGlassTheme
import com.kvtube.android.ui.theme.liquidGlassFloating
import kotlin.math.roundToInt
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.kvtube.android.ui.adaptive.WidthClass
import com.kvtube.android.ui.theme.KVTubeTheme
import com.kvtube.android.ui.theme.YTBrandRed

// YouTube Shorts Icon Vector
val ShortsFilledIcon: ImageVector by lazy {
    ImageVector.Builder(
        name = "ShortsFilled",
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = 24f,
        viewportHeight = 24f
    ).apply {
        path(fill = SolidColor(Color.White)) {
            moveTo(10f, 14.65f)
            lineTo(15f, 12f)
            lineTo(10f, 9.35f)
            close()
            moveTo(17.77f, 10.32f)
            curveToRelative(-0.77f, -0.32f, -1.2f, -0.59f, -1.2f, -0.59f)
            reflectiveCurveToRelative(0.7f, -0.37f, 0.99f, -0.57f)
            curveToRelative(1.19f, -0.83f, 1.6f, -2.43f, 0.95f, -3.71f)
            curveToRelative(-0.64f, -1.29f, -2.15f, -1.82f, -3.47f, -1.23f)
            lineToRelative(-7.1f, 3.16f)
            curveTo(6.87f, 7.82f, 6.27f, 8.87f, 6.34f, 10f)
            curveToRelative(0.07f, 1.13f, 0.77f, 2.08f, 1.84f, 2.47f)
            curveToRelative(0.77f, 0.32f, 1.2f, 0.59f, 1.2f, 0.59f)
            reflectiveCurveToRelative(-0.7f, 0.37f, -0.99f, 0.57f)
            curveToRelative(-1.19f, 0.83f, -1.6f, 2.43f, -0.95f, 3.71f)
            curveToRelative(0.64f, 1.29f, 2.15f, 1.82f, 3.47f, 1.23f)
            lineToRelative(7.1f, -3.16f)
            curveToRelative(1.07f, -0.47f, 1.67f, -1.52f, 1.6f, -2.65f)
            curveToRelative(-0.07f, -1.13f, -0.77f, -2.08f, -1.84f, -2.44f)
            close()
        }
    }.build()
}

val ShortsOutlinedIcon: ImageVector by lazy {
    ImageVector.Builder(
        name = "ShortsOutlined",
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = 24f,
        viewportHeight = 24f
    ).apply {
        path(fill = SolidColor(Color.White)) {
            moveTo(10f, 14.65f)
            lineTo(15f, 12f)
            lineTo(10f, 9.35f)
            close()
            moveTo(17.77f, 10.32f)
            curveToRelative(-0.77f, -0.32f, -1.2f, -0.59f, -1.2f, -0.59f)
            reflectiveCurveToRelative(0.7f, -0.37f, 0.99f, -0.57f)
            curveToRelative(1.19f, -0.83f, 1.6f, -2.43f, 0.95f, -3.71f)
            curveToRelative(-0.64f, -1.29f, -2.15f, -1.82f, -3.47f, -1.23f)
            lineToRelative(-7.1f, 3.16f)
            curveTo(6.87f, 7.82f, 6.27f, 8.87f, 6.34f, 10f)
            curveToRelative(0.07f, 1.13f, 0.77f, 2.08f, 1.84f, 2.47f)
            curveToRelative(0.77f, 0.32f, 1.2f, 0.59f, 1.2f, 0.59f)
            reflectiveCurveToRelative(-0.7f, 0.37f, -0.99f, 0.57f)
            curveToRelative(-1.19f, 0.83f, -1.6f, 2.43f, -0.95f, 3.71f)
            curveToRelative(0.64f, 1.29f, 2.15f, 1.82f, 3.47f, 1.23f)
            lineToRelative(7.1f, -3.16f)
            curveToRelative(1.07f, -0.47f, 1.67f, -1.52f, 1.6f, -2.65f)
            curveToRelative(-0.07f, -1.13f, -0.77f, -2.08f, -1.84f, -2.44f)
            close()
        }
    }.build()
}

data class BottomNavItem(
    val route: String,
    val label: String,
    val selectedIcon: ImageVector,
    val unselectedIcon: ImageVector
)

val bottomNavItems = listOf(
    BottomNavItem(
        route = Screen.Shorts.route,
        label = "Shorts",
        selectedIcon = ShortsFilledIcon,
        unselectedIcon = ShortsOutlinedIcon
    ),
    BottomNavItem(
        route = Screen.Home.route,
        label = "Home",
        selectedIcon = Icons.Filled.Home,
        unselectedIcon = Icons.Outlined.Home
    ),
    BottomNavItem(
        route = Screen.Library.route,
        label = "Account",
        selectedIcon = Icons.Filled.Person,
        unselectedIcon = Icons.Outlined.Person
    )
)

/**
 * Tab tap behaviour shared by [BottomNavBar] and [AppNavigationRail]:
 * reselect resets the tab, otherwise pop back to it or navigate to it.
 */
private fun handleNavTabClick(
    navController: NavController,
    route: String,
    currentRoute: String?,
    onTabClick: (String) -> Unit
) {
    onTabClick(route)
    if (currentRoute?.startsWith(route) == true) {
        // Already on this tab: reset its content to the first item
        TabReselect.notify(route)
    } else if (navController.popBackStack(route, inclusive = false)) {
        // Tab root exists deeper in the stack (e.g. Account under
        // Subscriptions/History): jump straight back to it instantly
    } else {
        navController.navigate(route) {
            popUpTo(Screen.Home.route)
            launchSingleTop = true
        }
    }
}

/** Icon pill + 11sp label (+ download badge): the visual shared by bar and rail items. */
@Composable
private fun NavItemVisual(
    item: BottomNavItem,
    selected: Boolean,
    activeDownloadsCount: Int,
    modifier: Modifier = Modifier,
    showIconPill: Boolean = true
) {
    val itemColor = if (selected) MaterialTheme.colorScheme.onSurface
    else MaterialTheme.colorScheme.onSurfaceVariant
    val iconVector = if (selected) item.selectedIcon else item.unselectedIcon

    val isDarkGlass = LocalIsDarkGlassTheme.current
    val activePillColor = if (isDarkGlass) {
        Color.White.copy(alpha = 0.14f)
    } else {
        Color.Black.copy(alpha = 0.08f)
    }

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
        modifier = modifier
    ) {
        Box(contentAlignment = Alignment.TopEnd) {
            if (showIconPill) {
                Box(
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(if (selected) activePillColor else Color.Transparent)
                        .padding(horizontal = 16.dp, vertical = 3.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = iconVector,
                        contentDescription = item.label,
                        tint = itemColor,
                        modifier = Modifier.size(22.dp)
                    )
                }
            } else {
                Icon(
                    imageVector = iconVector,
                    contentDescription = item.label,
                    tint = itemColor,
                    modifier = Modifier.size(21.dp)
                )
            }

            // Download count badge
            if (item.route == Screen.Downloads.route && activeDownloadsCount > 0) {
                Surface(
                    shape = CircleShape,
                    color = YTBrandRed,
                    modifier = Modifier
                        .size(12.dp)
                        .offset(x = 4.dp, y = (-2).dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text(
                            text = activeDownloadsCount.toString(),
                            color = Color.White,
                            fontSize = 8.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(2.dp))

        Text(
            text = item.label,
            color = itemColor,
            fontSize = 11.sp,
            lineHeight = 14.sp,
            fontWeight = if (selected) FontWeight.Medium else FontWeight.Normal,
            maxLines = 1,
            softWrap = false
        )
    }
}

@Composable
fun BottomNavBar(
    navController: NavController,
    activeDownloadsCount: Int = 0,
    modifier: Modifier = Modifier,
    onTabClick: (String) -> Unit = {}
) {
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route
    val isDarkGlass = LocalIsDarkGlassTheme.current

    val activeIndex = when {
        currentRoute?.startsWith(Screen.Shorts.route) == true -> 0
        currentRoute?.startsWith(Screen.Library.route) == true ||
            currentRoute == Screen.History.route ||
            currentRoute == Screen.Subscriptions.route ||
            currentRoute == Screen.Downloads.route ||
            currentRoute == Screen.Settings.route -> 2
        else -> 1
    }

    // Compact iPhone Liquid Glass floating capsule dock hugging the 3 tabs with spring-sliding lens pill.
    Box(
        modifier = modifier.fillMaxWidth(),
        contentAlignment = Alignment.Center
    ) {
        Box(
            modifier = Modifier
                .width(244.dp)
                .height(58.dp)
                .liquidGlassFloating(shape = CircleShape)
                .padding(4.dp)
        ) {
            BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
                val tabCount = bottomNavItems.size
                val tabWidth = maxWidth / tabCount
                val density = LocalDensity.current
                val tabWidthPx = with(density) { tabWidth.toPx() }.coerceAtLeast(1f)

                var isDragging by remember { mutableStateOf(false) }
                var dragPos by remember { mutableFloatStateOf(activeIndex.toFloat()) }

                val animatedPos by animateFloatAsState(
                    targetValue = if (isDragging) dragPos else activeIndex.toFloat(),
                    animationSpec = if (isDragging) {
                        spring(dampingRatio = 0.85f, stiffness = 1400f)
                    } else {
                        spring(dampingRatio = 0.72f, stiffness = 380f)
                    },
                    label = "navGlassSlide"
                )
                val pillScale by animateFloatAsState(
                    targetValue = if (isDragging) 1.06f else 1.0f,
                    animationSpec = spring(dampingRatio = 0.65f, stiffness = 500f),
                    label = "navGlassScale"
                )

                val lensBrush = if (isDarkGlass) {
                    Brush.verticalGradient(
                        0f to Color.White.copy(alpha = 0.24f),
                        0.45f to Color.White.copy(alpha = 0.12f),
                        1f to Color.White.copy(alpha = 0.08f)
                    )
                } else {
                    Brush.verticalGradient(
                        0f to Color.White.copy(alpha = 0.88f),
                        0.5f to Color.White.copy(alpha = 0.62f),
                        1f to Color.White.copy(alpha = 0.52f)
                    )
                }
                val lensBorderBrush = Brush.verticalGradient(
                    listOf(
                        Color.White.copy(alpha = if (isDarkGlass) 0.42f else 0.95f),
                        Color.White.copy(alpha = if (isDarkGlass) 0.08f else 0.25f)
                    )
                )

                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .pointerInput(currentRoute, tabWidthPx) {
                            detectHorizontalDragGestures(
                                onDragStart = { offset ->
                                    isDragging = true
                                    dragPos = ((offset.x / tabWidthPx) - 0.5f)
                                        .coerceIn(0f, (tabCount - 1).toFloat())
                                },
                                onHorizontalDrag = { change, _ ->
                                    change.consume()
                                    dragPos = ((change.position.x / tabWidthPx) - 0.5f)
                                        .coerceIn(0f, (tabCount - 1).toFloat())
                                },
                                onDragEnd = {
                                    isDragging = false
                                    val target = dragPos.roundToInt().coerceIn(0, tabCount - 1)
                                    handleNavTabClick(
                                        navController,
                                        bottomNavItems[target].route,
                                        currentRoute,
                                        onTabClick
                                    )
                                },
                                onDragCancel = { isDragging = false }
                            )
                        }
                ) {
                    // Layer 1: Sliding iPhone glass pill
                    Box(
                        modifier = Modifier
                            .width(tabWidth)
                            .fillMaxHeight()
                            .offset { IntOffset((animatedPos * tabWidthPx).roundToInt(), 0) }
                            .graphicsLayer {
                                scaleX = pillScale
                                scaleY = pillScale
                            }
                            .clip(CircleShape)
                            .background(lensBrush)
                            .border(0.8.dp, lensBorderBrush, CircleShape)
                    )

                    // Layer 2: 3 navigation tabs
                    Row(
                        modifier = Modifier.fillMaxSize(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        val highlightedIdx = if (isDragging) dragPos.roundToInt() else activeIndex
                        bottomNavItems.forEachIndexed { idx, item ->
                            NavItemVisual(
                                item = item,
                                selected = idx == highlightedIdx,
                                activeDownloadsCount = activeDownloadsCount,
                                showIconPill = false,
                                modifier = Modifier
                                    .weight(1f)
                                    .fillMaxHeight()
                                    .clickable(
                                        interactionSource = remember { MutableInteractionSource() },
                                        indication = null
                                    ) {
                                        handleNavTabClick(navController, item.route, currentRoute, onTabClick)
                                    }
                            )
                        }
                    }
                }
            }
        }
    }
}

/**
 * Start-edge Liquid Glass navigation rail for Medium/Expanded windows
 * (unfolded foldables and tablets). Respects system bars and landscape display
 * cutouts while matching KV-Tube's vertical rail order (`Home`, `Shorts`, `Account`).
 */
@Composable
fun AppNavigationRail(
    navController: NavController,
    activeDownloadsCount: Int = 0,
    modifier: Modifier = Modifier,
    onTabClick: (String) -> Unit = {}
) {
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route
    val isDarkGlass = LocalIsDarkGlassTheme.current
    val railItems = remember {
        listOf(bottomNavItems[1], bottomNavItems[0], bottomNavItems[2])
    }
    val railBg = if (isDarkGlass) Color(0xD6101012) else Color(0xD9F4F4F6)
    val railDividerColor = if (isDarkGlass) {
        Color.White.copy(alpha = 0.10f)
    } else {
        Color.Black.copy(alpha = 0.08f)
    }

    Row(modifier = modifier.fillMaxHeight()) {
        Column(
            modifier = Modifier
                .width(76.dp)
                .fillMaxHeight()
                .background(railBg)
                .windowInsetsPadding(
                    WindowInsets.systemBars
                        .only(WindowInsetsSides.Start + WindowInsetsSides.Top + WindowInsetsSides.Bottom)
                        .union(WindowInsets.displayCutout.only(WindowInsetsSides.Start))
                )
                .padding(top = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            railItems.forEach { item ->
                val selected = currentRoute?.startsWith(item.route) == true
                NavItemVisual(
                    item = item,
                    selected = selected,
                    activeDownloadsCount = activeDownloadsCount,
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 64.dp)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null
                        ) {
                            handleNavTabClick(navController, item.route, currentRoute, onTabClick)
                        }
                        .padding(vertical = 8.dp)
                )
            }
        }
        VerticalDivider(color = railDividerColor)
    }
}

// ---- Previews: navigation chrome per window width class ----

@Composable
private fun NavChromePreview(widthClass: WidthClass) {
    KVTubeTheme {
        val navController = rememberNavController()
        if (widthClass.isCompact) {
            Column(modifier = Modifier.fillMaxSize()) {
                Box(modifier = Modifier.weight(1f))
                BottomNavBar(navController = navController)
            }
        } else {
            Row(modifier = Modifier.fillMaxSize()) {
                AppNavigationRail(navController = navController)
                Box(modifier = Modifier.weight(1f))
            }
        }
    }
}

@Preview(name = "Compact", widthDp = 360, heightDp = 640, showBackground = true)
@Composable
private fun NavChromeCompactPreview() = NavChromePreview(WidthClass.Compact)

@Preview(name = "Medium", widthDp = 700, heightDp = 900, showBackground = true)
@Composable
private fun NavChromeMediumPreview() = NavChromePreview(WidthClass.Medium)

@Preview(name = "Expanded", widthDp = 1100, heightDp = 800, showBackground = true)
@Composable
private fun NavChromeExpandedPreview() = NavChromePreview(WidthClass.Expanded)

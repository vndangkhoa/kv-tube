package com.kvtube.android.ui.navigation

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import com.kvtube.android.ui.theme.AstryxRadius
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Subscriptions
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Subscriptions
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
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
    modifier: Modifier = Modifier
) {
    val itemColor = if (selected) MaterialTheme.colorScheme.onSurface
    else MaterialTheme.colorScheme.onSurfaceVariant
    val iconVector = if (selected) item.selectedIcon else item.unselectedIcon

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
        modifier = modifier
    ) {
        Box(contentAlignment = Alignment.TopEnd) {
            // Astryx selected state: overlay-pressed pill on the icon
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(AstryxRadius.element))
                    .background(
                        if (selected) MaterialTheme.colorScheme.surfaceVariant
                        else Color.Transparent
                    )
                    .padding(horizontal = 14.dp, vertical = 3.dp),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = iconVector,
                    contentDescription = item.label,
                    tint = itemColor,
                    modifier = Modifier.size(22.dp)
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

    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.background)
            .navigationBarsPadding()
    ) {
        // Thin 0.8dp YouTube top border line
        HorizontalDivider(
            thickness = 1.dp,
            color = MaterialTheme.colorScheme.outlineVariant
        )

        // 60dp bar: icon pill (28dp) + label must fit without clipping
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 60.dp),
            horizontalArrangement = Arrangement.SpaceAround,
            verticalAlignment = Alignment.CenterVertically
        ) {
            bottomNavItems.forEach { item ->
                val selected = currentRoute?.startsWith(item.route) == true
                NavItemVisual(
                    item = item,
                    selected = selected,
                    activeDownloadsCount = activeDownloadsCount,
                    modifier = Modifier
                        .weight(1f)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null
                        ) {
                            handleNavTabClick(navController, item.route, currentRoute, onTabClick)
                        }
                        .padding(top = 6.dp, bottom = 6.dp)
                )
            }
        }
    }
}

/**
 * Start-edge navigation rail for Medium/Expanded windows (tablets, unfolded
 * foldables). Same destinations and behaviour as [BottomNavBar]. Pads for the
 * start/top/bottom system bars itself; items are tall enough that the icon
 * pill and the 11sp label are never clipped.
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

    Row(modifier = modifier.fillMaxHeight()) {
        NavigationRail(
            // Fixed width: items use fillMaxWidth(), which would otherwise stretch the
            // rail across the whole window inside the parent Row.
            modifier = Modifier.width(88.dp),
            containerColor = MaterialTheme.colorScheme.background,
            contentColor = MaterialTheme.colorScheme.onSurface,
            windowInsets = WindowInsets.systemBars.only(
                WindowInsetsSides.Start + WindowInsetsSides.Top + WindowInsetsSides.Bottom
            )
        ) {
            Spacer(modifier = Modifier.height(12.dp))
            bottomNavItems.forEach { item ->
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
        VerticalDivider(color = MaterialTheme.colorScheme.outlineVariant)
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

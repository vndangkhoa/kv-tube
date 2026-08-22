package com.kvtube.android.ui.navigation

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import androidx.navigation.compose.currentBackStackEntryAsState
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
            thickness = 0.8.dp,
            color = MaterialTheme.colorScheme.outline.copy(alpha = 0.25f)
        )

        // Compact 48dp YouTube bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp),
            horizontalArrangement = Arrangement.SpaceAround,
            verticalAlignment = Alignment.CenterVertically
        ) {
            bottomNavItems.forEach { item ->
                val selected = currentRoute?.startsWith(item.route) == true

                val activeColor = MaterialTheme.colorScheme.onSurface
                val inactiveColor = MaterialTheme.colorScheme.onSurfaceVariant

                val itemColor = if (selected) activeColor else inactiveColor
                val iconVector = if (selected) item.selectedIcon else item.unselectedIcon

                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                    modifier = Modifier
                        .weight(1f)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null
                        ) {
                            onTabClick(item.route)
                            if (currentRoute != item.route) {
                                navController.navigate(item.route) {
                                    popUpTo(Screen.Home.route) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            }
                        }
                        .padding(vertical = 4.dp)
                ) {
                    Box(contentAlignment = Alignment.TopEnd) {
                        Icon(
                            imageVector = iconVector,
                            contentDescription = item.label,
                            tint = itemColor,
                            modifier = Modifier.size(22.dp)
                        )

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
                        fontSize = 10.sp,
                        fontWeight = if (selected) FontWeight.Medium else FontWeight.Normal,
                        maxLines = 1
                    )
                }
            }
        }
    }
}

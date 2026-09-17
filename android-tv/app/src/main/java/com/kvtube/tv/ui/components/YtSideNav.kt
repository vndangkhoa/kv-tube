package com.kvtube.tv.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.tv.material3.*
import com.kvtube.tv.ui.theme.YTBrandRed

data class NavItem(val route: String, val label: String, val icon: ImageVector)

val ytNavItems = listOf(
    NavItem("home", "Home", Icons.Filled.Home),
    NavItem("latest", "Latest", Icons.Filled.NewReleases),
    NavItem("search", "Search", Icons.Filled.Search),
    NavItem("library", "You", Icons.Filled.Person),
    NavItem("settings", "Settings", Icons.Filled.Settings),
)

// Fixed 72dp collapsed rail width. Always collapsed, never extends/overlays content.
const val TV_NAV_RAIL_WIDTH = 72

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun YtSideNav(
    currentRoute: String?,
    onNavigate: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .width(TV_NAV_RAIL_WIDTH.dp)
            .fillMaxHeight()
            .background(Color(0xFF141414))
            .padding(vertical = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // KV-Tube Logo icon at top
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(YTBrandRed)
                .padding(4.dp),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = Icons.Filled.PlayArrow,
                contentDescription = "KV-Tube",
                tint = Color.White,
                modifier = Modifier.size(32.dp)
            )
        }

        Spacer(Modifier.height(28.dp))

        ytNavItems.forEach { item ->
            val selected = currentRoute == item.route || (item.route == "home" && currentRoute == null)
            YtNavRailButton(
                item = item,
                selected = selected,
                onClick = { onNavigate(item.route) }
            )
            Spacer(Modifier.height(10.dp))
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun YtNavRailButton(
    item: NavItem,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(24.dp)
    var focused by remember { mutableStateOf(false) }

    Surface(
        onClick = onClick,
        modifier = Modifier
            .size(48.dp)
            .onFocusChanged { focused = it.isFocused },
        shape = ClickableSurfaceDefaults.shape(shape),
        scale = ClickableSurfaceDefaults.scale(focusedScale = 1.10f),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = if (selected && !focused) Color.White.copy(alpha = 0.12f) else Color.Transparent,
            focusedContainerColor = Color.White,
            contentColor = if (selected) Color.White else Color.White.copy(alpha = 0.6f),
            focusedContentColor = Color.Black,
        ),
        border = ClickableSurfaceDefaults.border(
            border = Border(BorderStroke(1.dp, if (selected) Color.White.copy(alpha = 0.25f) else Color.Transparent)),
            focusedBorder = Border(BorderStroke(1.dp, Color.White)),
        ),
    ) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = item.icon,
                contentDescription = item.label,
                modifier = Modifier.size(22.dp),
                tint = if (focused) Color.Black else if (selected) Color.White else Color.White.copy(alpha = 0.7f)
            )
        }
    }
}

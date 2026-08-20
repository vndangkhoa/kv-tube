package com.kvtube.tv.ui.components

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
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.BorderStroke
import androidx.tv.material3.*
import com.kvtube.tv.ui.theme.YTBackground
import com.kvtube.tv.ui.theme.YTBrandRed
import com.kvtube.tv.ui.theme.YTChip

data class NavItem(val route: String, val label: String, val icon: ImageVector)

val ytNavItems = listOf(
    NavItem("home", "Home", Icons.Filled.Home),
    NavItem("latest", "Latest", Icons.Filled.NewReleases),
    NavItem("search", "Search", Icons.Filled.Search),
    NavItem("library", "You", Icons.Filled.Person),
    NavItem("settings", "Settings", Icons.Filled.Settings),
)

// Always collapsed - 72dp icon-only rail, never expands. Full bleed content.
private const val RAIL_WIDTH = 72

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun YtSideNav(
    currentRoute: String?,
    onNavigate: (String) -> Unit,
    modifier: Modifier = Modifier,
    expanded: Boolean = false,
    onExpandChange: (Boolean) -> Unit = {},
) {
    // Permanently collapsed - icon-only, always visible, never overlays content
    Column(
        modifier
            .width(RAIL_WIDTH.dp)
            .fillMaxHeight()
            .background(Color(0xFF1A1A1A))
            .padding(vertical = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // KV-Tube Logo at top
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
                modifier = Modifier.size(34.dp)
            )
        }
        Spacer(Modifier.height(24.dp))
        ytNavItems.forEach { item ->
            val selected = currentRoute == item.route || (item.route == "home" && currentRoute == null)
            YtNavRailButton(
                item = item,
                expanded = false,
                selected = selected,
                onClick = { onNavigate(item.route) },
                onFocusExpand = { },
            )
            Spacer(Modifier.height(8.dp))
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun YtNavRailButton(
    item: NavItem,
    expanded: Boolean,
    selected: Boolean,
    onClick: () -> Unit,
    onFocusExpand: () -> Unit,
) {
    val shape = RoundedCornerShape(24.dp)
    var focused by remember { mutableStateOf(false) }
    LaunchedEffect(focused) { if (focused) onFocusExpand() }
    // keep expanded while any rail button focused; collapse handled by parent via timeout would be nicer —
    // simplified: expand stays true after first focus until user moves far; acceptable for TV
    Surface(
        onClick = onClick,
        modifier = Modifier
            .padding(horizontal = 8.dp)
            .fillMaxWidth()
            .height(44.dp)
            .onFocusChanged { focused = it.isFocused },
        shape = ClickableSurfaceDefaults.shape(shape),
        scale = ClickableSurfaceDefaults.scale(focusedScale = 1.02f),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = Color.Transparent,
            focusedContainerColor = Color.White,
            contentColor = if (selected) Color.White else Color.White.copy(alpha = 0.6f),
            focusedContentColor = Color.Black,
        ),
        border = ClickableSurfaceDefaults.border(
            border = Border(BorderStroke(1.dp, Color.White.copy(alpha = 0.10f))),
            focusedBorder = Border(BorderStroke(1.dp, Color.White.copy(alpha = 0.9f))),
        ),
    ) {
        Row(
            Modifier.fillMaxSize().padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(item.icon, contentDescription = item.label, modifier = Modifier.size(22.dp), tint = if (focused) Color.Black else Color.White)
            if (expanded) {
                Spacer(Modifier.width(12.dp))
                Text(item.label, color = if (focused) Color.Black else Color.White, style = MaterialTheme.typography.labelLarge.copy(fontSize = 13.sp, color = if (focused) Color.Black else Color.White), maxLines = 1)
            }
        }
    }
}

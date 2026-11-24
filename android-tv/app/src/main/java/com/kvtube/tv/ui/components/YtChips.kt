package com.kvtube.tv.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.foundation.lazy.list.TvLazyRow
import androidx.tv.foundation.lazy.list.items
import androidx.tv.material3.*
import com.kvtube.tv.ui.theme.YTBorderSubtle
import com.kvtube.tv.ui.theme.YTChip
import com.kvtube.tv.ui.theme.YTChipSelected
import com.kvtube.tv.ui.theme.YTFocus
import com.kvtube.tv.ui.theme.YTFocusGlow
import com.kvtube.tv.ui.theme.YTFocusInk
import com.kvtube.tv.ui.theme.YTTextPrimary

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun YtCategoryChips(
    categories: List<String>,
    selected: String,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    TvLazyRow(
        modifier = modifier,
        contentPadding = PaddingValues(horizontal = 36.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        items(categories, key = { it }) { cat ->
            val isSel = cat == selected
            Surface(
                onClick = { onSelect(cat) },
                modifier = Modifier.height(36.dp),
                shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(10.dp)),
                glow = ClickableSurfaceDefaults.glow(
                    focusedGlow = Glow(elevationColor = YTFocusGlow, elevation = 10.dp),
                ),
                colors = ClickableSurfaceDefaults.colors(
                    containerColor = if (isSel) YTChipSelected else YTChip,
                    contentColor = YTTextPrimary,
                    focusedContainerColor = YTFocus,
                    focusedContentColor = YTFocusInk,
                ),
                border = ClickableSurfaceDefaults.border(
                    border = Border(
                        BorderStroke(
                            1.dp,
                            if (isSel) Color.White.copy(alpha = 0.28f) else YTBorderSubtle,
                        )
                    ),
                    focusedBorder = Border(BorderStroke(1.5.dp, YTFocus)),
                ),
                scale = ClickableSurfaceDefaults.scale(focusedScale = 1.05f),
            ) {
                Text(
                    text = cat,
                    style = MaterialTheme.typography.labelLarge.copy(
                        fontSize = 13.sp,
                        fontWeight = if (isSel) FontWeight.Bold else FontWeight.Medium,
                    ),
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                )
            }
        }
    }
}

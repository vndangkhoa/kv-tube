package com.kvtube.android

import com.kvtube.android.ui.adaptive.FoldPosture
import com.kvtube.android.ui.adaptive.WidthClass
import com.kvtube.android.ui.adaptive.computeWindowState
import com.kvtube.android.ui.components.videoGridColumnCount
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WindowStateTest {

    @Test
    fun compactPhoneUsesSingleColumnAndBottomBar() {
        val state = computeWindowState(widthDp = 390, heightDp = 844)
        assertTrue(state.isCompact)
        assertEquals(WidthClass.Compact, state.widthClass)
        assertFalse(state.useNavigationRail)
        assertFalse(state.isFoldablePortraitWatch)
        assertFalse(state.isLandscapeTwoPaneWatch)
        assertEquals(1, videoGridColumnCount(state))
    }

    @Test
    fun foldablePortraitUsesMediumWidthNavRailTwoColumnsAndPortraitWatch() {
        val state = computeWindowState(widthDp = 736, heightDp = 883)
        assertEquals(WidthClass.Medium, state.widthClass)
        assertFalse(state.isLandscape)
        assertTrue(state.useNavigationRail)
        assertTrue(state.isFoldablePortraitWatch)
        assertFalse(state.isLandscapeTwoPaneWatch)
        assertEquals(2, videoGridColumnCount(state))
    }

    @Test
    fun foldableLandscapeUsesNavRailTwoPaneWatchAndThreeColumns() {
        val state = computeWindowState(widthDp = 883, heightDp = 736)
        assertEquals(WidthClass.Expanded, state.widthClass)
        assertTrue(state.isLandscape)
        assertTrue(state.useNavigationRail)
        assertFalse(state.isFoldablePortraitWatch)
        assertTrue(state.isLandscapeTwoPaneWatch)
        assertEquals(3, videoGridColumnCount(state))
    }

    @Test
    fun portraitTabletEnablesNavRailAndTwoColumns() {
        val state = computeWindowState(widthDp = 800, heightDp = 1280)
        assertEquals(WidthClass.Medium, state.widthClass)
        assertFalse(state.isLandscape)
        assertTrue(state.useNavigationRail)
        assertEquals(2, videoGridColumnCount(state))
    }

    @Test
    fun largeTabletLandscapeEnablesNavRailAndThreeColumns() {
        val state = computeWindowState(widthDp = 1138, heightDp = 711)
        assertEquals(WidthClass.Expanded, state.widthClass)
        assertTrue(state.isLandscape)
        assertTrue(state.useNavigationRail)
        assertTrue(state.isLandscapeTwoPaneWatch)
        assertEquals(3, videoGridColumnCount(state))
    }

    @Test
    fun ultraWideTabletEnablesNavRailAndFourColumns() {
        val state = computeWindowState(widthDp = 1400, heightDp = 900)
        assertTrue(state.useNavigationRail)
        assertEquals(4, videoGridColumnCount(state))
    }

    @Test
    fun tabletopPostureCapturesHorizontalHingeMetrics() {
        val state = computeWindowState(
            widthDp = 883,
            heightDp = 736,
            isHalfOpened = true,
            isHorizontalHinge = true,
            hingeTopDp = 360f,
            hingeHeightDp = 12f
        )
        assertTrue(state.isTabletop)
        assertEquals(FoldPosture.Tabletop, state.foldPosture)
        assertEquals(360f, state.hingeTopDp, 0.01f)
        assertEquals(12f, state.hingeHeightDp, 0.01f)
    }

    @Test
    fun bookPostureCapturesVerticalHingeAndUsesTwoPaneWatch() {
        val state = computeWindowState(
            widthDp = 736,
            heightDp = 883,
            isHalfOpened = true,
            isHorizontalHinge = false,
            hingeStartDp = 420f,
            hingeWidthDp = 8f
        )
        assertTrue(state.isBook)
        assertEquals(FoldPosture.Book, state.foldPosture)
        assertTrue(state.isLandscapeTwoPaneWatch)
        assertFalse(state.isFoldablePortraitWatch)
        assertEquals(420f, state.hingeStartDp, 0.01f)
        assertEquals(8f, state.hingeWidthDp, 0.01f)
    }
}

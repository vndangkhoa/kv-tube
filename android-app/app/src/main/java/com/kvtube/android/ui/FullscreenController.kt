package com.kvtube.android.ui

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * App-wide "player is fullscreen" flag. The watch screen sets it; MainScreen
 * observes it to hide its top bar / bottom bar / content padding so the player
 * truly covers the whole display instead of only the scaffold content area.
 */
@Singleton
class FullscreenController @Inject constructor() {

    private val _isFullscreen = MutableStateFlow(false)
    val isFullscreen: StateFlow<Boolean> = _isFullscreen.asStateFlow()

    fun setFullscreen(active: Boolean) {
        _isFullscreen.value = active
    }
}

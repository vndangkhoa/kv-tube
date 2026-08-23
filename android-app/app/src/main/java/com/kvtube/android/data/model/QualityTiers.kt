package com.kvtube.android.data.model

/**
 * YouTube-style quality tiers shown on the watch page.
 *  - Low      → ~360p
 *  - Mid      → ~720p
 *  - High     → ~1080p
 *  - Maximum  → highest resolution the source offers (4K etc.)
 */
enum class QualityTier(val label: String) {
    LOW("Low"),
    MID("Mid"),
    HIGH("High"),
    MAXIMUM("Maximum")
}

/**
 * Pure tier → stream resolution logic (unit-testable, no Android deps).
 *
 * YouTube only serves combined video+audio streams up to ~720p; everything
 * above is a video-only adaptive stream that must be merged with the separate
 * audio track by ExoPlayer. [resolve] therefore always returns the video
 * format plus the audio URL to merge, degrading to a lower combined stream
 * when no audio track exists so playback keeps its sound.
 */
object QualityTiers {

    /** Tier applied when opening a video. */
    val DEFAULT = QualityTier.HIGH

    fun maxHeightOf(tier: QualityTier): Int = when (tier) {
        QualityTier.LOW -> 360
        QualityTier.MID -> 720
        QualityTier.HIGH -> 1080
        QualityTier.MAXIMUM -> Int.MAX_VALUE
    }

    /**
     * Resolves [tier] against the available formats.
     *
     * @return the video format to play and the separate audio URL to merge
     *         with it (null when the video stream already carries audio or no
     *         audio track exists), or null when nothing is playable.
     */
    fun resolve(tier: QualityTier, info: PlaybackInfo?): Pair<PlaybackFormat, String?>? {
        info ?: return null
        val all = info.videoFormats.filter { it.url.isNotBlank() && it.height > 0 }
        if (all.isEmpty()) return null

        val cap = maxHeightOf(tier)
        val sortedDesc = all.sortedByDescending { it.height }

        // Highest stream at/below the cap; if every stream exceeds it (e.g.
        // only 480p+ exists while Low was picked) fall back to the smallest.
        val best = sortedDesc.firstOrNull { it.height <= cap }
            ?: sortedDesc.last()

        // Prefer a combined (video+audio) stream of equal height — no merge needed.
        val chosen = if (!best.hasAudio) {
            all.firstOrNull { it.hasAudio && it.height == best.height } ?: best
        } else {
            best
        }

        if (chosen.hasAudio) return chosen to null

        // Video-only: merge the instance's best audio track.
        val audioUrl = info.audioFormat?.url?.takeIf { it.isNotBlank() }
        if (audioUrl != null) return chosen to audioUrl

        // No audio track at all → degrade to the closest combined stream so
        // playback still has sound instead of being silent video.
        val combinedFallback = sortedDesc
            .filter { it.hasAudio }
            .let { list -> list.firstOrNull { it.height <= cap } ?: list.lastOrNull() }
            ?: return chosen to null
        return combinedFallback to null
    }
}

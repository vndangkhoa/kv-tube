package com.kvtube.android.data

import com.kvtube.android.data.model.VideoData
import java.time.LocalDate
import java.time.ZoneOffset

private val ZERO_AGE_REGEX = Regex("^0\\s+(giây|second|seconds|phút|minute|minutes)\\b")

/**
 * Rough recency score (in minutes) parsed from Invidious "publishedText"
 * labels like "3 hours ago", "2 weeks ago", "15 giờ trước", "2 ngày trước".
 * Newer videos yield smaller values (0 = just now / live / unknown).
 */
internal fun String.relativeRecencyMinutes(): Long {
    val text = lowercase()
    val number = Regex("(\\d+)").find(text)?.groupValues?.get(1)?.toLongOrNull() ?: 0L
    return when {
        "second" in text || "giây" in text -> number / 60L
        "minute" in text || "phút" in text -> number
        "hour" in text || "giờ" in text -> number * 60L
        "day" in text || "ngày" in text -> number * 60L * 24L
        "week" in text || "tuần" in text -> number * 60L * 24L * 7L
        "month" in text || "tháng" in text -> number * 60L * 24L * 30L
        "year" in text || "năm" in text -> number * 60L * 24L * 365L
        else -> 0L
    }
}

/**
 * True when Invidious returned a zero-age placeholder (e.g. "0 giây trước" /
 * "0 seconds ago") because the feed endpoint omitted the real upload instant.
 */
fun isZeroAgePlaceholder(text: String): Boolean =
    ZERO_AGE_REGEX.containsMatchIn(text.trim().lowercase())

/**
 * Human "X ago" label for a real upload instant [epochSeconds] (Unix seconds),
 * evaluated against [nowSeconds] (default: now). This is what the feed uses so
 * the shown recency is accurate and keeps aging, unlike the server label.
 *
 * shortcut: buckets are calendar-approximate (month=30d, year=365d); a full
 * Gregorian diff would be more precise for very old videos — upgrade here if
 * the month/year boundaries ever bother a user.
 */
fun relativeTimeFromEpoch(epochSeconds: Long, nowSeconds: Long = System.currentTimeMillis() / 1000L): String {
    if (epochSeconds <= 0L || epochSeconds > nowSeconds + 300L) return ""
    val diffSec = (nowSeconds - epochSeconds).coerceAtLeast(0L)
    if (diffSec < 60L) return "Just now"
    val minutes = diffSec / 60L
    if (minutes < 60L) return if (minutes == 1L) "1 minute ago" else "$minutes minutes ago"
    val hours = minutes / 60L
    if (hours < 24L) return if (hours == 1L) "1 hour ago" else "$hours hours ago"
    val days = hours / 24L
    if (days < 7L) return if (days == 1L) "1 day ago" else "$days days ago"
    if (days < 30L) {
        val weeks = days / 7L
        return if (weeks == 1L) "1 week ago" else "$weeks weeks ago"
    }
    if (days < 365L) {
        val months = (days / 30L).coerceAtMost(11L)
        return if (months == 1L) "1 month ago" else "$months months ago"
    }
    val years = days / 365L
    return if (years == 1L) "1 year ago" else "$years years ago"
}

/** Upload epoch (seconds) used for deterministic newest-first sorting across feeds. */
fun VideoData.recencySortEpoch(nowSeconds: Long = System.currentTimeMillis() / 1000L): Long {
    if (publishedUnix in 1L..(nowSeconds + 300L)) return publishedUnix
    if (published.isNotBlank() && !isZeroAgePlaceholder(published)) {
        val mins = published.relativeRecencyMinutes()
        return if (mins > 0L) (nowSeconds - mins * 60L).coerceAtLeast(1L)
        else if (isLive) nowSeconds
        else 0L
    }
    if (uploadDate.length == 8) {
        val parsed = runCatching {
            val y = uploadDate.substring(0, 4).toInt()
            val m = uploadDate.substring(4, 6).toInt()
            val d = uploadDate.substring(6, 8).toInt()
            LocalDate.of(y, m, d).atStartOfDay().toEpochSecond(ZoneOffset.UTC)
        }.getOrDefault(0L)
        if (parsed > 0L) return parsed
    }
    return if (isLive) nowSeconds else 0L
}

fun List<VideoData>.sortedLatestFirst(nowSeconds: Long = System.currentTimeMillis() / 1000L): List<VideoData> =
    sortedByDescending { it.recencySortEpoch(nowSeconds) }

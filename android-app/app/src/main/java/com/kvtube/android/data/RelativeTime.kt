package com.kvtube.android.data

/**
 * Rough recency score (in minutes) parsed from Invidious "publishedText"
 * labels like "3 hours ago", "2 weeks ago", "Streamed 1 day ago".
 * Newer videos yield smaller values (0 = just now / live / unknown).
 */
internal fun String.relativeRecencyMinutes(): Long {
    val text = lowercase()
    val number = Regex("(\\d+)").find(text)?.groupValues?.get(1)?.toLongOrNull() ?: 0L
    return when {
        "second" in text -> number / 60L
        "minute" in text -> number
        "hour" in text -> number * 60L
        "day" in text -> number * 60L * 24L
        "week" in text -> number * 60L * 24L * 7L
        "month" in text -> number * 60L * 24L * 30L
        "year" in text -> number * 60L * 24L * 365L
        else -> 0L
    }
}

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
    if (epochSeconds <= 0) return ""
    val diffSec = nowSeconds - epochSeconds
    if (diffSec < 45L) return "just now"
    fun unit(n: Long, name: String) = "$n $name${if (n == 1L) "" else "s"} ago"
    val minutes = (diffSec / 60L).coerceAtLeast(1L)
    if (minutes < 60L) return unit(minutes, "minute")
    val hours = minutes / 60L
    if (hours < 24L) return unit(hours, "hour")
    val days = hours / 24L
    if (days < 7L) return unit(days, "day")
    if (days < 30L) return unit(days / 7L, "week")
    val months = days / 30L
    if (months < 12L) return unit(months, "month")
    return unit(months / 12L, "year")
}

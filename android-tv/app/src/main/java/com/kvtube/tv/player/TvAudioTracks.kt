package com.kvtube.tv.player

import androidx.media3.common.C
import com.kvtube.tv.data.model.InvidiousAdaptiveFormat
import java.util.Locale

enum class AudioLanguagePreference(
    val key: String,
    val label: String,
    val shortLabel: String,
) {
    ORIGINAL("original", "Original (Recommended)", "Original"),
    VIETNAMESE("vi", "Tiếng Việt", "VI"),
    ENGLISH("en", "English", "EN"),
    DEVICE("device", "System default", "System");

    companion object {
        fun fromKey(key: String?): AudioLanguagePreference =
            entries.firstOrNull { it.key.equals(key?.trim(), ignoreCase = true) } ?: ORIGINAL
    }
}

data class TvAudioTrackOption(
    val id: String,
    val groupIndex: Int,
    val trackIndex: Int,
    val formatId: String?,
    val language: String?,
    val rawLabel: String?,
    val roleFlags: Int,
    val isOriginal: Boolean,
    val isDubbed: Boolean,
    val isStableVolume: Boolean,
    val bitrate: Int,
    val displayName: String,
    val shortBadge: String,
    val isSelected: Boolean = false,
)

data class UrlAudioMeta(
    val language: String? = null,
    val isOriginal: Boolean = false,
    val isDubbed: Boolean = false,
    val isStableVolume: Boolean = false,
)

object TvAudioTracks {

    fun parseUrlAudioMeta(url: String): UrlAudioMeta {
        if (url.isBlank()) return UrlAudioMeta()
        val match = Regex("(?:^|[?&])xtags=([^&]+)").find(url) ?: return UrlAudioMeta()
        val decoded = match.groupValues[1]
            .replace("%3D", "=", ignoreCase = true)
            .replace("%3d", "=", ignoreCase = true)
            .replace("%3A", ":", ignoreCase = true)
            .replace("%3a", ":", ignoreCase = true)
        var lang: String? = null
        var isOrig = false
        var isDub = false
        var isDrc = false
        for (part in decoded.split(":")) {
            val k = part.substringBefore("=").lowercase(Locale.ENGLISH)
            val v = part.substringAfter("=", "")
            when (k) {
                "acont" -> when {
                    v.equals("original", ignoreCase = true) -> isOrig = true
                    v.contains("dub", ignoreCase = true) -> isDub = true
                }
                "drc" -> if (v == "1" || v.equals("true", ignoreCase = true)) isDrc = true
                "lang" -> if (v.isNotBlank()) lang = v
            }
        }
        return UrlAudioMeta(
            language = lang,
            isOriginal = isOrig,
            isDubbed = !isOrig && isDub,
            isStableVolume = isDrc,
        )
    }

    private fun enrichFormat(fmt: InvidiousAdaptiveFormat): InvidiousAdaptiveFormat {
        val meta = parseUrlAudioMeta(fmt.url)
        val lang = fmt.audioLanguage?.takeIf { it.isNotBlank() } ?: meta.language
        val isOrig = fmt.isOriginalAudio || meta.isOriginal
        val isDub = !isOrig && (fmt.isDubbedAudio || meta.isDubbed)
        return if (lang == fmt.audioLanguage && isOrig == fmt.isOriginalAudio && isDub == fmt.isDubbedAudio) {
            fmt
        } else {
            fmt.copy(
                audioLanguage = lang,
                isOriginalAudio = isOrig,
                isDubbedAudio = isDub,
            )
        }
    }

    fun classifyTrack(
        groupIndex: Int,
        trackIndex: Int,
        formatId: String?,
        language: String?,
        rawLabel: String?,
        roleFlags: Int,
        bitrate: Int,
        isSelected: Boolean = false,
    ): TvAudioTrackOption {
        val cleanLang = language?.trim()?.takeIf { it.isNotBlank() && !it.equals("und", ignoreCase = true) }
        val cleanLabel = rawLabel?.trim()?.takeIf { it.isNotBlank() }
        val cleanFmtId = formatId?.trim()?.takeIf { it.isNotBlank() }

        val hasMainRole = (roleFlags and C.ROLE_FLAG_MAIN) != 0
        val hasDubRole = (roleFlags and C.ROLE_FLAG_DUB) != 0
        val hasEnhancedRole = (roleFlags and C.ROLE_FLAG_ENHANCED_DIALOG_INTELLIGIBILITY) != 0

        val isDubbed = hasDubRole ||
            (!hasMainRole && cleanLabel?.contains("dub", ignoreCase = true) == true) ||
            (!hasMainRole && (cleanFmtId?.endsWith(".10") == true || cleanFmtId?.endsWith(".3") == true))

        val isOriginal = !isDubbed && (hasMainRole || cleanLabel?.contains("original", ignoreCase = true) == true)

        val isStableVolume = hasEnhancedRole ||
            cleanLabel?.contains("stable volume", ignoreCase = true) == true ||
            cleanFmtId?.endsWith("-drc", ignoreCase = true) == true

        val displayName = formatDisplayName(cleanLang, cleanLabel, isOriginal, isDubbed, isStableVolume)
        val shortBadge = formatShortBadge(cleanLang, isOriginal, isDubbed)

        return TvAudioTrackOption(
            id = "$groupIndex:$trackIndex",
            groupIndex = groupIndex,
            trackIndex = trackIndex,
            formatId = cleanFmtId,
            language = cleanLang,
            rawLabel = cleanLabel,
            roleFlags = roleFlags,
            isOriginal = isOriginal,
            isDubbed = isDubbed,
            isStableVolume = isStableVolume,
            bitrate = bitrate.coerceAtLeast(0),
            displayName = displayName,
            shortBadge = shortBadge,
            isSelected = isSelected,
        )
    }

    fun pickPreferredIndex(
        tracks: List<TvAudioTrackOption>,
        pref: AudioLanguagePreference,
        deviceLanguage: String = "en",
    ): Int {
        if (tracks.isEmpty()) return -1
        val targetLang = when (pref) {
            AudioLanguagePreference.VIETNAMESE -> "vi"
            AudioLanguagePreference.ENGLISH -> "en"
            AudioLanguagePreference.DEVICE -> normalizePrimaryLang(deviceLanguage).ifBlank { "en" }
            AudioLanguagePreference.ORIGINAL -> null
        }

        var bestIdx = 0
        var bestScore = Long.MIN_VALUE
        for (i in tracks.indices) {
            val t = tracks[i]
            var score = 0L
            when (pref) {
                AudioLanguagePreference.ORIGINAL -> {
                    score += if (t.isOriginal && !t.isDubbed) 20_000L else if (!t.isDubbed) 10_000L else -20_000L
                    if ((t.roleFlags and C.ROLE_FLAG_ALTERNATE) == 0) score += 500L
                    if (!t.isStableVolume) score += 100L
                }
                AudioLanguagePreference.VIETNAMESE,
                AudioLanguagePreference.ENGLISH,
                AudioLanguagePreference.DEVICE -> {
                    if (targetLang != null && languageMatches(t.language, targetLang)) score += 30_000L
                    if (t.isOriginal && !t.isDubbed) score += 5_000L
                    else if (!t.isDubbed) score += 1_000L
                    if (!t.isStableVolume) score += 100L
                }
            }
            score += (t.bitrate / 10_000).coerceIn(0, 99).toLong()
            if (score > bestScore) {
                bestScore = score
                bestIdx = i
            }
        }
        return bestIdx
    }

    fun sortForDisplay(tracks: List<TvAudioTrackOption>): List<TvAudioTrackOption> =
        tracks.sortedWith(
            compareByDescending<TvAudioTrackOption> { it.isOriginal && !it.isDubbed }
                .thenBy { it.isDubbed }
                .thenBy { it.isStableVolume }
                .thenBy { it.displayName.lowercase(Locale.ENGLISH) }
        )

    fun selectBestAdaptiveAudio(
        formats: List<InvidiousAdaptiveFormat>,
        pref: AudioLanguagePreference = AudioLanguagePreference.ORIGINAL,
        deviceLanguage: String = "en",
    ): InvidiousAdaptiveFormat? {
        val allAudio = formats
            .filter { it.type.startsWith("audio/") && it.url.isNotBlank() }
            .map(::enrichFormat)
        if (allAudio.isEmpty()) return null
        val aacOnly = allAudio.filter {
            it.type.contains("mp4") || it.type.contains("mp4a") || it.type.contains("aac")
        }
        val candidates = if (aacOnly.isNotEmpty()) aacOnly else allAudio
        val targetLang = when (pref) {
            AudioLanguagePreference.VIETNAMESE -> "vi"
            AudioLanguagePreference.ENGLISH -> "en"
            AudioLanguagePreference.DEVICE -> normalizePrimaryLang(deviceLanguage).ifBlank { "en" }
            AudioLanguagePreference.ORIGINAL -> null
        }

        return candidates.maxByOrNull { fmt ->
            val meta = parseUrlAudioMeta(fmt.url)
            val langScore = when (pref) {
                AudioLanguagePreference.ORIGINAL -> when {
                    fmt.isOriginalAudio && !fmt.isDubbedAudio -> 20_000L
                    !fmt.isDubbedAudio -> 10_000L
                    else -> -20_000L
                }
                AudioLanguagePreference.VIETNAMESE,
                AudioLanguagePreference.ENGLISH,
                AudioLanguagePreference.DEVICE -> {
                    var s = 0L
                    if (targetLang != null && languageMatches(fmt.audioLanguage, targetLang)) s += 30_000L
                    if (fmt.isOriginalAudio && !fmt.isDubbedAudio) s += 5_000L
                    else if (!fmt.isDubbedAudio) s += 1_000L
                    s
                }
            } + if (!meta.isStableVolume) 50L else 0L
            val bitrateKbps = (fmt.bitrate?.toIntOrNull() ?: 0) / 1000
            langScore + bitrateKbps
        } ?: candidates.maxByOrNull { it.bitrate?.toIntOrNull() ?: 0 }
    }

    fun distinctAdaptiveAudios(formats: List<InvidiousAdaptiveFormat>): List<InvidiousAdaptiveFormat> {
        val allAudio = formats
            .filter { it.type.startsWith("audio/") && it.url.isNotBlank() }
            .map(::enrichFormat)
        if (allAudio.isEmpty()) return emptyList()
        val aacOnly = allAudio.filter {
            it.type.contains("mp4") || it.type.contains("mp4a") || it.type.contains("aac")
        }
        val pool = if (aacOnly.isNotEmpty()) aacOnly else allAudio
        val grouped = LinkedHashMap<String, InvidiousAdaptiveFormat>()
        for (fmt in pool) {
            val meta = parseUrlAudioMeta(fmt.url)
            val langKey = fmt.audioLanguage?.lowercase(Locale.ENGLISH) ?: "und"
            val key = "$langKey|orig=${fmt.isOriginalAudio}|dub=${fmt.isDubbedAudio}|drc=${meta.isStableVolume}"
            val existing = grouped[key]
            val existingBr = existing?.bitrate?.toIntOrNull() ?: 0
            val curBr = fmt.bitrate?.toIntOrNull() ?: 0
            if (existing == null || curBr > existingBr) {
                grouped[key] = fmt
            }
        }
        return grouped.values.sortedWith(
            compareByDescending<InvidiousAdaptiveFormat> { it.isOriginalAudio && !it.isDubbedAudio }
                .thenBy { it.isDubbedAudio }
                .thenBy { parseUrlAudioMeta(it.url).isStableVolume }
                .thenBy { it.audioLanguage?.lowercase(Locale.ENGLISH).orEmpty() }
        )
    }

    internal fun languageMatches(trackLang: String?, wantedPrimary: String): Boolean {
        val tl = trackLang?.trim()?.lowercase(Locale.ENGLISH) ?: return false
        val wl = normalizePrimaryLang(wantedPrimary)
        if (tl.isBlank() || wl.isBlank()) return false
        return tl == wl || tl.startsWith("$wl-") || tl.startsWith("${wl}_")
    }

    private fun normalizePrimaryLang(lang: String): String =
        lang.trim().lowercase(Locale.ENGLISH).substringBefore("-").substringBefore("_")

    private fun formatDisplayName(
        lang: String?,
        rawLabel: String?,
        isOriginal: Boolean,
        isDubbed: Boolean,
        isStableVolume: Boolean,
    ): String {
        val stripped = rawLabel
            ?.replace(Regex("\\(\\s*stable volume\\s*\\)", RegexOption.IGNORE_CASE), "")
            ?.replace(Regex("\\bstable volume\\b", RegexOption.IGNORE_CASE), "")
            ?.replace(Regex("\\boriginal\\b", RegexOption.IGNORE_CASE), "")
            ?.replace(Regex("\\(\\s*auto-?dub(?:bed)?\\s*\\)", RegexOption.IGNORE_CASE), "")
            ?.replace(Regex("\\s{2,}"), " ")
            ?.trim()
            ?.takeIf { it.isNotBlank() && it != "-" }

        val base = stripped ?: languageDisplayName(lang) ?: "Audio"
        val tags = buildList {
            if (isOriginal) add("Original")
            if (isDubbed) add("Auto-dub")
            if (isStableVolume) add("Stable Volume")
        }
        return when {
            tags.isEmpty() -> base
            isDubbed && !isOriginal && !isStableVolume -> "$base • Auto-dub"
            else -> "$base (${tags.joinToString(" • ")})"
        }
    }

    private fun formatShortBadge(lang: String?, isOriginal: Boolean, isDubbed: Boolean): String {
        val code = lang?.substringBefore("-")?.substringBefore("_")?.uppercase(Locale.ENGLISH)?.takeIf { it.isNotBlank() }
        return when {
            isOriginal && code != null -> "$code • Orig"
            isOriginal -> "Original"
            isDubbed && code != null -> "$code • Dub"
            isDubbed -> "Dub"
            code != null -> code
            else -> "Audio"
        }
    }

    private fun languageDisplayName(lang: String?): String? {
        val tag = lang?.trim()?.takeIf { it.isNotBlank() } ?: return null
        val display = Locale.forLanguageTag(tag).getDisplayName(Locale.ENGLISH).trim()
        return display.takeIf { it.isNotBlank() && !it.equals(tag, ignoreCase = true) } ?: tag.uppercase(Locale.ENGLISH)
    }
}

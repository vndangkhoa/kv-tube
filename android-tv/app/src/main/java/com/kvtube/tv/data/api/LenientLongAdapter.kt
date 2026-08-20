package com.kvtube.tv.data.api

import com.squareup.moshi.FromJson
import com.squareup.moshi.JsonReader
import com.squareup.moshi.JsonWriter
import com.squareup.moshi.ToJson

/**
 * Invidious is inconsistent: most `published` fields are epoch longs,
 * but `recommendedVideos[].published` comes as an ISO-8601 string
 * like "2026-03-20T12:36:21Z". The stock Moshi `Long` adapter throws
 * "Expected a long but was 2026-..."
 * This adapter accepts both NUMBER and STRING and never throws — on
 * unparseable strings it returns null (we display `publishedText` anyway).
 */
class LenientLongAdapter {
    @FromJson
    fun fromJson(reader: JsonReader): Long? {
        return when (reader.peek()) {
            JsonReader.Token.NULL -> {
                reader.nextNull<Any>()
                null
            }
            JsonReader.Token.NUMBER -> reader.nextLong()
            JsonReader.Token.STRING -> {
                val s = reader.nextString()
                s.toLongOrNull() // ISO-8601 strings → null (we don't need the epoch)
            }
            else -> {
                reader.skipValue()
                null
            }
        }
    }

    @ToJson
    fun toJson(writer: JsonWriter, value: Long?) {
        if (value == null) writer.nullValue() else writer.value(value)
    }
}

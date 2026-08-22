package com.kvtube.tv.data.model

data class TvUpdateInfo(
    val latestVersion: String,
    val currentVersion: String,
    val downloadUrl: String,
    val releaseNotes: String = "",
    val tagName: String = ""
)

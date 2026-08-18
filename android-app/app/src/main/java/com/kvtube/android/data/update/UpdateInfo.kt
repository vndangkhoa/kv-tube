package com.kvtube.android.data.update

import kotlinx.serialization.Serializable

@Serializable
data class UpdateInfo(
    val latestVersion: String,
    val downloadUrl: String,
    val releaseNotes: String = "",
    val hasUpdate: Boolean = true
) {
    val changelog: String
        get() = releaseNotes
}

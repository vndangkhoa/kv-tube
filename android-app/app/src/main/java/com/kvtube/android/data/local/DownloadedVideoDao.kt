package com.kvtube.android.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface DownloadedVideoDao {

    @Query("SELECT * FROM downloaded_videos ORDER BY downloadedAt DESC")
    fun getAll(): Flow<List<DownloadedVideoEntity>>

    @Query("SELECT * FROM downloaded_videos WHERE videoId = :videoId LIMIT 1")
    suspend fun getByVideoId(videoId: String): DownloadedVideoEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(video: DownloadedVideoEntity)

    @Query("DELETE FROM downloaded_videos WHERE videoId = :videoId")
    suspend fun deleteByVideoId(videoId: String)

    @Query("UPDATE downloaded_videos SET title = :newTitle WHERE videoId = :videoId")
    suspend fun updateTitle(videoId: String, newTitle: String)
}

package com.kvtube.android.di

import com.kvtube.android.data.api.KVApi
import com.kvtube.android.data.local.DownloadedVideoDao
import com.kvtube.android.data.local.SettingsDataStore
import com.kvtube.android.data.repository.ChannelRepository
import com.kvtube.android.data.repository.DownloadRepository
import com.kvtube.android.data.repository.HistoryRepository
import com.kvtube.android.data.repository.SubscriptionRepository
import com.kvtube.android.data.repository.VideoRepository
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object RepositoryModule {

    @Provides
    @Singleton
    fun provideVideoRepository(api: KVApi): VideoRepository {
        return VideoRepository(api)
    }

    @Provides
    @Singleton
    fun provideChannelRepository(api: KVApi): ChannelRepository {
        return ChannelRepository(api)
    }

    @Provides
    @Singleton
    fun provideSubscriptionRepository(api: KVApi): SubscriptionRepository {
        return SubscriptionRepository(api)
    }

    @Provides
    @Singleton
    fun provideHistoryRepository(api: KVApi): HistoryRepository {
        return HistoryRepository(api)
    }

    @Provides
    @Singleton
    fun provideDownloadRepository(
        downloadDao: DownloadedVideoDao,
        settingsDataStore: SettingsDataStore
    ): DownloadRepository {
        return DownloadRepository(downloadDao, settingsDataStore)
    }
}

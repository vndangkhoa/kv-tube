package com.kvtube.android.di

import com.kvtube.android.data.api.KVApi
import com.kvtube.android.data.extractor.ExtractorHelper
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
    fun provideVideoRepository(api: KVApi, extractorHelper: ExtractorHelper): VideoRepository {
        return VideoRepository(api, extractorHelper)
    }

    @Provides
    @Singleton
    fun provideChannelRepository(api: KVApi): ChannelRepository {
        return ChannelRepository(api)
    }

    @Provides
    @Singleton
    fun provideSubscriptionRepository(
        api: KVApi,
        subscribedChannelDao: com.kvtube.android.data.local.SubscribedChannelDao
    ): SubscriptionRepository {
        return SubscriptionRepository(api, subscribedChannelDao)
    }

    @Provides
    @Singleton
    fun provideHistoryRepository(historyDao: com.kvtube.android.data.local.WatchHistoryDao): HistoryRepository {
        return HistoryRepository(historyDao)
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

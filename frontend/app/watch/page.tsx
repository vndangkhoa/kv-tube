import { Suspense } from 'react';
import VideoPlayer from './VideoPlayer';
import Link from 'next/link';
import WatchActions from './WatchActions';
import SubscribeButton from '../components/SubscribeButton';
import NextVideoClient from './NextVideoClient';
import WatchFeed from './WatchFeed';
import PlaylistPanel from './PlaylistPanel';
import Comments from './Comments';
import { API_BASE, VideoData } from '../constants';
import { cookies } from 'next/headers';
import { getRelatedVideos, getSuggestedVideos, getSearchVideos } from '../actions';
import { addRegion, getRandomModifier } from '../utils';

const REGION_LABELS: Record<string, string> = {
  VN: 'Vietnam',
  US: 'United States',
  JP: 'Japan',
  KR: 'South Korea',
  IN: 'India',
  GB: 'United Kingdom',
  GLOBAL: '',
};

interface VideoInfo {
    title: string;
    description: string;
    uploader: string;
    channel_id: string;
    view_count: number;
    thumbnail?: string;
}

async function getVideoInfo(id: string): Promise<VideoInfo | null> {
    try {
        const res = await fetch(`${API_BASE}/api/get_stream_info?v=${id}`, { cache: 'no-store' });
        if (!res.ok) return null;
        const data = await res.json();
        return {
            title: data.title || `Video ${id}`,
            description: data.description || '',
            uploader: data.uploader || 'Unknown',
            channel_id: data.channel_id || '',
            view_count: data.view_count || 0,
            thumbnail: data.thumbnail || `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
        };
    } catch (e) {
        console.error(e);
        return null;
    }
}

function formatNumber(num: number): string {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(0) + 'K';
    return num.toString();
}

export default async function WatchPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const awaitParams = await searchParams;
    const v = awaitParams.v as string;
    const list = awaitParams.list as string;
    const isMix = list?.startsWith('RD');

    if (!v) {
        return <div style={{ padding: '2rem' }}>No video ID provided</div>;
    }

    const info = await getVideoInfo(v);

    const cookieStore = await cookies();
    const regionCode = cookieStore.get('region')?.value || 'VN';
    const regionLabel = REGION_LABELS[regionCode] || '';
    const randomMod = getRandomModifier();

    // Fetch initial mix
    const promises = [
        getSuggestedVideos(12),
        getRelatedVideos(v, 12),
        getSearchVideos(addRegion("trending", regionLabel) + ' ' + randomMod, 6)
    ];

    const [suggestedRes, relatedRes, trendingRes] = await Promise.all(promises);

    const interleavedList: VideoData[] = [];
    const seenIds = new Set<string>();

    let sIdx = 0, rIdx = 0, tIdx = 0;
    while (sIdx < suggestedRes.length || rIdx < relatedRes.length || tIdx < trendingRes.length) {
        for (let i = 0; i < 2 && sIdx < suggestedRes.length; i++) {
            const vid = suggestedRes[sIdx++];
            if (!seenIds.has(vid.id) && vid.id !== v) { interleavedList.push(vid); seenIds.add(vid.id); }
        }
        for (let i = 0; i < 2 && rIdx < relatedRes.length; i++) {
            const vid = relatedRes[rIdx++];
            if (!seenIds.has(vid.id) && vid.id !== v) { interleavedList.push(vid); seenIds.add(vid.id); }
        }
        for (let i = 0; i < 1 && tIdx < trendingRes.length; i++) {
            const vid = trendingRes[tIdx++];
            if (!seenIds.has(vid.id) && vid.id !== v) { interleavedList.push(vid); seenIds.add(vid.id); }
        }
    }

    let initialMix = interleavedList;
    const initialRelated = relatedRes.filter(vid => vid.id !== v);
    const initialSuggestions = suggestedRes.filter(vid => vid.id !== v);

    // If not currently inside a mix, inject a Mix Card at the start
    if (!isMix && info) {
        const mixCard: VideoData = {
            id: v,
            title: `Mix - ${info.uploader || 'Auto-generated'}`,
            uploader: info.uploader || 'KV-Tube',
            thumbnail: info.thumbnail || `https://i.ytimg.com/vi/${v}/maxresdefault.jpg`,
            view_count: 0,
            duration: '50+',
            list_id: `RD${v}`,
            is_mix: true
        };
        initialMix.unshift(mixCard);
    }

    // Always build a Mix playlist
    let playlistVideos: VideoData[] = [];
    const mixBaseId = isMix ? list.replace('RD', '') : v;
    const mixListId = isMix ? list : `RD${v}`;
    {
        const baseInfo = isMix ? await getVideoInfo(mixBaseId) : info;
        
        // Seed the playlist with the base video
        if (baseInfo) {
            playlistVideos.push({
                id: mixBaseId,
                title: baseInfo.title,
                uploader: baseInfo.uploader,
                thumbnail: baseInfo.thumbnail || `https://i.ytimg.com/vi/${mixBaseId}/maxresdefault.jpg`,
                view_count: baseInfo.view_count,
                duration: ''
            });
        }

        // Multi-source search to build a rich playlist (15-25 videos)
        const uploaderName = baseInfo?.uploader || '';
        const videoTitle = baseInfo?.title || '';
        const titleKeywords = videoTitle.split(/[\s\-|]+/).filter((w: string) => w.length > 2).slice(0, 4).join(' ');

        const mixPromises = [
            uploaderName ? getSearchVideos(uploaderName, 10) : Promise.resolve([]),
            titleKeywords ? getSearchVideos(titleKeywords, 10) : Promise.resolve([]),
            getRelatedVideos(mixBaseId, 10),
        ];

        const [byUploader, byTitle, byRelated] = await Promise.all(mixPromises);
        const seenMixIds = new Set(playlistVideos.map(p => p.id));

        const sources = [byUploader, byTitle, byRelated];
        let added = 0;
        const maxPlaylist = 25;

        let idx = [0, 0, 0];
        while (added < maxPlaylist) {
            let anyAdded = false;
            for (let s = 0; s < sources.length; s++) {
                while (idx[s] < sources[s].length && added < maxPlaylist) {
                    const vid = sources[s][idx[s]++];
                    if (!seenMixIds.has(vid.id)) {
                        seenMixIds.add(vid.id);
                        playlistVideos.push(vid);
                        added++;
                        anyAdded = true;
                        break;
                    }
                }
            }
            if (!anyAdded) break;
        }
    }

    // Determine the next video
    let nextVideoId = '';
    let nextListId: string | undefined = undefined;

    if (playlistVideos.length > 0) {
        const currentIndex = playlistVideos.findIndex(p => p.id === v);
        if (currentIndex >= 0 && currentIndex < playlistVideos.length - 1) {
            nextVideoId = playlistVideos[currentIndex + 1].id;
            nextListId = mixListId;
        } else {
            nextVideoId = initialMix.length > 0 && initialMix[0].is_mix ? (initialMix[1]?.id || '') : (initialMix[0]?.id || '');
        }
    } else {
        const firstRealVideo = initialMix.find(vid => !vid.is_mix);
        nextVideoId = firstRealVideo ? firstRealVideo.id : '';
    }

    return (
        <div className="watch-container fade-in">
            {nextVideoId && <NextVideoClient videoId={nextVideoId} listId={nextListId} />}
            <div className="watch-primary">
                <div className="watch-player-wrapper">
                    <VideoPlayer
                        videoId={v}
                        title={info?.title}
                    />
                </div>

                <h1 className="watch-title">
                    {info?.title || `Video ${v}`}
                </h1>

                {info && (
                    <div className="watch-meta-row">
                        <div className="watch-channel-info">
                            <Link href={info.channel_id ? `/channel/${info.channel_id}` : '#'} className="watch-channel-link">
                                <div className="watch-channel-text">
                                    <span className="watch-channel-name">{info.uploader}</span>
                                </div>
                            </Link>
                            <SubscribeButton channelId={info.channel_id} channelName={info.uploader} />
                        </div>

                        <div className="watch-actions-row">
                            <WatchActions videoId={v} />
                        </div>
                    </div>
                )}

                {info && (
                    <div className="watch-description-box">
                        <div className="watch-description-stats">
                            {formatNumber(info.view_count)} views
                        </div>
                        <div className="watch-description-text">
                            {info.description || 'No description available.'}
                        </div>
                    </div>
                )}
            </div>

            {/* Comments as a separate flex child for responsive reordering */}
            <div className="comments-section">
                <Comments videoId={v} />
            </div>

            <div className="watch-secondary">
                {playlistVideos.length > 0 && (
                    <PlaylistPanel 
                        videos={playlistVideos} 
                        currentVideoId={v} 
                        listId={mixListId} 
                        title={`Mix - ${playlistVideos[0]?.uploader || 'YouTube'}`}
                    />
                )}
                <WatchFeed
                    videoId={v}
                    regionLabel={regionLabel}
                    initialMix={initialMix}
                    initialRelated={initialRelated}
                    initialSuggestions={initialSuggestions}
                />
            </div>
        </div>
    );
}

'use client';

import { useState } from 'react';
import InfiniteVideoGrid from '../components/InfiniteVideoGrid';
import { VideoData } from '../constants';

interface Props {
    videoId: string;
    regionLabel: string;
    initialMix: VideoData[]; // Initial 40:40:20 mix data for "All" tab
    initialRelated: VideoData[]; // Initial related data for "Related" tab
    initialSuggestions: VideoData[]; // Initial suggestions data for "For You" tab
}

const WATCH_TABS = ['All', 'Mix', 'Related', 'For You', 'Trending'];

export default function WatchFeed({ videoId, regionLabel, initialMix, initialRelated, initialSuggestions }: Props) {
    const [activeTab, setActiveTab] = useState('All');

    // Determine category id and initial videos based on active tab
    let currentCategory = 'WatchAll';
    let videos = initialMix;

    if (activeTab === 'Related') {
        currentCategory = 'WatchRelated';
        videos = initialRelated;
    } else if (activeTab === 'For You') {
        currentCategory = 'WatchForYou';
        videos = initialSuggestions;
    } else if (activeTab === 'Trending') {
        currentCategory = 'Trending';
        // 'Trending' falls back to standard fetchMoreVideos logic which handles normal categories or we can handle it specifically.
        // It's empty initially if missing, the infinite grid will load it.
        videos = [];
    }

    return (
        <div style={{ marginTop: '24px' }}>
            <div style={{ display: 'flex', gap: '12px', padding: '0 0 16px 0', overflowX: 'auto' }} className="hide-scrollbox">
                {WATCH_TABS.map((tab) => {
                    const isActive = tab === activeTab;
                    return (
                        <button
                            key={tab}
                            onClick={() => {
                                if (tab === 'Mix') {
                                    window.location.href = `/watch?v=${videoId}&list=RD${videoId}`;
                                } else {
                                    setActiveTab(tab);
                                }
                            }}
                            className={`chip ${isActive ? 'active' : ''}`}
                            style={{
                                fontSize: '14px',
                                whiteSpace: 'nowrap',
                                backgroundColor: isActive ? 'var(--foreground)' : 'var(--yt-hover)',
                                color: isActive ? 'var(--background)' : 'var(--yt-text-primary)'
                            }}
                        >
                            {tab}
                        </button>
                    );
                })}
            </div>
            
            <div className="watch-video-grid">
                <InfiniteVideoGrid
                    key={currentCategory} // Force unmount/remount on tab change
                    initialVideos={videos}
                    currentCategory={currentCategory}
                    regionLabel={regionLabel}
                    contextVideoId={videoId}
                />
            </div>
        </div>
    );
}

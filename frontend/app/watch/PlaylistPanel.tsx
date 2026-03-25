'use client';

import Link from 'next/link';
import Image from 'next/image';
import { VideoData } from '../constants';
import { useEffect, useRef } from 'react';

const DEFAULT_THUMBNAIL = 'https://i.ytimg.com/vi/default/hqdefault.jpg';

interface PlaylistPanelProps {
    videos: VideoData[];
    currentVideoId: string;
    listId: string;
    title: string;
}

function handleImageError(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.target as HTMLImageElement;
    if (img.src !== DEFAULT_THUMBNAIL) {
        img.src = DEFAULT_THUMBNAIL;
    }
}

export default function PlaylistPanel({ videos, currentVideoId, listId, title }: PlaylistPanelProps) {
    const currentIndex = videos.findIndex(v => v.id === currentVideoId);
    const activeItemRef = useRef<HTMLAnchorElement>(null);

    useEffect(() => {
        if (activeItemRef.current) {
            activeItemRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [currentVideoId]);

    return (
        <div style={{
            backgroundColor: 'var(--yt-hover)', 
            borderRadius: '12px', 
            overflow: 'hidden',
            display: 'flex', 
            flexDirection: 'column', 
            height: '100%',
            maxHeight: '500px',
            marginBottom: '24px',
            border: '1px solid var(--yt-border)'
        }}>
            <div style={{
                padding: '16px', 
                borderBottom: '1px solid var(--yt-border)',
                backgroundColor: 'rgba(0,0,0,0.2)'
            }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--yt-text-primary)' }}>
                    {title}
                </h3>
                <div style={{ fontSize: '12px', color: 'var(--yt-text-secondary)', marginTop: '4px' }}>
                    {currentIndex + 1} / {videos.length} videos
                </div>
            </div>

            <div style={{
                overflowY: 'auto', 
                flex: 1, 
                padding: '8px 0'
            }}>
                {videos.map((video, index) => {
                    const isActive = video.id === currentVideoId;
                    const thumbnailSrc = video.thumbnail || DEFAULT_THUMBNAIL;
                    
                    return (
                        <Link 
                            key={video.id} 
                            href={`/watch?v=${video.id}&list=${listId}`}
                            ref={isActive ? activeItemRef : null}
                            style={{
                                display: 'flex',
                                gap: '12px',
                                padding: '8px 16px',
                                textDecoration: 'none',
                                backgroundColor: isActive ? 'var(--yt-active)' : 'transparent',
                                alignItems: 'center',
                                transition: 'background-color 0.2s'
                            }}
                            className="playlist-item-hover"
                        >
                            <div style={{
                                width: '24px',
                                fontSize: '12px',
                                color: 'var(--yt-text-secondary)',
                                textAlign: 'center',
                                flexShrink: 0
                            }}>
                                {isActive ? '▶' : index + 1}
                            </div>

                            <div style={{
                                position: 'relative',
                                width: '100px',
                                aspectRatio: '16/9',
                                flexShrink: 0,
                                borderRadius: '8px',
                                overflow: 'hidden'
                            }}>
                                <Image
                                    src={thumbnailSrc}
                                    alt={video.title}
                                    fill
                                    sizes="100px"
                                    style={{ objectFit: 'cover' }}
                                    onError={handleImageError}
                                />
                                {video.duration && (
                                    <div style={{
                                        position: 'absolute',
                                        bottom: '4px',
                                        right: '4px',
                                        backgroundColor: 'rgba(0,0,0,0.8)',
                                        color: '#fff',
                                        padding: '2px 4px',
                                        fontSize: '10px',
                                        borderRadius: '4px',
                                        fontWeight: 500
                                    }}>
                                        {video.duration}
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, justifyContent: 'center' }}>
                                <h4 style={{
                                    margin: 0,
                                    fontSize: '14px',
                                    fontWeight: isActive ? 600 : 400,
                                    color: 'var(--yt-text-primary)',
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden'
                                }}>
                                    {video.title}
                                </h4>
                                <div style={{ fontSize: '12px', color: 'var(--yt-text-secondary)', marginTop: '4px' }}>
                                    {video.uploader}
                                </div>
                            </div>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}

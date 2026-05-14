'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import LoadingSpinner from '../components/LoadingSpinner';

declare global {
    interface Window {
        YT: any;
        onYouTubeIframeAPIReady: () => void;
    }
}

interface YouTubePlayerProps {
    videoId: string;
    title?: string;
    autoplay?: boolean;
    onVideoEnd?: () => void;
    onVideoReady?: () => void;
    loop?: boolean;
}

function PlayerSkeleton() {
    return (
        <div style={{
            width: '100%',
            aspectRatio: '16/9',
            backgroundColor: '#000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '12px',
        }}>
            <LoadingSpinner color="white" size="large" />
        </div>
    );
}

export default function YouTubePlayer({ 
    videoId, 
    title, 
    autoplay = true,
    onVideoEnd,
    onVideoReady,
    loop = false 
}: YouTubePlayerProps) {
    const playerRef = useRef<HTMLDivElement>(null);
    const playerContainerRef = useRef<HTMLDivElement>(null);
    const playerInstanceRef = useRef<any>(null);
    const loopRef = useRef(loop);
    const [isApiReady, setIsApiReady] = useState(false);
    const [isPlayerReady, setIsPlayerReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const router = useRouter();

    // Keep loop ref in sync
    loopRef.current = loop;

    // Fullscreen change listener
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    // Load YouTube IFrame API
    useEffect(() => {
        if (window.YT && window.YT.Player) {
            setIsApiReady(true);
            return;
        }

        // Check if script already exists
        const existingScript = document.querySelector('script[src*="youtube.com/iframe_api"]');
        if (existingScript) {
            // Script exists, wait for it to load
            const checkYT = setInterval(() => {
                if (window.YT && window.YT.Player) {
                    setIsApiReady(true);
                    clearInterval(checkYT);
                }
            }, 100);
            return () => clearInterval(checkYT);
        }

        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        tag.async = true;
        document.head.appendChild(tag);

        window.onYouTubeIframeAPIReady = () => {
            console.log('YouTube IFrame API ready');
            setIsApiReady(true);
        };

        return () => {
            // Clean up
            window.onYouTubeIframeAPIReady = () => {};
        };
    }, []);

    // Initialize player when API is ready
    useEffect(() => {
        if (!isApiReady || !playerRef.current || !videoId) return;

        // Destroy previous player instance if exists
        if (playerInstanceRef.current) {
            try {
                playerInstanceRef.current.destroy();
            } catch (e) {
                console.log('Error destroying player:', e);
            }
            playerInstanceRef.current = null;
        }

        try {
            const player = new window.YT.Player(playerRef.current, {
                videoId: videoId,
                playerVars: {
                    autoplay: autoplay ? 1 : 0,
                    controls: 1,
                    rel: 0,
                    modestbranding: 0,
                    playsinline: 1,
                    enablejsapi: 1,
                    origin: window.location.origin,
                    widget_referrer: window.location.href,
                    iv_load_policy: 3,
                    fs: 0,
                    disablekb: 0,
                    color: 'white',
                },
                events: {
                    onReady: (event: any) => {
                        console.log('YouTube Player ready for video:', videoId);
                        setIsPlayerReady(true);
                        if (onVideoReady) onVideoReady();
                        
                        // Auto-play if enabled
                        if (autoplay) {
                            try {
                                event.target.playVideo();
                            } catch (e) {
                                console.log('Autoplay prevented:', e);
                            }
                        }
                    },
                    onStateChange: (event: any) => {
                        // Video ended
                        if (event.data === window.YT.PlayerState.ENDED) {
                            if (loopRef.current) {
                                // Loop mode: restart video
                                event.target.seekTo(0);
                                event.target.playVideo();
                            } else if (onVideoEnd) {
                                onVideoEnd();
                            }
                        }
                    },
                    onError: (event: any) => {
                        console.error('YouTube Player Error:', event.data);
                        setError(`Failed to load video (Error ${event.data})`);
                    },
                },
            });

            playerInstanceRef.current = player;
        } catch (error) {
            console.error('Failed to create YouTube player:', error);
            setError('Failed to initialize video player');
        }

        return () => {
            if (playerInstanceRef.current) {
                try {
                    playerInstanceRef.current.destroy();
                } catch (e) {
                    console.log('Error cleaning up player:', e);
                }
                playerInstanceRef.current = null;
            }
        };
    }, [isApiReady, videoId, autoplay]);

    // Handle video end
    useEffect(() => {
        if (!isPlayerReady || !onVideoEnd) return;

        const handleVideoEnd = () => {
            onVideoEnd();
        };

        // The onStateChange event handler already handles this
    }, [isPlayerReady, onVideoEnd]);

    if (error) {
        return (
            <div style={{
                width: '100%',
                aspectRatio: '16/9',
                backgroundColor: '#000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '12px',
                color: '#fff',
                flexDirection: 'column',
                gap: '16px',
            }}>
                <div>{error}</div>
                <button 
                    onClick={() => window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank')}
                    style={{
                        padding: '8px 16px',
                        backgroundColor: '#ff0000',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                    }}
                >
                    Watch on YouTube
                </button>
            </div>
        );
    }

    return (
        <div 
            ref={playerContainerRef}
            style={{ 
                position: 'relative', 
                width: '100%', 
                aspectRatio: '16/9', 
                backgroundColor: '#000', 
                borderRadius: isFullscreen ? '0' : '12px', 
                overflow: 'hidden' 
            }}
        >
            {!isPlayerReady && !error && <PlayerSkeleton />}
            <div 
                ref={playerRef} 
                id={`youtube-player-${videoId}`}
                style={{
                    width: '100%',
                    height: '100%',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                }}
            />
            {/* Controls */}
            <div style={{
                position: 'absolute',
                bottom: '80px',
                right: '8px',
                display: 'flex',
                gap: '8px',
                zIndex: 10,
            }}>
                {/* Fullscreen button */}
                <button
                    onClick={() => {
                        if (document.fullscreenElement) {
                            document.exitFullscreen();
                        } else {
                            playerContainerRef.current?.requestFullscreen();
                        }
                    }}
                    style={{
                        backgroundColor: 'rgba(0,0,0,0.6)',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'background-color 0.2s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.8)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.6)'}
                    title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                >
                    {isFullscreen ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                            <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
                        </svg>
                    ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                            <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                        </svg>
                    )}
                </button>
            </div>
        </div>
    );
}

// Utility function to play a video
export function playVideo(videoId: string) {
    if (window.YT && window.YT.Player) {
        // Could create a new player instance or use existing one
        console.log('Playing video:', videoId);
    }
}

// Utility function to pause video
export function pauseVideo() {
    // Would need to reference player instance
}
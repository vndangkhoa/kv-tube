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
    onVideoReady 
}: YouTubePlayerProps) {
    const playerRef = useRef<HTMLDivElement>(null);
    const playerInstanceRef = useRef<any>(null);
    const [isApiReady, setIsApiReady] = useState(false);
    const [isPlayerReady, setIsPlayerReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

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
                            if (onVideoEnd) {
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
        <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', backgroundColor: '#000', borderRadius: '12px', overflow: 'hidden' }}>
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
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

// On touchscreens the YouTube embed's native controls are disabled
// (controls: 0) and a minimal custom overlay is used instead — same
// immersive "tap to show" behavior as the self-hosted player.
function isTouchDevice(): boolean {
    if (typeof window === 'undefined') return false;
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) ||
        window.matchMedia?.('(pointer: coarse)').matches === true;
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
    // YT.Player REPLACES the node it is given with an <iframe>. To avoid React's
    // "removeChild" crash (React still owns the replaced node), we hand YT a div
    // we create imperatively and that React never reconciles directly.
    const targetRef = useRef<HTMLDivElement | null>(null);
    const loopRef = useRef(loop);
    const [isApiReady, setIsApiReady] = useState(false);
    const [isPlayerReady, setIsPlayerReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isLandscape, setIsLandscape] = useState(false);
    // Touch-only overlay state: center play/pause + fullscreen, auto-hidden
    // while playing (tap to bring back). Desktop keeps YouTube's controls.
    const [isPlaying, setIsPlaying] = useState(false);
    const [showOverlay, setShowOverlay] = useState(() => !isTouchDevice());
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const router = useRouter();

    // Keep loop ref in sync
    loopRef.current = loop;

    // Fullscreen change listener
    useEffect(() => {
        const handleFullscreenChange = () => {
            const isFull = !!document.fullscreenElement;
            setIsFullscreen(isFull);
            const orientation = typeof screen !== 'undefined' ? (screen.orientation as any) : null;
            if (isFull) {
                if (orientation && typeof orientation.lock === 'function') {
                    orientation.lock('landscape').catch(() => {});
                }
            } else {
                if (orientation && typeof orientation.unlock === 'function') {
                    try { orientation.unlock(); } catch (_) {}
                }
            }
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    // Announce this player is active so OrientationGuard allows landscape
    // fullscreen (same signal SelfHostedPlayer emits). Without it the portrait
    // overlay would block the iframe on rotated phones.
    useEffect(() => {
        const el = document.documentElement;
        el.dataset.kvPlayerActive = 'true';
        document.dispatchEvent(new CustomEvent('kv-player-active', { detail: true }));
        return () => {
            delete el.dataset.kvPlayerActive;
            document.dispatchEvent(new CustomEvent('kv-player-active', { detail: false }));
        };
    }, []);

    // Track mobile landscape so the iframe fills the screen on rotate.
    useEffect(() => {
        const mq = window.matchMedia('(orientation: landscape)');
        const mobileMq = window.matchMedia('(max-width: 820px), (pointer: coarse)');
        const update = () => setIsLandscape(mq.matches && mobileMq.matches);
        update();
        mq.addEventListener('change', update);
        mobileMq.addEventListener('change', update);
        return () => {
            mq.removeEventListener('change', update);
            mobileMq.removeEventListener('change', update);
        };
    }, []);

    // Touch overlay follows play state: while playing, auto-hide after 2.5s;
    // whenever paused (incl. blocked autoplay), keep the play button visible.
    useEffect(() => {
        if (!isTouchDevice()) return;
        if (isPlaying) {
            if (hideTimer.current) clearTimeout(hideTimer.current);
            hideTimer.current = setTimeout(() => setShowOverlay(false), 2500);
        } else {
            setShowOverlay(true);
        }
    }, [isPlaying]);

    // Tap on the video (touch only): play/pause + brief overlay reveal.
    const handleTap = () => {
        const player = playerInstanceRef.current;
        if (!player) return;
        if (isPlaying) {
            try { player.pauseVideo(); } catch (_) {}
            setShowOverlay(true); // paused → controls stay visible
        } else {
            try { player.playVideo(); } catch (_) {}
            setShowOverlay(true);
            if (hideTimer.current) clearTimeout(hideTimer.current);
            hideTimer.current = setTimeout(() => setShowOverlay(false), 2500);
        }
    };

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
            setIsApiReady(true);
        };

        return () => {
            // Clean up
            window.onYouTubeIframeAPIReady = () => {};
        };
    }, []);

    // Initialize player when API is ready
    useEffect(() => {
        if (!isApiReady || !playerRef.current) return;
        // Only attempt with a syntactically valid YouTube video id. Otherwise
        // YT.Player throws "Invalid video id" and can crash React's tree.
        if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
            setError('Invalid video ID');
            return;
        }

        // Destroy previous player instance if exists
        if (playerInstanceRef.current) {
            try {
                playerInstanceRef.current.destroy();
            } catch (e) {
                console.log('Error destroying player:', e);
            }
            playerInstanceRef.current = null;
        }
        // Remove any previously created target div so we don't stack iframes.
        if (targetRef.current && targetRef.current.parentNode) {
            targetRef.current.parentNode.removeChild(targetRef.current);
            targetRef.current = null;
        }

        // Create a fresh div for YT to replace with its iframe. React only ever
        // manages playerRef (the outer node), which YT never touches.
        const target = document.createElement('div');
        target.style.width = '100%';
        target.style.height = '100%';
        playerRef.current.appendChild(target);
        targetRef.current = target;

        try {
            const player = new window.YT.Player(target, {
                videoId: videoId,
                playerVars: {
                    autoplay: autoplay ? 1 : 0,
                    // Touchscreens: hide YouTube's native controls entirely
                    // (custom tap-to-show overlay renders on top instead).
                    // Desktop keeps them.
                    controls: isTouchDevice() ? 0 : 1,
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
                        setIsPlaying(event.data === window.YT.PlayerState.PLAYING);
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
            if (targetRef.current && targetRef.current.parentNode) {
                targetRef.current.parentNode.removeChild(targetRef.current);
                targetRef.current = null;
            }
        };
    }, [isApiReady, videoId, autoplay]);

    // Cleanup any leftover iframe target on unmount.
    useEffect(() => {
        return () => {
            if (hideTimer.current) clearTimeout(hideTimer.current);
            if (playerInstanceRef.current) {
                try {
                    playerInstanceRef.current.destroy();
                } catch (e) {
                    console.log('Error cleaning up player:', e);
                }
                playerInstanceRef.current = null;
            }
            if (targetRef.current && targetRef.current.parentNode) {
                targetRef.current.parentNode.removeChild(targetRef.current);
                targetRef.current = null;
            }
        };
    }, []);

    // Handle video end
    useEffect(() => {
        if (!isPlayerReady || !onVideoEnd) return;

        const handleVideoEnd = () => {
            onVideoEnd();
        };

        // The onStateChange event handler already handles this
    }, [isPlayerReady, onVideoEnd]);

    const containerStyle: React.CSSProperties = isLandscape
        ? {
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              backgroundColor: '#000',
              borderRadius: 0,
              overflow: 'hidden',
              zIndex: 9000,
          }
        : {
              position: 'relative',
              width: '100%',
              aspectRatio: '16/9',
              backgroundColor: '#000',
              borderRadius: isFullscreen ? '0' : '12px',
              overflow: 'hidden',
          };

    if (error) {
        return (
            <div style={{
                ...containerStyle,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
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
            style={containerStyle}
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
            {/* Touchscreen tap layer + minimal overlay (YouTube's native
                controls are disabled with controls: 0). */}
            {isTouchDevice() && (
                <div
                    onClick={handleTap}
                    style={{
                        position: 'absolute',
                        inset: 0,
                        zIndex: 8,
                        cursor: 'pointer',
                    }}
                >
                    {showOverlay && isPlayerReady && (
                        <div style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            width: '64px',
                            height: '64px',
                            borderRadius: '50%',
                            background: 'rgba(0, 0, 0, 0.6)',
                            backdropFilter: 'blur(12px)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            zIndex: 9,
                            transition: 'opacity 0.2s ease',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                            border: '1px solid rgba(255,255,255,0.15)',
                        }}>
                            {isPlaying ? (
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="#FFFFFF">
                                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                                </svg>
                            ) : (
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="#FFFFFF" style={{ marginLeft: '4px' }}>
                                    <path d="M8 5v14l11-7z"/>
                                </svg>
                            )}
                        </div>
                    )}
                </div>
            )}
            {/* Controls */}
            <div style={{
                position: 'absolute',
                bottom: '80px',
                right: '8px',
                display: 'flex',
                gap: '8px',
                zIndex: 10,
                // Touchscreens: only while the overlay is shown (tap to
                // reveal); desktop keeps it always visible.
                opacity: isTouchDevice() ? (showOverlay ? 1 : 0) : 1,
                pointerEvents: isTouchDevice() ? (showOverlay ? 'auto' : 'none') : 'auto',
                transition: 'opacity 0.25s ease-in-out',
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
    }
}

// Utility function to pause video
export function pauseVideo() {
    // Would need to reference player instance
}
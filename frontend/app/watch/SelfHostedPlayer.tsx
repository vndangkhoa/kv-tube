'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import YouTubePlayer from './YouTubePlayer';
import LoadingSpinner from '../components/LoadingSpinner';

interface SelfHostedPlayerProps {
    videoId: string;
    title?: string;
    uploader?: string;
    thumbnail?: string;
    autoplay?: boolean;
    loop?: boolean;
    onVideoEnd?: () => void;
    onVideoReady?: () => void;
    onNext?: () => void;
    onPrev?: () => void;
}

function loadHlsScript(): Promise<void> {
    return new Promise((resolve) => {
        if (typeof window !== 'undefined' && window.Hls) return resolve();
        if (document.querySelector('script[src*="hls.js"]')) {
            const check = setInterval(() => {
                if (window.Hls) {
                    clearInterval(check);
                    resolve();
                }
            }, 100);
            return;
        }
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => resolve();
        document.head.appendChild(s);
    });
}

function absoluteUrl(url?: string): string | undefined {
    if (!url) return undefined;
    try {
        return new URL(url, window.location.origin).href;
    } catch {
        return url;
    }
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

export default function SelfHostedPlayer({
    videoId,
    title,
    uploader,
    thumbnail,
    autoplay = true,
    loop = false,
    onVideoEnd,
    onVideoReady,
    onNext,
    onPrev,
}: SelfHostedPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const hlsRef = useRef<HlsInstance | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [useFallback, setUseFallback] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [pipActive, setPipActive] = useState(false);

    // Keep latest callbacks without re-running the MediaSession effect.
    const cbRef = useRef({ onVideoEnd, onVideoReady, onNext, onPrev, loop });
    cbRef.current = { onVideoEnd, onVideoReady, onNext, onPrev, loop };

    // Fullscreen change listener
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    // Load stream and attach media
    useEffect(() => {
        let cancelled = false;
        setIsReady(false);
        setError(null);
        setUseFallback(false);

        (async () => {
            try {
                const res = await fetch(`/api/get_stream_info?v=${videoId}`);
                const data = await res.json();
                if (cancelled) return;
                if (data.error || !data.stream_url) {
                    throw new Error(data.error || 'No stream');
                }

                const videoEl = videoRef.current;
                if (!videoEl) return;

                await loadHlsScript();
                if (cancelled) return;

                const streamUrl = `/api/proxy?url=${encodeURIComponent(data.stream_url)}`;
                const isHLS = data.stream_url.includes('.m3u8') || data.stream_url.includes('manifest');

                if (hlsRef.current) {
                    hlsRef.current.destroy();
                    hlsRef.current = null;
                }

                if (isHLS && window.Hls && window.Hls.isSupported()) {
                    const hls = new window.Hls();
                    hlsRef.current = hls;
                    hls.loadSource(streamUrl);
                    hls.attachMedia(videoEl);
                    hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
                        if (autoplay) videoEl.play().catch(() => {});
                    });
                    hls.on(window.Hls.Events.ERROR, () => {
                        if (!cancelled) {
                            setError('Stream error');
                            setUseFallback(true);
                        }
                    });
                } else {
                    videoEl.src = streamUrl;
                    videoEl.addEventListener('loadedmetadata', () => {
                        if (autoplay) videoEl.play().catch(() => {});
                    }, { once: true });
                    videoEl.addEventListener('error', () => {
                        if (!cancelled) {
                            setError('Stream error');
                            setUseFallback(true);
                        }
                    }, { once: true });
                }
            } catch {
                if (!cancelled) {
                    setError('Failed to load self-hosted stream');
                    setUseFallback(true);
                }
            }
        })();

        return () => {
            cancelled = true;
            if (hlsRef.current) {
                hlsRef.current.destroy();
                hlsRef.current = null;
            }
        };
    }, [videoId, autoplay]);

    // Playback event wiring: MediaSession state, position, ended
    useEffect(() => {
        const videoEl = videoRef.current;
        if (!videoEl) return;

        const onPlay = () => {
            if ('mediaSession' in navigator) {
                try { navigator.mediaSession.playbackState = 'playing'; } catch {}
            }
        };
        const onPause = () => {
            if ('mediaSession' in navigator) {
                try { navigator.mediaSession.playbackState = 'paused'; } catch {}
            }
        };
        const onTime = () => {
            if (!('mediaSession' in navigator) || !videoEl.duration) return;
            try {
                navigator.mediaSession.setPositionState({
                    duration: videoEl.duration || 0,
                    position: videoEl.currentTime || 0,
                    playbackRate: videoEl.playbackRate || 1,
                });
            } catch {}
        };
        const onEnded = () => {
            if (!cbRef.current.loop) cbRef.current.onVideoEnd?.();
        };
        const onCanPlay = () => {
            setIsReady(true);
            cbRef.current.onVideoReady?.();
        };

        videoEl.addEventListener('play', onPlay);
        videoEl.addEventListener('pause', onPause);
        videoEl.addEventListener('timeupdate', onTime);
        videoEl.addEventListener('ended', onEnded);
        videoEl.addEventListener('canplay', onCanPlay);

        return () => {
            videoEl.removeEventListener('play', onPlay);
            videoEl.removeEventListener('pause', onPause);
            videoEl.removeEventListener('timeupdate', onTime);
            videoEl.removeEventListener('ended', onEnded);
            videoEl.removeEventListener('canplay', onCanPlay);
        };
    }, []);

    // MediaSession metadata + action handlers (Android background / lock-screen)
    useEffect(() => {
        if (!isReady || typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
        const ms = navigator.mediaSession;
        const art = absoluteUrl(thumbnail);

        try {
            ms.metadata = new MediaMetadata({
                title: title || 'Unknown title',
                artist: uploader || 'KV-Tube',
                album: 'KV-Tube',
                artwork: art ? [{ src: art, sizes: '512x512', type: 'image/png' }] : [],
            });
        } catch {}

        const videoEl = videoRef.current;
        const handlers: Partial<Record<MediaSessionAction, MediaSessionActionHandler>> = {
            play: () => { videoEl?.play().catch(() => {}); },
            pause: () => { videoEl?.pause(); },
            seekbackward: (d) => { if (videoEl) videoEl.currentTime = Math.max(0, videoEl.currentTime - (d?.seekOffset || 10)); },
            seekforward: (d) => { if (videoEl) videoEl.currentTime += (d?.seekOffset || 10); },
            seekto: (d) => { if (videoEl && d?.seekTime != null) videoEl.currentTime = d.seekTime; },
            previoustrack: () => { cbRef.current.onPrev?.(); },
            nexttrack: () => { cbRef.current.onNext?.(); },
            stop: () => { videoEl?.pause(); },
        };

        for (const [action, handler] of Object.entries(handlers)) {
            try { ms.setActionHandler(action as MediaSessionAction, (handler ?? null) as MediaSessionActionHandler | null); } catch {}
        }

        return () => {
            for (const action of Object.keys(handlers)) {
                try { ms.setActionHandler(action as MediaSessionAction, null); } catch {}
            }
        };
    }, [isReady, title, uploader, thumbnail]);

    // Picture-in-Picture (iOS background audio). Must be user-initiated.
    const togglePip = useCallback(async () => {
        const videoEl = videoRef.current;
        if (!videoEl) return;
        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
            } else if (videoEl.requestPictureInPicture) {
                await videoEl.requestPictureInPicture();
            } else if (videoEl.webkitSetPresentationMode) {
                videoEl.webkitSetPresentationMode('picture-in-picture');
            }
        } catch {}
    }, []);

    useEffect(() => {
        const videoEl = videoRef.current;
        if (!videoEl) return;
        const onEnter = () => setPipActive(true);
        const onLeave = () => setPipActive(false);
        const onWebkit = () => {
            const mode = videoEl.webkitPresentationMode;
            setPipActive(mode === 'picture-in-picture');
        };
        videoEl.addEventListener('enterpictureinpicture', onEnter);
        videoEl.addEventListener('leavepictureinpicture', onLeave);
        videoEl.addEventListener('webkitpresentationmodechanged', onWebkit);
        return () => {
            videoEl.removeEventListener('enterpictureinpicture', onEnter);
            videoEl.removeEventListener('leavepictureinpicture', onLeave);
            videoEl.removeEventListener('webkitpresentationmodechanged', onWebkit);
        };
    }, [isReady]);

    // YouTube iframe fallback when the self-hosted stream fails
    if (useFallback) {
        return (
            <YouTubePlayer
                videoId={videoId}
                title={title}
                autoplay={autoplay}
                onVideoEnd={onVideoEnd}
                onVideoReady={onVideoReady}
                loop={loop}
            />
        );
    }

    return (
        <div
            ref={containerRef}
            style={{
                position: 'relative',
                width: '100%',
                aspectRatio: '16/9',
                backgroundColor: '#000',
                borderRadius: isFullscreen ? '0' : '12px',
                overflow: 'hidden',
            }}
        >
            {!isReady && !error && <PlayerSkeleton />}
            <video
                ref={videoRef}
                id={`self-hosted-player-${videoId}`}
                style={{
                    width: '100%',
                    height: '100%',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    backgroundColor: '#000',
                }}
                controls
                playsInline
                loop={loop}
                webkit-playsinline="true"
                disablePictureInPicture={false}
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
                {/* Picture-in-Picture (iOS background audio) */}
                <button
                    onClick={togglePip}
                    title={pipActive ? 'Exit picture-in-picture' : 'Picture-in-picture (background audio)'}
                    style={{
                        backgroundColor: pipActive ? 'rgba(255,0,0,0.8)' : 'rgba(0,0,0,0.6)',
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
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = pipActive ? 'rgba(255,0,0,0.8)' : 'rgba(0,0,0,0.6)'}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                        <path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16.01H3V4.98h18v14.03z"/>
                    </svg>
                </button>
                {/* Fullscreen button */}
                <button
                    onClick={() => {
                        if (document.fullscreenElement) {
                            document.exitFullscreen();
                        } else {
                            containerRef.current?.requestFullscreen();
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

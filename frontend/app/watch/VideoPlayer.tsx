'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

declare global {
    interface Window {
        Hls: any;
    }
}

interface VideoPlayerProps {
    videoId: string;
    title?: string;
}

interface QualityOption {
    label: string;
    height: number;
    url: string;
    audio_url?: string;
    is_hls: boolean;
    has_audio?: boolean;
}

interface StreamInfo {
    stream_url: string;
    audio_url?: string;
    qualities?: QualityOption[];
    best_quality?: number;
    error?: string;
}

function PlayerSkeleton() {
    return (
        <div style={skeletonContainerStyle}>
            <div style={skeletonCenterStyle}>
                <div style={skeletonSpinnerStyle} />
            </div>
        </div>
    );
}

export default function VideoPlayer({ videoId, title }: VideoPlayerProps) {
    const router = useRouter();
    const videoRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const hlsRef = useRef<any>(null);
    const audioHlsRef = useRef<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [useFallback, setUseFallback] = useState(false);
    const [showControls, setShowControls] = useState(false);
    const [qualities, setQualities] = useState<QualityOption[]>([]);
    const [currentQuality, setCurrentQuality] = useState<number>(0);
    const [showQualityMenu, setShowQualityMenu] = useState(false);
    const [hasSeparateAudio, setHasSeparateAudio] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isBuffering, setIsBuffering] = useState(false);
    const [nextVideoId, setNextVideoId] = useState<string | undefined>();
    const [nextListId, setNextListId] = useState<string | undefined>();
    const [showBackgroundHint, setShowBackgroundHint] = useState(false);
    const [wakeLock, setWakeLock] = useState<any>(null);
    const [isPiPActive, setIsPiPActive] = useState(false);
    const [autoPiPEnabled, setAutoPiPEnabled] = useState(true);
    const [showPiPNotification, setShowPiPNotification] = useState(false);
    const audioUrlRef = useRef<string>('');

    useEffect(() => {
        const handleSetNextVideo = (e: CustomEvent) => {
            if (e.detail && e.detail.videoId) {
                setNextVideoId(e.detail.videoId);
                if (e.detail.listId !== undefined) {
                    setNextListId(e.detail.listId);
                } else {
                    setNextListId(undefined);
                }
            }
        };
        window.addEventListener('setNextVideoId', handleSetNextVideo as EventListener);
        return () => window.removeEventListener('setNextVideoId', handleSetNextVideo as EventListener);
    }, []);

    useEffect(() => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
        script.async = true;
        if (!document.querySelector('script[src*="hls.js"]')) {
            document.head.appendChild(script);
        }
    }, []);

    const syncAudio = () => {
        const video = videoRef.current;
        const audio = audioRef.current;
        if (!video || !audio || !hasSeparateAudio) return;

        const isHidden = document.visibilityState === 'hidden';

        if (Math.abs(video.currentTime - audio.currentTime) > 0.4) {
            if (isHidden) {
                // When hidden, video might be suspended by the browser. 
                // Don't pull audio back to the frozen video. Let audio play.
                // However, if audio is somehow pausing/lagging, we don't force it here.
            } else {
                // When visible, normally video is the master timeline.
                // BUT, if we just came back from background, audio might be way ahead.
                // Instead of always rewinding audio, if video is lagging behind audio (like recovering from sleep),
                // we should jump the video forward to catch up to the audio!
                if (audio.currentTime > video.currentTime + 1) {
                    // Video is lagging, jump it forward
                    video.currentTime = audio.currentTime;
                } else {
                    // Audio is lagging or drifting slightly, snap audio to video
                    audio.currentTime = video.currentTime;
                }
            }
        }

        if (video.paused && !audio.paused) {
            if (!isHidden) {
                audio.pause();
            }
        } else if (!video.paused && audio.paused) {
            // Only force audio to play if it got stuck
            audio.play().catch(() => { });
        }
    };

    const handleVisibilityChange = async () => {
        const video = videoRef.current;
        const audio = audioRef.current;
        if (!video) return;

        if (document.visibilityState === 'hidden') {
            // Page is hidden - automatically enter Picture-in-Picture if enabled
            if (!video.paused && autoPiPEnabled) {
                try {
                    if (document.pictureInPictureEnabled && !document.pictureInPictureElement) {
                        await video.requestPictureInPicture();
                        setIsPiPActive(true);
                        setShowPiPNotification(true);
                        setTimeout(() => setShowPiPNotification(false), 3000);
                    }
                } catch (error) {
                    console.log('Auto PiP failed, using audio fallback:', error);
                }
            }
            // Release wake lock when page is hidden (PiP handles its own wake lock)
            releaseWakeLock();
        } else {
            // Page is visible again
            if (autoPiPEnabled) {
                try {
                    if (document.pictureInPictureElement) {
                        await document.exitPictureInPicture();
                        setIsPiPActive(false);
                    }
                } catch (error) {
                    console.log('Exit PiP failed:', error);
                }
            }
            
            // Re-acquire wake lock when page is visible
            if (!video.paused) requestWakeLock();

            // Recover video position from audio if audio continued playing in background
            if (hasSeparateAudio && audio && !audio.paused) {
                if (audio.currentTime > video.currentTime + 1) {
                    video.currentTime = audio.currentTime;
                }
                if (video.paused) {
                    video.play().catch(() => { });
                }
            }
        }
    };

    // Wake Lock API to prevent screen from sleeping during playback
    const requestWakeLock = async () => {
        try {
            if ('wakeLock' in navigator) {
                const wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
                setWakeLock(wakeLockSentinel);
                
                wakeLockSentinel.addEventListener('release', () => {
                    setWakeLock(null);
                });
            }
        } catch (err) {
            console.log('Wake Lock not supported or failed:', err);
        }
    };

    const releaseWakeLock = async () => {
        if (wakeLock) {
            try {
                await wakeLock.release();
                setWakeLock(null);
            } catch (err) {
                console.log('Failed to release wake lock:', err);
            }
        }
    };

    // Picture-in-Picture support
    const togglePiP = async () => {
        const video = videoRef.current;
        if (!video) return;

        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
                setIsPiPActive(false);
            } else if (document.pictureInPictureEnabled) {
                await video.requestPictureInPicture();
                setIsPiPActive(true);
            }
        } catch (error) {
            console.log('Picture-in-Picture not supported or failed:', error);
        }
    };

    // Listen for PiP events
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handleEnterPiP = () => setIsPiPActive(true);
        const handleLeavePiP = () => setIsPiPActive(false);

        video.addEventListener('enterpictureinpicture', handleEnterPiP);
        video.addEventListener('leavepictureinpicture', handleLeavePiP);

        return () => {
            video.removeEventListener('enterpictureinpicture', handleEnterPiP);
            video.removeEventListener('leavepictureinpicture', handleLeavePiP);
        };
    }, []);

    useEffect(() => {
        if (useFallback) return;

        // Reset states when videoId changes
        setIsLoading(true);
        setIsBuffering(false);
        setError(null);
        setQualities([]);
        setShowQualityMenu(false);

        const loadStream = async () => {
            try {
                const res = await fetch(`/api/get_stream_info?v=${videoId}`);
                const data: StreamInfo = await res.json();

                if (data.error || !data.stream_url) {
                    throw new Error(data.error || 'No stream URL');
                }

                if (data.qualities && data.qualities.length > 0) {
                    setQualities(data.qualities);
                    setCurrentQuality(data.best_quality || data.qualities[0].height);
                }

                if (data.audio_url) {
                    audioUrlRef.current = data.audio_url;
                }

                playStream(data.stream_url, data.audio_url);

            } catch (err) {
                console.error('Stream load error:', err);
                // Only show error after multiple retries, not immediately
                setError('Failed to load stream');
                setUseFallback(true);
            }
        };

        const tryLoad = (retries = 0) => {
            if (window.Hls) {
                loadStream();
            } else if (retries < 50) { // Wait up to 5 seconds for HLS to load
                setTimeout(() => tryLoad(retries + 1), 100);
            } else {
                // Fallback to native video player if HLS fails to load
                loadStream();
            }
        };

        tryLoad();

        // Record history once per videoId
        fetch('/api/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                video_id: videoId,
                title: title,
                thumbnail: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
            }),
        }).catch(err => console.error('Failed to record history', err));

        return () => {
            if (hlsRef.current) {
                hlsRef.current.destroy();
                hlsRef.current = null;
            }
            if (audioHlsRef.current) {
                audioHlsRef.current.destroy();
                audioHlsRef.current = null;
            }
        };
    }, [videoId]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handlers = {
            play: syncAudio,
            pause: syncAudio,
            seeked: syncAudio,
            timeupdate: syncAudio,
        };

        Object.entries(handlers).forEach(([event, handler]) => {
            video.addEventListener(event, handler);
        });

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            Object.entries(handlers).forEach(([event, handler]) => {
                video.removeEventListener(event, handler);
            });
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [hasSeparateAudio]);

    const playStream = (streamUrl: string, audioStreamUrl?: string) => {
        const video = videoRef.current;
        if (!video) return;

        setIsLoading(true);
        const isHLS = streamUrl.includes('.m3u8') || streamUrl.includes('manifest');
        const needsSeparateAudio = audioStreamUrl && audioStreamUrl !== '';
        setHasSeparateAudio(!!needsSeparateAudio);

        const handleCanPlay = () => setIsLoading(false);
        const handlePlaying = () => { setIsLoading(false); setIsBuffering(false); };
        const handleWaiting = () => setIsBuffering(true);
        const handleLoadStart = () => setIsLoading(true);

        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: title || 'KV-Tube Video',
                artist: 'KV-Tube',
                artwork: [
                    { src: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`, sizes: '480x360', type: 'image/jpeg' }
                ]
            });
            navigator.mediaSession.setActionHandler('play', () => {
                video.play().catch(() => { });
                if (needsSeparateAudio && audioRef.current) audioRef.current.play().catch(() => { });
            });
            navigator.mediaSession.setActionHandler('pause', () => {
                video.pause();
                if (needsSeparateAudio && audioRef.current) audioRef.current.pause();
            });
            // Add seek handlers for better background control
            navigator.mediaSession.setActionHandler('seekto', (details) => {
                if (details.seekTime !== undefined) {
                    video.currentTime = details.seekTime;
                    if (needsSeparateAudio && audioRef.current) {
                        audioRef.current.currentTime = details.seekTime;
                    }
                }
            });
        }

        video.addEventListener('canplay', handleCanPlay);
        video.addEventListener('playing', handlePlaying);
        video.addEventListener('waiting', handleWaiting);
        video.addEventListener('loadstart', handleLoadStart);
        
        // Wake lock event listeners
        const handlePlay = () => requestWakeLock();
        const handlePause = () => releaseWakeLock();
        const handleEnded = () => releaseWakeLock();
        
        video.addEventListener('play', handlePlay);
        video.addEventListener('pause', handlePause);
        video.addEventListener('ended', handleEnded);

        if (isHLS && window.Hls && window.Hls.isSupported()) {
            if (hlsRef.current) hlsRef.current.destroy();

            // Enhance buffer to mitigate Safari slow loading and choppiness
            const hls = new window.Hls({
                maxBufferLength: 60,
                maxMaxBufferLength: 120,
                enableWorker: true,
                xhrSetup: (xhr: XMLHttpRequest) => {
                    xhr.setRequestHeader('Referer', 'https://www.youtube.com/');
                },
            });
            hlsRef.current = hls;

            hls.loadSource(streamUrl);
            hls.attachMedia(video);

            hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
                video.play().catch(() => { });
            });

            hls.on(window.Hls.Events.ERROR, (_: any, data: any) => {
                if (data.fatal) {
                    // Try to recover from error first
                    if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
                        hls.recoverMediaError();
                    } else if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
                        // Try to reload the source
                        hls.loadSource(streamUrl);
                    } else {
                        // Only fall back for other fatal errors
                        setIsLoading(false);
                        setUseFallback(true);
                    }
                }
            });
        } else if (isHLS && video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = streamUrl;
            video.onloadedmetadata = () => video.play().catch(() => { });
        } else {
            video.src = streamUrl;
            video.onloadeddata = () => video.play().catch(() => { });
        }

        if (needsSeparateAudio) {
            const audio = audioRef.current;
            if (audio) {
                const audioIsHLS = audioStreamUrl!.includes('.m3u8') || audioStreamUrl!.includes('manifest');

                if (audioIsHLS && window.Hls && window.Hls.isSupported()) {
                    if (audioHlsRef.current) audioHlsRef.current.destroy();

                    const audioHls = new window.Hls({
                        maxBufferLength: 60,
                        maxMaxBufferLength: 120,
                        enableWorker: true,
                        xhrSetup: (xhr: XMLHttpRequest) => {
                            xhr.setRequestHeader('Referer', 'https://www.youtube.com/');
                        },
                    });
                    audioHlsRef.current = audioHls;

                    audioHls.loadSource(audioStreamUrl!);
                    audioHls.attachMedia(audio);
                } else if (audioIsHLS && audio.canPlayType('application/vnd.apple.mpegurl')) {
                    audio.src = audioStreamUrl!;
                } else {
                    audio.src = audioStreamUrl!;
                }
            }
        }

        video.onended = () => {
            setIsLoading(false);
            if (nextVideoId) {
                const url = nextListId ? `/watch?v=${nextVideoId}&list=${nextListId}` : `/watch?v=${nextVideoId}`;
                router.push(url);
            }
        };

        // Handle video being paused by browser (e.g., when tab is hidden)
        const handlePauseForBackground = () => {
            const audio = audioRef.current;
            if (!audio || !hasSeparateAudio) return;
            
            // If the tab is hidden and video was paused, it was likely paused by Chrome saving resources.
            // Keep the audio playing!
            if (document.visibilityState === 'hidden') {
                audio.play().catch(() => { });
            }
        };
        
        video.addEventListener('pause', handlePauseForBackground);
        
        return () => {
            video.removeEventListener('pause', handlePauseForBackground);
            video.removeEventListener('play', handlePlay);
            video.removeEventListener('pause', handlePause);
            video.removeEventListener('ended', handleEnded);
            releaseWakeLock();
        };
    };

    const changeQuality = (quality: QualityOption) => {
        const video = videoRef.current;
        if (!video) return;

        const currentTime = video.currentTime;
        const wasPlaying = !video.paused;

        setShowQualityMenu(false);

        const audioUrl = quality.audio_url || audioUrlRef.current;
        playStream(quality.url, audioUrl);
        setCurrentQuality(quality.height);

        video.currentTime = currentTime;
        if (wasPlaying) video.play().catch(() => { });
    };

    useEffect(() => {
        if (!useFallback) return;

        const handleMessage = (event: MessageEvent) => {
            if (event.origin !== 'https://www.youtube.com') return;
            try {
                const data = JSON.parse(event.data);
                if (data.event === 'onStateChange' && data.info === 0 && nextVideoId) {
                    router.push(`/watch?v=${nextVideoId}`);
                }
            } catch { }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [useFallback, nextVideoId, router]);

    if (!videoId) {
        return <div style={noVideoStyle}>No video ID</div>;
    }

    if (useFallback) {
        return (
            <div style={containerStyle} onMouseEnter={() => setShowControls(true)} onMouseLeave={() => setShowControls(false)}>
                <iframe
                    src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
                    style={iframeStyle}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; background-sync"
                    allowFullScreen
                    title={title || 'Video'}
                />
            </div>
        );
    }

    return (
        <div style={containerStyle} onMouseEnter={() => setShowControls(true)} onMouseLeave={() => { setShowControls(false); setShowQualityMenu(false); }}>
            {/* Show skeleton only during initial load, buffering overlay during playback */}
            {isLoading && <PlayerSkeleton />}
            
            {/* Show buffering overlay only when not in initial load state */}
            {isBuffering && !isLoading && (
                <div style={bufferingOverlayStyle}>
                    <div style={spinnerStyle} />
                </div>
            )}

            <video
                ref={videoRef}
                style={{ ...videoStyle, visibility: isLoading ? 'hidden' : 'visible' }}
                controls
                playsInline
                webkit-playsinline="true"
                x5-playsinline="true"
                x5-video-player-type="h5"
                x5-video-player-fullscreen="true"
                preload="auto"
                poster={`https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`}
            />

            <audio ref={audioRef} style={{ display: 'none' }} />

            {error && (
                <div style={errorContainerStyle}>
                    <div style={errorStyle}>
                        <span style={{ marginBottom: '8px' }}>{error}</span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={() => { setError(null); setUseFallback(false); window.location.reload(); }} style={retryBtnStyle}>
                                Retry
                            </button>
                            <button onClick={() => setUseFallback(true)} style={{ ...retryBtnStyle, background: '#333' }}>
                                Use YouTube Player
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showControls && !error && !isLoading && (
                <>
                    <a href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noopener noreferrer" style={openBtnStyle}>
                        Open on YouTube ↗
                    </a>

                    <div style={controlsRowStyle}>
                        {/* Picture-in-Picture Button */}
                        {document.pictureInPictureEnabled && (
                            <button 
                                onClick={togglePiP} 
                                style={pipBtnStyle}
                                title={isPiPActive ? "Exit Picture-in-Picture" : "Picture-in-Picture"}
                            >
                                {isPiPActive ? '⏹' : '📺'}
                            </button>
                        )}
                        {/* Auto PiP Toggle */}
                        <button 
                            onClick={() => setAutoPiPEnabled(!autoPiPEnabled)} 
                            style={{ ...pipBtnStyle, background: autoPiPEnabled ? 'rgba(255,0,0,0.8)' : 'rgba(0,0,0,0.8)' }}
                            title={autoPiPEnabled ? "Auto PiP: ON (click to disable)" : "Auto PiP: OFF (click to enable)"}
                        >
                            {autoPiPEnabled ? '🔄' : '⏸'}
                        </button>
                    </div>

                    {qualities.length > 0 && (
                        <div style={qualityContainerStyle}>
                            <button onClick={() => setShowQualityMenu(!showQualityMenu)} style={qualityBtnStyle}>
                                {qualities.find(q => q.height === currentQuality)?.label || 'Auto'}
                            </button>

                            {showQualityMenu && (
                                <div style={qualityMenuStyle}>
                                    {qualities.map((q) => (
                                        <button
                                            key={q.height}
                                            onClick={() => changeQuality(q)}
                                            style={{
                                                ...qualityItemStyle,
                                                background: q.height === currentQuality ? 'rgba(255,0,0,0.3)' : 'transparent',
                                            }}
                                        >
                                            {q.label}
                                            {q.height === currentQuality && ' ✓'}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}

            {showBackgroundHint && (
                <div style={backgroundHintStyle}>
                    {hasSeparateAudio ? (
                        <span>🎵 Audio playing in background</span>
                    ) : (
                        <span>⚠️ Background playback may pause on some browsers</span>
                    )}
                    <button 
                        onClick={() => setUseFallback(true)} 
                        style={backgroundHintBtnStyle}
                    >
                        Use YouTube Player for better background playback
                    </button>
                </div>
            )}

            {showPiPNotification && (
                <div style={pipNotificationStyle}>
                    <span>📺 Picture-in-Picture activated</span>
                    <button 
                        onClick={() => setAutoPiPEnabled(!autoPiPEnabled)} 
                        style={pipToggleBtnStyle}
                    >
                        {autoPiPEnabled ? 'Disable Auto PiP' : 'Enable Auto PiP'}
                    </button>
                </div>
            )}
        </div>
    );
}

const noVideoStyle: React.CSSProperties = { width: '100%', background: '#000', borderRadius: '12px', aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' };
const containerStyle: React.CSSProperties = { width: '100%', background: '#000', borderRadius: '12px', overflow: 'hidden', aspectRatio: '16/9', position: 'relative' };
const videoStyle: React.CSSProperties = { width: '100%', height: '100%', background: '#000' };
const iframeStyle: React.CSSProperties = { width: '100%', height: '100%', border: 'none' };
const errorContainerStyle: React.CSSProperties = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)' };
const errorStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '20px', background: 'rgba(30,30,30,0.95)', borderRadius: '12px', color: '#fff', maxWidth: '90%' };
const retryBtnStyle: React.CSSProperties = { padding: '8px 16px', background: '#ff0000', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' };
const openBtnStyle: React.CSSProperties = { position: 'absolute', top: '10px', right: '10px', padding: '6px 12px', background: 'rgba(0,0,0,0.8)', color: '#fff', borderRadius: '4px', textDecoration: 'none', fontSize: '12px', zIndex: 10 };
const qualityContainerStyle: React.CSSProperties = { position: 'absolute', bottom: '50px', right: '10px', zIndex: 10 };
const qualityBtnStyle: React.CSSProperties = { padding: '6px 12px', background: 'rgba(0,0,0,0.8)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 500 };
const qualityMenuStyle: React.CSSProperties = { position: 'absolute', bottom: '100%', right: 0, marginBottom: '4px', background: 'rgba(0,0,0,0.95)', borderRadius: '8px', overflow: 'hidden', minWidth: '100px' };
const qualityItemStyle: React.CSSProperties = { display: 'block', width: '100%', padding: '8px 16px', color: '#fff', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap' };

const skeletonContainerStyle: React.CSSProperties = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', zIndex: 5 };
const skeletonCenterStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center' };
const skeletonSpinnerStyle: React.CSSProperties = { width: '48px', height: '48px', border: '4px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' };
const bufferingOverlayStyle: React.CSSProperties = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)', pointerEvents: 'none', zIndex: 5 };
const spinnerStyle: React.CSSProperties = { width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' };
const backgroundHintStyle: React.CSSProperties = { position: 'absolute', bottom: '80px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.9)', color: '#fff', padding: '12px 16px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center', zIndex: 20, fontSize: '14px' };
const backgroundHintBtnStyle: React.CSSProperties = { padding: '6px 12px', background: '#ff0000', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' };
const controlsRowStyle: React.CSSProperties = { position: 'absolute', bottom: '10px', left: '10px', display: 'flex', gap: '8px', zIndex: 10 };
const pipBtnStyle: React.CSSProperties = { padding: '6px 10px', background: 'rgba(0,0,0,0.8)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' };
const pipNotificationStyle: React.CSSProperties = { position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.9)', color: '#fff', padding: '10px 16px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center', zIndex: 20, fontSize: '13px', animation: 'fadeIn 0.3s ease-out' };
const pipToggleBtnStyle: React.CSSProperties = { padding: '4px 8px', background: '#333', color: '#fff', border: '1px solid #555', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' };

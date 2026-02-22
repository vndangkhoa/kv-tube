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
            <div style={skeletonVideoStyle} className="skeleton" />
            <div style={skeletonControlsStyle}>
                <div style={skeletonProgressStyle} className="skeleton" />
                <div style={skeletonButtonsRowStyle}>
                    <div style={{ ...skeletonButtonStyle, width: '60px' }} className="skeleton" />
                    <div style={{ ...skeletonButtonStyle, width: '40px' }} className="skeleton" />
                    <div style={{ ...skeletonButtonStyle, width: '40px' }} className="skeleton" />
                    <div style={{ ...skeletonButtonStyle, width: '80px' }} className="skeleton" />
                    <div style={{ flex: 1 }} />
                    <div style={{ ...skeletonButtonStyle, width: '100px' }} className="skeleton" />
                    <div style={{ ...skeletonButtonStyle, width: '40px' }} className="skeleton" />
                    <div style={{ ...skeletonButtonStyle, width: '40px' }} className="skeleton" />
                </div>
            </div>
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
    const audioUrlRef = useRef<string>('');

    useEffect(() => {
        const handleSetNextVideo = (e: CustomEvent) => {
            if (e.detail && e.detail.videoId) {
                setNextVideoId(e.detail.videoId);
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

        // Relax the tolerance to 0.4s to prevent choppy audio resetting on Safari
        if (Math.abs(video.currentTime - audio.currentTime) > 0.4) {
            audio.currentTime = video.currentTime;
        }

        if (video.paused && !audio.paused) {
            audio.pause();
        } else if (!video.paused && audio.paused) {
            audio.play().catch(() => { });
        }
    };

    useEffect(() => {
        if (useFallback) return;

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
                setError('Failed to load stream');
                setUseFallback(true);
            }
        };

        const tryLoad = () => {
            if (window.Hls) {
                loadStream();
            } else {
                setTimeout(tryLoad, 100);
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
                thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
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
        if (!hasSeparateAudio) return;

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

        return () => {
            Object.entries(handlers).forEach(([event, handler]) => {
                video.removeEventListener(event, handler);
            });
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

        video.addEventListener('canplay', handleCanPlay);
        video.addEventListener('playing', handlePlaying);
        video.addEventListener('waiting', handleWaiting);
        video.addEventListener('loadstart', handleLoadStart);

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
                    setIsLoading(false);
                    setError('Playback error');
                    setUseFallback(true);
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
            if (nextVideoId) router.push(`/watch?v=${nextVideoId}`);
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
                    src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
                    style={iframeStyle}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    title={title || 'Video'}
                />
            </div>
        );
    }

    return (
        <div style={containerStyle} onMouseEnter={() => setShowControls(true)} onMouseLeave={() => { setShowControls(false); setShowQualityMenu(false); }}>
            {isLoading && <PlayerSkeleton />}

            <video
                ref={videoRef}
                style={{ ...videoStyle, visibility: isLoading ? 'hidden' : 'visible' }}
                controls
                playsInline
                poster={`https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`}
            />

            <audio ref={audioRef} style={{ display: 'none' }} />

            {error && (
                <div style={errorStyle}>
                    <span>{error}</span>
                    <button onClick={() => setUseFallback(true)} style={retryBtnStyle}>Try YouTube Player</button>
                </div>
            )}

            {showControls && !error && !isLoading && (
                <>
                    <a href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noopener noreferrer" style={openBtnStyle}>
                        Open on YouTube ↗
                    </a>

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

            {isBuffering && !isLoading && (
                <div style={bufferingOverlayStyle}>
                    <div style={spinnerStyle} />
                </div>
            )}
        </div>
    );
}

const noVideoStyle: React.CSSProperties = { width: '100%', background: '#000', borderRadius: '12px', aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' };
const containerStyle: React.CSSProperties = { width: '100%', background: '#000', borderRadius: '12px', overflow: 'hidden', aspectRatio: '16/9', position: 'relative' };
const videoStyle: React.CSSProperties = { width: '100%', height: '100%', background: '#000' };
const iframeStyle: React.CSSProperties = { width: '100%', height: '100%', border: 'none' };
const errorStyle: React.CSSProperties = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', background: 'rgba(0,0,0,0.9)', color: '#ff6b6b' };
const retryBtnStyle: React.CSSProperties = { padding: '8px 16px', background: '#ff0000', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' };
const openBtnStyle: React.CSSProperties = { position: 'absolute', top: '10px', right: '10px', padding: '6px 12px', background: 'rgba(0,0,0,0.8)', color: '#fff', borderRadius: '4px', textDecoration: 'none', fontSize: '12px', zIndex: 10 };
const qualityContainerStyle: React.CSSProperties = { position: 'absolute', bottom: '50px', right: '10px', zIndex: 10 };
const qualityBtnStyle: React.CSSProperties = { padding: '6px 12px', background: 'rgba(0,0,0,0.8)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 500 };
const qualityMenuStyle: React.CSSProperties = { position: 'absolute', bottom: '100%', right: 0, marginBottom: '4px', background: 'rgba(0,0,0,0.95)', borderRadius: '8px', overflow: 'hidden', minWidth: '100px' };
const qualityItemStyle: React.CSSProperties = { display: 'block', width: '100%', padding: '8px 16px', color: '#fff', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap' };

const skeletonContainerStyle: React.CSSProperties = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', background: '#000', zIndex: 5 };
const skeletonVideoStyle: React.CSSProperties = { flex: 1, margin: '8px', borderRadius: '8px' };
const skeletonControlsStyle: React.CSSProperties = { padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '8px' };
const skeletonProgressStyle: React.CSSProperties = { height: '4px', borderRadius: '2px' };
const skeletonButtonsRowStyle: React.CSSProperties = { display: 'flex', gap: '8px', alignItems: 'center' };
const skeletonButtonStyle: React.CSSProperties = { height: '24px', borderRadius: '4px' };
const skeletonCenterStyle: React.CSSProperties = { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
const skeletonSpinnerStyle: React.CSSProperties = { width: '48px', height: '48px', border: '4px solid rgba(255,255,255,0.1)', borderTopColor: 'rgba(255,255,255,0.8)', borderRadius: '50%', animation: 'spin 1s linear infinite' };
const bufferingOverlayStyle: React.CSSProperties = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)', pointerEvents: 'none', zIndex: 5 };
const spinnerStyle: React.CSSProperties = { width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' };

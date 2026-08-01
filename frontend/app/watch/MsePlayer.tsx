'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import YouTubePlayer from './YouTubePlayer';

interface PlaybackFormat {
    format_id: string;
    height: number;
    width: number;
    vcodec: string;
    acodec: string;
    ext: string;
    bandwidth: number;
    fps: number;
    filesize: number;
    url: string;
    has_audio: boolean;
    fragment_count: number;
    init_url?: string;
    media_url?: string;
}

interface PlaybackInfo {
    title: string;
    duration: number;
    video_formats: PlaybackFormat[];
    audio_format?: PlaybackFormat;
}

interface MsePlayerProps {
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
    onError?: () => void;
}

function proxyUrl(raw: string): string {
    return `/api/video/proxy?url=${encodeURIComponent(raw)}`;
}

function formatTime(seconds: number): string {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
        return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export default function MsePlayer({
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
    onError,
}: MsePlayerProps) {
    const [playbackInfo, setPlaybackInfo] = useState<PlaybackInfo | null>(null);
    const [failed, setFailed] = useState(false);
    const [isBuffering, setIsBuffering] = useState(true);
    const [isPlaying, setIsPlaying] = useState(autoplay);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [showSettings, setShowSettings] = useState(false);
    const [settingsTab, setSettingsTab] = useState<'main' | 'quality' | 'speed'>('main');
    const [selectedFormatId, setSelectedFormatId] = useState<string | null>(null);
    const [showControls, setShowControls] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [playbackKey, setPlaybackKey] = useState(0);

    const containerRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const progressBarRef = useRef<HTMLDivElement>(null);
    const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        let cancelled = false;
        setIsBuffering(true);
        setFailed(false);
        setPlaybackInfo(null);
        setSelectedFormatId(null);

        const controller = new AbortController();

        fetch(`/api/video/${videoId}/playback-info`, { signal: controller.signal })
            .then(r => r.json())
            .then((d: PlaybackInfo) => {
                if (cancelled) return;
                setPlaybackInfo(d);
                if (d.duration > 0) setDuration(d.duration);
                if (d.video_formats && d.video_formats.length > 0) {
                    const sorted = [...d.video_formats].sort((a, b) => b.height - a.height);
                    setSelectedFormatId(sorted[0].format_id);
                } else {
                    setFailed(true);
                }
            })
            .catch((err: any) => {
                if (cancelled || err?.name === 'AbortError') return;
                setFailed(true);
            });

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [videoId]);

    const currentFormat = useMemo(() => {
        if (!playbackInfo?.video_formats || !selectedFormatId) return null;
        return playbackInfo.video_formats.find(f => f.format_id === selectedFormatId) || null;
    }, [playbackInfo, selectedFormatId]);

    const needsSeparateAudio = useMemo(() => {
        return !!(currentFormat && !currentFormat.has_audio && playbackInfo?.audio_format?.url);
    }, [currentFormat, playbackInfo]);

    const qualityOptions = useMemo(() => {
        if (!playbackInfo?.video_formats) return [];
        const byHeight = new Map<number, PlaybackFormat>();
        for (const f of playbackInfo.video_formats) {
            const existing = byHeight.get(f.height);
            if (!existing || f.bandwidth > existing.bandwidth) {
                byHeight.set(f.height, f);
            }
        }
        return [...byHeight.entries()]
            .sort(([a], [b]) => b - a)
            .map(([height, format]) => ({
                value: format.format_id,
                label: `${height}p`,
            }));
    }, [playbackInfo]);

    const currentLabel = qualityOptions.find(o => o.value === selectedFormatId)?.label ?? 'Quality';

    // Auto-hide controls timer
    const resetHideControlsTimer = useCallback(() => {
        setShowControls(true);
        if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
        if (isPlaying) {
            hideControlsTimer.current = setTimeout(() => {
                setShowControls(false);
                setShowSettings(false);
            }, 2500);
        }
    }, [isPlaying]);

    // Synchronize media elements (video + audio)
    useEffect(() => {
        if (!currentFormat || !videoRef.current) return;
        const video = videoRef.current;
        const audio = audioRef.current;

        setIsBuffering(true);
        video.src = proxyUrl(currentFormat.url);

        if (needsSeparateAudio && audio && playbackInfo?.audio_format?.url) {
            audio.src = proxyUrl(playbackInfo.audio_format.url);
            audio.load();
        } else if (audio) {
            audio.pause();
            audio.removeAttribute('src');
        }

        // Apply initial volume & rate
        video.volume = volume;
        video.muted = isMuted;
        video.playbackRate = playbackRate;

        if (audio) {
            audio.volume = volume;
            audio.muted = isMuted;
            audio.playbackRate = playbackRate;
        }

        if (autoplay) {
            video.play().catch(() => {});
            if (needsSeparateAudio && audio) {
                audio.play().catch(() => {});
            }
            setIsPlaying(true);
        }

        // Real-time Audio Sync with Video
        const syncAudio = () => {
            if (!needsSeparateAudio || !audio) return;
            const diff = Math.abs(audio.currentTime - video.currentTime);
            if (diff > 0.15) {
                audio.currentTime = video.currentTime;
            }
        };

        const onPlay = () => {
            setIsPlaying(true);
            if (needsSeparateAudio && audio) {
                audio.play().catch(() => {});
                syncAudio();
            }
        };

        const onPause = () => {
            setIsPlaying(false);
            if (needsSeparateAudio && audio) {
                audio.pause();
            }
        };

        const onTimeUpdate = () => {
            setCurrentTime(video.currentTime);
            if (video.duration && !isNaN(video.duration)) {
                setDuration(video.duration);
            }
            syncAudio();
        };

        const onSeeking = () => {
            setIsBuffering(true);
            syncAudio();
        };

        const onSeeked = () => {
            setIsBuffering(false);
            syncAudio();
        };

        const onWaiting = () => {
            setIsBuffering(true);
            if (needsSeparateAudio && audio) audio.pause();
        };

        const onCanPlay = () => {
            setIsBuffering(false);
            onVideoReady?.();
            if (needsSeparateAudio && audio && !video.paused) {
                audio.play().catch(() => {});
            }
        };

        video.addEventListener('play', onPlay);
        video.addEventListener('pause', onPause);
        video.addEventListener('timeupdate', onTimeUpdate);
        video.addEventListener('seeking', onSeeking);
        video.addEventListener('seeked', onSeeked);
        video.addEventListener('waiting', onWaiting);
        video.addEventListener('canplay', onCanPlay);

        return () => {
            video.removeEventListener('play', onPlay);
            video.removeEventListener('pause', onPause);
            video.removeEventListener('timeupdate', onTimeUpdate);
            video.removeEventListener('seeking', onSeeking);
            video.removeEventListener('seeked', onSeeked);
            video.removeEventListener('waiting', onWaiting);
            video.removeEventListener('canplay', onCanPlay);
        };
    }, [currentFormat, playbackInfo, autoplay, needsSeparateAudio]);

    // Play / Pause toggle
    const togglePlay = useCallback(() => {
        if (!videoRef.current) return;
        const video = videoRef.current;
        const audio = audioRef.current;

        if (video.paused) {
            video.play().catch(() => {});
            if (needsSeparateAudio && audio) audio.play().catch(() => {});
            setIsPlaying(true);
        } else {
            video.pause();
            if (needsSeparateAudio && audio) audio.pause();
            setIsPlaying(false);
        }
    }, [needsSeparateAudio]);

    // Volume change handler
    const handleVolumeChange = (newVol: number) => {
        setVolume(newVol);
        setIsMuted(newVol === 0);
        if (videoRef.current) videoRef.current.volume = newVol;
        if (videoRef.current) videoRef.current.muted = newVol === 0;
        if (audioRef.current) audioRef.current.volume = newVol;
        if (audioRef.current) audioRef.current.muted = newVol === 0;
    };

    // Mute toggle handler
    const toggleMute = () => {
        const nextMute = !isMuted;
        setIsMuted(nextMute);
        if (videoRef.current) videoRef.current.muted = nextMute;
        if (audioRef.current) audioRef.current.muted = nextMute;
    };

    // Playback rate handler
    const handleRateChange = (rate: number) => {
        setPlaybackRate(rate);
        if (videoRef.current) videoRef.current.playbackRate = rate;
        if (audioRef.current) audioRef.current.playbackRate = rate;
        setShowSettings(false);
    };

    // Seek handler
    const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!progressBarRef.current || !videoRef.current) return;
        const rect = progressBarRef.current.getBoundingClientRect();
        const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const newTime = pos * duration;
        videoRef.current.currentTime = newTime;
        if (audioRef.current) audioRef.current.currentTime = newTime;
        setCurrentTime(newTime);
    };

    // Fullscreen toggle
    const toggleFullscreen = () => {
        if (!containerRef.current) return;
        if (!document.fullscreenElement) {
            containerRef.current.requestFullscreen().catch(() => {});
            setIsFullscreen(true);
        } else {
            document.exitFullscreen().catch(() => {});
            setIsFullscreen(false);
        }
    };

    // Keyboard Shortcuts (Space, F, M, Arrow Keys)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const activeEl = document.activeElement;
            if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return;

            if (e.key === ' ' || e.key === 'k' || e.key === 'K') {
                e.preventDefault();
                togglePlay();
            } else if (e.key === 'f' || e.key === 'F') {
                e.preventDefault();
                toggleFullscreen();
            } else if (e.key === 'm' || e.key === 'M') {
                e.preventDefault();
                toggleMute();
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                if (videoRef.current) {
                    const t = Math.max(0, videoRef.current.currentTime - 5);
                    videoRef.current.currentTime = t;
                    if (audioRef.current) audioRef.current.currentTime = t;
                }
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                if (videoRef.current) {
                    const t = Math.min(duration, videoRef.current.currentTime + 5);
                    videoRef.current.currentTime = t;
                    if (audioRef.current) audioRef.current.currentTime = t;
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                handleVolumeChange(Math.min(1, volume + 0.1));
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                handleVolumeChange(Math.max(0, volume - 0.1));
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [togglePlay, volume, duration]);

    const handleQualitySelect = useCallback((formatId: string) => {
        setSelectedFormatId(formatId);
        setShowSettings(false);
        setIsBuffering(true);
        setPlaybackKey(k => k + 1);
    }, []);

    if (failed) {
        return (
            <YouTubePlayer
                videoId={videoId}
                title={title}
                autoplay={autoplay}
                onVideoEnd={onVideoEnd}
                loop={loop}
            />
        );
    }

    const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

    return (
        <div
            ref={containerRef}
            className="relative w-full aspect-video bg-black overflow-hidden group select-none"
            style={{ position: 'relative', backgroundColor: '#000', cursor: showControls ? 'default' : 'none' }}
            onMouseMove={resetHideControlsTimer}
            onMouseLeave={() => isPlaying && setShowControls(false)}
            onDoubleClick={toggleFullscreen}
        >
            {/* HTML5 Video Element (Clean, no default controls) */}
            <video
                ref={videoRef}
                key={`${videoId}:${selectedFormatId}:${playbackKey}`}
                className="w-full h-full cursor-pointer"
                onClick={togglePlay}
                autoPlay={autoplay}
                loop={loop}
                playsInline
                onError={() => {
                    const prog = playbackInfo?.video_formats?.find(f => f.has_audio);
                    if (prog && prog.format_id !== selectedFormatId) {
                        setSelectedFormatId(prog.format_id);
                    } else {
                        setFailed(true);
                    }
                }}
                onEnded={() => {
                    if (audioRef.current) audioRef.current.pause();
                    onVideoEnd?.();
                }}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />

            {/* Hidden Audio Element for Video-Only DASH Stream Sync */}
            <audio
                ref={audioRef}
                style={{ display: 'none' }}
                preload="auto"
            />

            {/* Buffering Indicator Spinner */}
            {isBuffering && (
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'rgba(0,0,0,0.4)',
                        zIndex: 10,
                        pointerEvents: 'none',
                    }}
                >
                    <img
                        src="/loading.gif"
                        alt="Loading"
                        style={{ width: '56px', height: '56px', objectFit: 'contain' }}
                    />
                </div>
            )}

            {/* Center Play/Pause Splash animation button */}
            {!isBuffering && showControls && (
                <div
                    onClick={togglePlay}
                    style={{
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
                        zIndex: 12,
                        transition: 'transform 0.15s ease, opacity 0.2s ease',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                        border: '1px solid rgba(255,255,255,0.15)',
                    }}
                >
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

            {/* CUSTOM MODERN CONTROLS OVERLAY */}
            <div
                style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.5) 60%, transparent 100%)',
                    padding: '12px 16px 14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    zIndex: 15,
                    opacity: showControls || !isPlaying ? 1 : 0,
                    pointerEvents: showControls || !isPlaying ? 'auto' : 'none',
                    transition: 'opacity 0.25s ease-in-out',
                }}
            >
                {/* PROGRESS / SEEK BAR */}
                <div
                    ref={progressBarRef}
                    onClick={handleSeek}
                    style={{
                        position: 'relative',
                        width: '100%',
                        height: '6px',
                        backgroundColor: 'rgba(255, 255, 255, 0.25)',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        transition: 'height 0.15s ease',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.height = '8px'}
                    onMouseLeave={(e) => e.currentTarget.style.height = '6px'}
                >
                    <div
                        style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: `${progressPct}%`,
                            backgroundColor: '#FF0033',
                            borderRadius: '3px',
                            boxShadow: '0 0 10px rgba(255, 0, 51, 0.8)',
                        }}
                    />
                    <div
                        style={{
                            position: 'absolute',
                            left: `${progressPct}%`,
                            top: '50%',
                            transform: 'translate(-50%, -50%)',
                            width: '14px',
                            height: '14px',
                            borderRadius: '50%',
                            backgroundColor: '#FF0033',
                            boxShadow: '0 0 8px rgba(0,0,0,0.6)',
                            transition: 'scale 0.15s ease',
                        }}
                    />
                </div>

                {/* CONTROLS BUTTONS ROW */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    {/* LEFT CONTROLS (Play, Volume, Time) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        {/* Play/Pause Button */}
                        <button
                            type="button"
                            onClick={togglePlay}
                            style={{ background: 'none', border: 'none', color: '#FFF', cursor: 'pointer', padding: 0, display: 'flex' }}
                            title={isPlaying ? 'Pause (k)' : 'Play (k)'}
                        >
                            {isPlaying ? (
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                                </svg>
                            ) : (
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M8 5v14l11-7z"/>
                                </svg>
                            )}
                        </button>

                        {/* Volume & Mute Controls (Accurate Audio Status) */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} className="group/vol">
                            <button
                                type="button"
                                onClick={toggleMute}
                                style={{ background: 'none', border: 'none', color: '#FFF', cursor: 'pointer', padding: 0, display: 'flex' }}
                                title={isMuted ? 'Unmute (m)' : 'Mute (m)'}
                            >
                                {isMuted || volume === 0 ? (
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="#FF4B4B">
                                        <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                                    </svg>
                                ) : volume < 0.5 ? (
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>
                                    </svg>
                                ) : (
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M3 9v6h4l5 5V4L9 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                                    </svg>
                                )}
                            </button>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={isMuted ? 0 : volume}
                                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                                style={{
                                    width: '60px',
                                    height: '4px',
                                    accentColor: '#FF0033',
                                    cursor: 'pointer',
                                }}
                            />
                        </div>

                        {/* Time Display */}
                        <div style={{ color: '#E5E5E5', fontSize: '13px', fontFamily: 'Inter, sans-serif', fontWeight: 500 }}>
                            {formatTime(currentTime)} / {formatTime(duration)}
                        </div>
                    </div>

                    {/* RIGHT CONTROLS (Quality Badge, Settings, Fullscreen) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {/* Quality Badge */}
                        <button
                            type="button"
                            onClick={() => {
                                setSettingsTab('quality');
                                setShowSettings(s => !s);
                            }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '4px 10px',
                                borderRadius: '6px',
                                background: 'rgba(255,255,255,0.12)',
                                backdropFilter: 'blur(8px)',
                                border: '1px solid rgba(255,255,255,0.2)',
                                color: '#FFF',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: 'pointer',
                            }}
                        >
                            {currentLabel}
                        </button>

                        {/* Settings Gear Menu */}
                        <div style={{ position: 'relative' }}>
                            <button
                                type="button"
                                onClick={() => {
                                    setSettingsTab('main');
                                    setShowSettings(s => !s);
                                }}
                                style={{ background: 'none', border: 'none', color: '#FFF', cursor: 'pointer', padding: 0, display: 'flex' }}
                                title="Settings"
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1112 8.4a3.6 3.6 0 010 7.2z"/>
                                </svg>
                            </button>

                            {/* Dropdown Menu Overlay */}
                            {showSettings && (
                                <>
                                    <div style={{ position: 'fixed', inset: 0, zIndex: 25 }} onClick={() => setShowSettings(false)} />
                                    <div
                                        style={{
                                            position: 'absolute',
                                            right: 0,
                                            bottom: '120%',
                                            width: '180px',
                                            borderRadius: '12px',
                                            background: 'rgba(20, 20, 20, 0.95)',
                                            backdropFilter: 'blur(16px)',
                                            border: '1px solid rgba(255, 255, 255, 0.15)',
                                            boxShadow: '0 12px 32px rgba(0,0,0,0.8)',
                                            padding: '6px',
                                            zIndex: 30,
                                            color: '#FFF',
                                        }}
                                    >
                                        {settingsTab === 'main' && (
                                            <>
                                                <button
                                                    onClick={() => setSettingsTab('quality')}
                                                    style={{ width: '100%', display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: 'none', border: 'none', color: '#FFF', fontSize: '13px', cursor: 'pointer', borderRadius: '6px' }}
                                                >
                                                    <span>Quality</span>
                                                    <span style={{ opacity: 0.7 }}>{currentLabel} &gt;</span>
                                                </button>
                                                <button
                                                    onClick={() => setSettingsTab('speed')}
                                                    style={{ width: '100%', display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: 'none', border: 'none', color: '#FFF', fontSize: '13px', cursor: 'pointer', borderRadius: '6px' }}
                                                >
                                                    <span>Playback Speed</span>
                                                    <span style={{ opacity: 0.7 }}>{playbackRate}x &gt;</span>
                                                </button>
                                            </>
                                        )}

                                        {settingsTab === 'quality' && (
                                            <>
                                                <div style={{ padding: '6px 10px', fontSize: '12px', fontWeight: 600, opacity: 0.7, borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '4px' }}>
                                                    Select Quality
                                                </div>
                                                {qualityOptions.map(o => (
                                                    <button
                                                        key={o.value}
                                                        onClick={() => handleQualitySelect(o.value)}
                                                        style={{
                                                            width: '100%',
                                                            display: 'flex',
                                                            justify: 'space-between',
                                                            padding: '8px 10px',
                                                            background: o.value === selectedFormatId ? 'rgba(255,0,51,0.2)' : 'none',
                                                            border: 'none',
                                                            color: o.value === selectedFormatId ? '#FF4B4B' : '#FFF',
                                                            fontSize: '13px',
                                                            fontWeight: o.value === selectedFormatId ? 600 : 400,
                                                            cursor: 'pointer',
                                                            borderRadius: '6px',
                                                        }}
                                                    >
                                                        <span>{o.label}</span>
                                                        {o.value === selectedFormatId && <span>✓</span>}
                                                    </button>
                                                ))}
                                            </>
                                        )}

                                        {settingsTab === 'speed' && (
                                            <>
                                                <div style={{ padding: '6px 10px', fontSize: '12px', fontWeight: 600, opacity: 0.7, borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '4px' }}>
                                                    Playback Speed
                                                </div>
                                                {[0.5, 1, 1.25, 1.5, 2].map(r => (
                                                    <button
                                                        key={r}
                                                        onClick={() => handleRateChange(r)}
                                                        style={{
                                                            width: '100%',
                                                            display: 'flex',
                                                            justify: 'space-between',
                                                            padding: '8px 10px',
                                                            background: r === playbackRate ? 'rgba(255,0,51,0.2)' : 'none',
                                                            border: 'none',
                                                            color: r === playbackRate ? '#FF4B4B' : '#FFF',
                                                            fontSize: '13px',
                                                            fontWeight: r === playbackRate ? 600 : 400,
                                                            cursor: 'pointer',
                                                            borderRadius: '6px',
                                                        }}
                                                    >
                                                        <span>{r === 1 ? 'Normal (1x)' : `${r}x`}</span>
                                                        {r === playbackRate && <span>✓</span>}
                                                    </button>
                                                ))}
                                            </>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Fullscreen Button */}
                        <button
                            type="button"
                            onClick={toggleFullscreen}
                            style={{ background: 'none', border: 'none', color: '#FFF', cursor: 'pointer', padding: 0, display: 'flex' }}
                            title="Fullscreen (f)"
                        >
                            {isFullscreen ? (
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
                                </svg>
                            ) : (
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                                </svg>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

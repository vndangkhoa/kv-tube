'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import YouTubePlayer from './YouTubePlayer';

interface VidstackPlayerProps {
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

// YouTube only muxes audio into <=720p progressive files, and 4K/1440 are
// DASH-only. Per decision, self-hosting is capped at 1080p; >1080 is handled by
// the YouTube iframe (the HD/YouTube toggle). So the self-hosted menu only
// exposes <=1080 choices.

export default function VidstackPlayer({
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
}: VidstackPlayerProps) {
    const [qualityCap, setQualityCap] = useState(1080);
    const [resolutions, setResolutions] = useState<number[]>([]);
    const [showQuality, setShowQuality] = useState(false);
    const [failed, setFailed] = useState(false);
    const [isBuffering, setIsBuffering] = useState(true);
    const videoRef = useRef<HTMLVideoElement>(null);

    // Self-hosted is <=1080p; 4K/1440 live on the YouTube iframe.
    useEffect(() => {
        let cancelled = false;
        fetch(`/api/get_stream_info?v=${videoId}`)
            .then((r) => r.json())
            .then((d: { heights?: number[] }) => {
                if (cancelled) return;
                if (Array.isArray(d.heights)) {
                    setResolutions(
                        [...new Set(d.heights.filter((h) => h <= 1080))].sort((a, b) => b - a),
                    );
                }
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [videoId]);

    // Reset loading when source changes
    useEffect(() => {
        setIsBuffering(true);
    }, [videoId, qualityCap]);

    const handleWaiting = useCallback(() => setIsBuffering(true), []);
    const handlePlaying = useCallback(() => setIsBuffering(false), []);

    // Any failure falls back to the official YouTube embed.
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

    const vc = ''; // no codec constraint needed for native video
    const q = qualityCap > 0 ? `&h=${qualityCap}` : '';
    const src = `/api/stream/mp4?v=${videoId}${q}${vc}`;

    const qualityOptions = useMemo(() => {
        const opts: { value: number; label: string }[] = [{ value: 0, label: 'Best' }];
        for (const h of resolutions) {
            opts.push({ value: h, label: h >= 1080 ? '1080p' : `${h}p` });
        }
        return opts;
    }, [resolutions]);

    const currentLabel =
        qualityOptions.find((o) => o.value === qualityCap)?.label ?? 'Best';

    return (
        <div className="relative w-full aspect-video bg-black" style={{ position: 'relative' }}>
            <video
                ref={videoRef}
                className="w-full h-full"
                src={src}
                autoPlay={autoplay}
                loop={loop}
                playsInline
                controls
                onError={() => {
                    setFailed(true);
                    onError?.();
                }}
                onEnded={() => onVideoEnd?.()}
                onCanPlay={() => {
                    onVideoReady?.();
                    setIsBuffering(false);
                }}
                onWaiting={handleWaiting}
                onPlaying={handlePlaying}
                key={`${videoId}:${qualityCap}`}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />

            {/* Custom loading overlay using our GIF (initial load + buffering) */}
            {isBuffering && (
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'rgba(0,0,0,0.6)',
                        zIndex: 10,
                        pointerEvents: 'none',
                    }}
                >
                    <img
                        src="/loading.gif"
                        alt="Loading"
                        style={{ width: '48px', height: '48px', objectFit: 'contain' }}
                    />
                </div>
            )}

            {qualityOptions.length > 1 && (
                <div style={{ position: 'absolute', right: '8px', top: '8px', zIndex: 20 }}>
                    <button
                        type="button"
                        onClick={() => setShowQuality((s) => !s)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            background: 'rgba(0,0,0,0.65)',
                            backdropFilter: 'blur(8px)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            color: '#fff',
                            fontSize: '12px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            lineHeight: 1,
                        }}
                        aria-haspopup="listbox"
                        aria-expanded={showQuality}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.8 }}>
                            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1112 8.4a3.6 3.6 0 010 7.2z"/>
                        </svg>
                        {currentLabel}
                    </button>
                    {showQuality && (
                        <>
                            <div
                                style={{ position: 'fixed', inset: 0, zIndex: 19 }}
                                onClick={() => setShowQuality(false)}
                            />
                            <div
                                role="listbox"
                                style={{
                                    position: 'absolute',
                                    right: 0,
                                    top: '100%',
                                    marginTop: '4px',
                                    maxHeight: '260px',
                                    width: '140px',
                                    overflowY: 'auto',
                                    borderRadius: '10px',
                                    background: 'rgba(18,18,18,0.95)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                                    backdropFilter: 'blur(16px)',
                                    padding: '4px',
                                    zIndex: 20,
                                }}
                            >
                                {qualityOptions.map((o) => {
                                    const sel = o.value === qualityCap;
                                    return (
                                        <button
                                            key={o.value}
                                            type="button"
                                            role="option"
                                            aria-selected={sel}
                                            onClick={() => {
                                                setQualityCap(o.value);
                                                setShowQuality(false);
                                            }}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                width: '100%',
                                                padding: '8px 10px',
                                                borderRadius: '6px',
                                                border: 'none',
                                                background: sel ? 'rgba(255,255,255,0.08)' : 'transparent',
                                                color: sel ? '#38bdf8' : '#e5e5e5',
                                                fontSize: '13px',
                                                fontWeight: sel ? 600 : 400,
                                                cursor: 'pointer',
                                                textAlign: 'left',
                                                transition: 'background 0.15s',
                                            }}
                                            onMouseEnter={(e) => {
                                                if (!sel) e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                                            }}
                                            onMouseLeave={(e) => {
                                                if (!sel) e.currentTarget.style.background = 'transparent';
                                            }}
                                        >
                                            <span>{o.label}</span>
                                            {sel && (
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="#38bdf8">
                                                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                                                </svg>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

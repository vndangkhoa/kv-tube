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

function isProgressive(f: PlaybackFormat): boolean {
    return f.has_audio && f.fragment_count === 0;
}

function proxyUrl(raw: string): string {
    return `/api/video/proxy?url=${encodeURIComponent(raw)}`;
}

function buildDashSegmentUrl(fmt: PlaybackFormat, segmentNumber: number): string {
    const template = fmt.media_url || fmt.init_url || '';
    const u = new URL(template);
    const parts = u.pathname.split('/');
    for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        if (/^\d+$/.test(p)) {
            parts[i] = `${segmentNumber}`;
            break;
        }
        if (p.includes('init')) {
            parts.splice(i, 1, `sq/${segmentNumber}`);
            break;
        }
        if (p === 'sq') {
            parts.splice(i, 1, `sq/${segmentNumber}`);
            break;
        }
    }
    u.pathname = parts.join('/');
    return proxyUrl(u.toString());
}

function waitForSourceBuffer(sb: SourceBuffer): Promise<void> {
    return new Promise(resolve => {
        if (sb.updating) {
            sb.addEventListener('updateend', () => resolve(), { once: true });
        } else {
            resolve();
        }
    });
}

async function fetchBuffer(url: string, signal: AbortSignal): Promise<ArrayBuffer | null> {
    try {
        const resp = await fetch(url, { signal });
        return resp.arrayBuffer();
    } catch (e: any) {
        if (e?.name === 'AbortError') return null;
        throw e;
    }
}

async function removeBuffered(sb: SourceBuffer): Promise<void> {
    if (sb.updating) {
        await waitForSourceBuffer(sb);
    }
    for (let i = sb.buffered.length - 1; i >= 0; i--) {
        sb.remove(sb.buffered.start(i), sb.buffered.end(i));
        await waitForSourceBuffer(sb);
    }
}

async function runDashPipeline(
    video: HTMLVideoElement,
    videoFormat: PlaybackFormat,
    audioFormat: PlaybackFormat,
    duration: number,
    signal: AbortSignal,
): Promise<void> {
    const ms = new MediaSource();
    const msUrl = URL.createObjectURL(ms);
    video.src = msUrl;

    await new Promise<void>((resolve, reject) => {
        ms.addEventListener('sourceopen', () => resolve(), { once: true });
        if (signal.aborted) {
            URL.revokeObjectURL(msUrl);
            reject(new DOMException('Aborted', 'AbortError'));
        }
    });

    if (signal.aborted) {
        URL.revokeObjectURL(msUrl);
        return;
    }

    const videoMime = `video/${videoFormat.ext}; codecs="${videoFormat.vcodec}"`;
    const audioMime = `audio/${audioFormat.ext}; codecs="${audioFormat.acodec}"`;

    let videoSb: SourceBuffer;
    let audioSb: SourceBuffer;
    try {
        videoSb = ms.addSourceBuffer(videoMime);
        videoSb.mode = 'segments';
        audioSb = ms.addSourceBuffer(audioMime);
        audioSb.mode = 'segments';
    } catch (e) {
        URL.revokeObjectURL(msUrl);
        throw e;
    }

    const segmentDuration = duration / videoFormat.fragment_count;
    let pipelineAbort: AbortController | null = null;

    async function loadFromSegment(startSeg: number): Promise<void> {
        pipelineAbort?.abort();
        const localAbort = new AbortController();
        pipelineAbort = localAbort;

        try { videoSb.abort(); } catch {}
        try { audioSb.abort(); } catch {}

        await removeBuffered(videoSb);
        if (localAbort.signal.aborted) return;
        await removeBuffered(audioSb);
        if (localAbort.signal.aborted) return;

        const vInit = await fetchBuffer(proxyUrl(videoFormat.init_url!), localAbort.signal);
        if (!vInit || localAbort.signal.aborted) return;

        const aInit = await fetchBuffer(proxyUrl(audioFormat.init_url!), localAbort.signal);
        if (!aInit || localAbort.signal.aborted) return;

        videoSb.appendBuffer(vInit);
        await waitForSourceBuffer(videoSb);
        if (localAbort.signal.aborted) return;

        audioSb.appendBuffer(aInit);
        await waitForSourceBuffer(audioSb);
        if (localAbort.signal.aborted) return;

        let pendingVideo: Promise<ArrayBuffer | null> | null = null;
        let pendingAudio: Promise<ArrayBuffer | null> | null = null;

        for (let n = startSeg; n <= videoFormat.fragment_count; n++) {
            if (localAbort.signal.aborted) return;

            const nextVideo = n < videoFormat.fragment_count
                ? fetchBuffer(buildDashSegmentUrl(videoFormat, n + 1), localAbort.signal)
                : null;
            const nextAudio = n < videoFormat.fragment_count
                ? fetchBuffer(buildDashSegmentUrl(audioFormat, n + 1), localAbort.signal)
                : null;

            let vData: ArrayBuffer | null;
            let aData: ArrayBuffer | null;

            if (pendingVideo && pendingAudio) {
                vData = await pendingVideo;
                if (!vData) return;
                aData = await pendingAudio;
                if (!aData) return;
            } else {
                vData = await fetchBuffer(buildDashSegmentUrl(videoFormat, n), localAbort.signal);
                if (!vData) return;
                aData = await fetchBuffer(buildDashSegmentUrl(audioFormat, n), localAbort.signal);
                if (!aData) return;
            }

            videoSb.appendBuffer(vData);
            await waitForSourceBuffer(videoSb);
            if (localAbort.signal.aborted) return;

            audioSb.appendBuffer(aData);
            await waitForSourceBuffer(audioSb);
            if (localAbort.signal.aborted) return;

            pendingVideo = nextVideo;
            pendingAudio = nextAudio;

            const buffered = videoSb.buffered;
            if (buffered.length > 0 && buffered.end(buffered.length - 1) >= duration) break;
        }

        if (!localAbort.signal.aborted && ms.readyState === 'open') {
            try { ms.endOfStream(); } catch {}
        }
    }

    loadFromSegment(1).catch(() => {});

    const onSeek = () => {
        if (signal.aborted) return;
        const ct = video.currentTime;
        const seg = Math.min(Math.floor(ct / segmentDuration) + 1, videoFormat.fragment_count);
        loadFromSegment(seg).catch(() => {});
    };
    video.addEventListener('seeking', onSeek);

    signal.addEventListener('abort', () => {
        video.removeEventListener('seeking', onSeek);
        pipelineAbort?.abort();
        URL.revokeObjectURL(msUrl);
    }, { once: true });
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
    const [showQuality, setShowQuality] = useState(false);
    const [selectedFormatId, setSelectedFormatId] = useState<string | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const pipelineAbortRef = useRef<AbortController | null>(null);
    const [playbackKey, setPlaybackKey] = useState(0);

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
                if (d.video_formats && d.video_formats.length > 0) {
                    const sorted = [...d.video_formats].sort((a, b) => b.height - a.height);
                    setSelectedFormatId(sorted[0].format_id);
                } else {
                    setFailed(true);
                    onError?.();
                }
            })
            .catch((err: any) => {
                if (cancelled || err?.name === 'AbortError') return;
                setFailed(true);
                onError?.();
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

    const handleWaiting = useCallback(() => setIsBuffering(true), []);
    const handlePlaying = useCallback(() => setIsBuffering(false), []);

    useEffect(() => {
        if (!currentFormat || !videoRef.current || !playbackInfo) return;

        pipelineAbortRef.current?.abort();
        const controller = new AbortController();
        pipelineAbortRef.current = controller;

        const video = videoRef.current;

        if (isProgressive(currentFormat)) {
            setIsBuffering(true);
            video.removeAttribute('crossorigin');
            video.src = proxyUrl(currentFormat.url);
            if (autoplay) {
                video.play().catch(() => {});
            }
            const onAbort = () => {
                video.pause();
                video.removeAttribute('src');
                video.load();
            };
            controller.signal.addEventListener('abort', onAbort, { once: true });
        } else if (
            currentFormat.init_url &&
            playbackInfo.audio_format?.init_url
        ) {
            setIsBuffering(true);
            video.setAttribute('crossorigin', 'anonymous');
            video.src = '';

            runDashPipeline(
                video,
                currentFormat,
                playbackInfo.audio_format,
                playbackInfo.duration,
                controller.signal,
            ).catch((err: any) => {
                if (err?.name === 'AbortError') return;
                setFailed(true);
                onError?.();
            });
        } else {
            setFailed(true);
            onError?.();
        }

        return () => {
            controller.abort();
        };
    }, [currentFormat, playbackInfo, autoplay, onError]);

    const handleQualitySelect = useCallback((formatId: string) => {
        setSelectedFormatId(formatId);
        setShowQuality(false);
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

    return (
        <div className="relative w-full aspect-video bg-black" style={{ position: 'relative' }}>
            <video
                ref={videoRef}
                key={`${videoId}:${selectedFormatId}:${playbackKey}`}
                className="w-full h-full"
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
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />

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
                        onClick={() => setShowQuality(s => !s)}
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
                                {qualityOptions.map(o => {
                                    const sel = o.value === selectedFormatId;
                                    return (
                                        <button
                                            key={o.value}
                                            type="button"
                                            role="option"
                                            aria-selected={sel}
                                            onClick={() => handleQualitySelect(o.value)}
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

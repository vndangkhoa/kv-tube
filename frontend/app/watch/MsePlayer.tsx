'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import Hls from 'hls.js';
import YouTubePlayer from './YouTubePlayer';
import { useMediaSession, setMediaSessionPlaybackState, updateMediaSessionPosition } from '../hooks/useMediaSession';

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
    onUseIframe?: () => void; // switch back to the YouTube embed manually
}

function proxyUrl(raw: string): string {
    return `/api/media-proxy?url=${encodeURIComponent(raw)}`;
}

// KB §5: YouTube serves WebM/Opus by default — plays in Chrome, Firefox, Edge
// and codec-restricted clients (VS Code webview). Safari cannot play
// WebM/Opus, so detect support and request m4a/AAC only when needed.
function supportsWebmOpus(): boolean {
    if (typeof window === 'undefined') return true;
    const a = document.createElement('audio');
    return a.canPlayType('audio/webm; codecs="opus"') !== '';
}
const OPUS_SUPPORTED = supportsWebmOpus();

// YouTube's bot gate / stale-cookie signatures — the failure the user can
// fix by uploading fresh cookies (Settings → YouTube Cookies).
function isBotGateError(msg: string): boolean {
    return /sign in to confirm|not a bot|bot-check|requested format is not available/i.test(msg);
}

// YouTube formats come in three families: progressive (single playable file,
// caps ~360p on modern uploads), HLS manifest (up to 4K, played via hls.js),
// and DASH (init+media segments, needs full MSE — not supported here).
// Modern HLS manifests are VIDEO-ONLY (vp9, no audio group), so the separate
// audio stream from playback-info is played in a second <audio> element and
// kept in sync (needsSeparateAudio + syncAudio).
function isHlsFormat(f: PlaybackFormat): boolean {
    return /m3u8|hls_playlist/i.test(f.url || '');
}
function isPlayableFormat(f: PlaybackFormat): boolean {
    if (isHlsFormat(f)) return true;
    return !!f.url; // Video-only VP9/AVC streams are played in <video> with audio synced separately
}

// Route every hls.js request (manifest, segments, keys) through the backend
// proxy: the CDN URLs are signed for the server's IP, and the proxy now
// honors Range requests (206), so streaming works exactly like the
// extraction does. Without this, the browser would fetch googlevideo
// directly with its own IP/referrer and often fail.
class ProxyLoader extends Hls.DefaultConfig.loader {
    load(context: any, config: any, callbacks: any) {
        const url = context?.url;
        if (typeof url === 'string' && /^https?:\/\//i.test(url) && !url.startsWith(window.location.origin)) {
            context.url = `/api/media-proxy?url=${encodeURIComponent(url)}`;
            super.load(context, config, callbacks);
            context.url = url;
            return;
        }
        super.load(context, config, callbacks);
    }
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

// Coarse-pointer / touchscreen detection: on phones the playback-controls
// overlay is hidden while watching (tap to bring it back), like YouTube.
function isTouchDevice(): boolean {
    if (typeof window === 'undefined') return false;
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) ||
        window.matchMedia?.('(pointer: coarse)').matches === true;
}

// iOS keeps playing the audio track of a <video> that is *playing* when the
// app is backgrounded (screen lock / app switch) — pausing the video would
// kill the sound, so no audio-element handoff is needed there for progressive
// (sound-in-video) formats. iPads report "MacIntel" + touch, hence the check.
function isIOS(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
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
    onUseIframe,
}: MsePlayerProps) {
    const [playbackInfo, setPlaybackInfo] = useState<PlaybackInfo | null>(null);
    const [failed, setFailed] = useState(false);
    const [failReason, setFailReason] = useState<string | null>(null);
    const [retryKey, setRetryKey] = useState(0);
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
    // On touchscreens the controls overlay starts hidden while playing —
    // a tap brings it back (see handleVideoTap / onPlay auto-hide).
    const [showControls, setShowControls] = useState(() => !isTouchDevice());
    const [isFullscreen, setIsFullscreen] = useState(false);

    const [audioPref, setAudioPref] = useState<'opus' | 'm4a'>(OPUS_SUPPORTED ? 'opus' : 'm4a');

    // Refs that mirror state — used inside effects to avoid re-running the
    // expensive HLS setup when only volume/mute/rate change.
    const volumeRef = useRef(volume);
    const isMutedRef = useRef(isMuted);
    const playbackRateRef = useRef(playbackRate);
    const durationRef = useRef(duration);
    volumeRef.current = volume;
    isMutedRef.current = isMuted;
    playbackRateRef.current = playbackRate;
    durationRef.current = duration;

    const containerRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const hlsRef = useRef<Hls | null>(null);
    const progressBarRef = useRef<HTMLDivElement>(null);
    const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const audioErrorHandled = useRef(false);
    // Throttle position-state updates sent to the OS media notification.
    const lastPosUpdateRef = useRef(0);

    // Callbacks reachable from media-element listeners registered inside the
    // (deps-stable) setup effect, so they never go stale.
    const onVideoEndRef = useRef(onVideoEnd);
    const loopRef = useRef(loop);
    onVideoEndRef.current = onVideoEnd;
    loopRef.current = loop;

    // Background-playback state: while the tab is hidden the <audio> element
    // keeps playing and the <video> pauses (saves battery). When the page
    // becomes visible again the video resumes and re-syncs to the audio.
    const isPlayingRef = useRef(isPlaying);
    const needsSeparateAudioRef = useRef(false);
    const playbackInfoRef = useRef<PlaybackInfo | null>(null);
    const bgAudioOnlyRef = useRef(false);
    isPlayingRef.current = isPlaying;
    playbackInfoRef.current = playbackInfo;

    // Phone lock-screen / media notification controls (Media Session API).
    useMediaSession({
        videoId,
        title,
        uploader,
        thumbnail,
        getVideo: () => videoRef.current,
        getAudio: () => audioRef.current,
        onNext,
        onPrev,
    });

    // Switch playback over to the <audio> element (tab hidden / screen off):
    // load the separate audio stream, sync it to the video position, start it,
    // THEN pause the video. Called from both the visibilitychange handler and
    // the video's pause event (whichever fires first — Chrome Android pauses
    // the video itself when the screen turns off, so the event order varies).
    const startBackgroundAudio = useCallback(() => {
        const video = videoRef.current;
        const audio = audioRef.current;
        const pi = playbackInfoRef.current;
        if (!video || !audio || !pi?.audio_format?.url) return;
        if (bgAudioOnlyRef.current) return;
        // Desktop browsers keep an audible <video> playing in hidden tabs —
        // no handoff needed (and the audio element may not be unlocked there,
        // so switching could silence playback). Mobile is where the screen
        // turns off and the browser pauses the video.
        if (!isTouchDevice()) return;
        // iOS keeps the audio of a *playing* video alive in the background;
        // pausing it here would stop the sound. Leave the video alone.
        if (isIOS() && !needsSeparateAudioRef.current) return;
        const aurl = proxyUrl(pi.audio_format.url);
        if (audio.src !== aurl) {
            audio.src = aurl;
            audio.load();
        }
        audio.currentTime = video.currentTime;
        audio.volume = volumeRef.current;
        audio.muted = isMutedRef.current;
        audio.playbackRate = video.playbackRate;
        audio.loop = loopRef.current;
        // Mark the handoff BEFORE pausing the video: the pause event handler
        // must not pause the audio element or flip the media-session state.
        bgAudioOnlyRef.current = true;
        setMediaSessionPlaybackState('playing');
        audio.play().catch(() => {
            // Usually "not ready yet" — the canplay listener retries. If it
            // is an autoplay-policy rejection there is nothing more to do.
            console.warn('[MsePlayer] background audio did not start');
        });
        if (!video.paused) video.pause();
    }, []);

    // Background playback (PWA): when the tab is hidden / the screen is off,
    // keep the AUDIO playing and pause the video element (saves battery and
    // passes Chrome's background-video rules). The lock-screen / notification
    // media card keeps controlling playback via the audio element. When the
    // page becomes visible again, the video resumes and re-syncs.
    useEffect(() => {
        const onVisibility = () => {
            const video = videoRef.current;
            const audio = audioRef.current;
            if (!video || !audio) return;

            if (document.hidden) {
                // Hand off whenever the user expects playback — even if the
                // browser already auto-paused the video, so we don't depend
                // on event ordering (the pause handler is the backup path).
                if (isPlayingRef.current) startBackgroundAudio();
            } else if (bgAudioOnlyRef.current) {
                // Back in the foreground: resume the video, re-synced to audio.
                const userPaused = audio.paused;
                bgAudioOnlyRef.current = false;
                if (userPaused) {
                    // Paused from the lock screen / notification — stay paused.
                    if (!needsSeparateAudioRef.current) {
                        audio.pause();
                        audio.removeAttribute('src');
                        audio.load();
                    }
                    setMediaSessionPlaybackState('paused');
                    return;
                }
                if (video.paused) {
                    video.currentTime = audio.currentTime;
                    video.volume = volumeRef.current;
                    video.muted = isMutedRef.current;
                    video.play().catch(() => {});
                }
                if (!needsSeparateAudioRef.current) {
                    // Video has its own sound — drop the background audio.
                    audio.pause();
                    audio.removeAttribute('src');
                    audio.load();
                }
            }
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => document.removeEventListener('visibilitychange', onVisibility);
    }, [startBackgroundAudio]);

    // iOS only lets an <audio> element play programmatically once it has been
    // started by a real user gesture. Prime the background stream on the
    // first tap (muted play + immediate pause) so the screen-off handoff can
    // start it later without hitting autoplay restrictions.
    useEffect(() => {
        if (!isTouchDevice()) return;
        const container = containerRef.current;
        if (!container) return;
        let unlocked = false;
        const unlock = () => {
            if (unlocked) return;
            const audio = audioRef.current;
            const video = videoRef.current;
            const pi = playbackInfoRef.current;
            if (!audio || !pi?.audio_format?.url) return;
            if (!audio.paused) return; // already playing (DASH audio)
            unlocked = true;
            const aurl = proxyUrl(pi.audio_format.url);
            if (audio.src !== aurl) {
                audio.src = aurl;
                audio.load();
            }
            audio.currentTime = video?.currentTime || 0;
            const wasMuted = audio.muted;
            const wasVolume = audio.volume;
            audio.muted = true;
            audio.volume = 0;
            audio.play().then(() => audio.pause()).catch(() => {}).finally(() => {
                audio.muted = wasMuted;
                audio.volume = wasVolume;
            });
        };
        container.addEventListener('pointerdown', unlock);
        container.addEventListener('touchstart', unlock);
        return () => {
            container.removeEventListener('pointerdown', unlock);
            container.removeEventListener('touchstart', unlock);
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        setIsBuffering(true);
        setFailed(false);
        setFailReason(null);
        setPlaybackInfo(null);
        setSelectedFormatId(null);
        audioErrorHandled.current = false;

        const controller = new AbortController();

        fetch(`/api/video/${videoId}/playback-info?audio=${audioPref}`, { signal: controller.signal })
            .then(async (r) => {
                const d = await r.json();
                if (cancelled) return;
                if (!r.ok) {
                    const msg = d?.error || `playback-info failed (HTTP ${r.status})`;
                    console.error('[MsePlayer] playback-info error:', msg);
                    setFailReason(msg);
                    setFailed(true);
                    onError?.();
                    return;
                }
                setPlaybackInfo(d);
                if (d.duration > 0) setDuration(d.duration);
                if (d.video_formats && d.video_formats.length > 0) {
                    // This player uses a plain <video> (progressive) or hls.js
                    // (HLS manifest); DASH-only formats (fragment_count>0)
                    // need full MSE and are skipped. Pick the best playable
                    // format up front instead of waiting for an error fallback.
                    const playable = d.video_formats.filter(isPlayableFormat);
                    const pool = playable.length > 0 ? playable : d.video_formats;
                    const sorted = [...pool].sort((a, b) => b.height - a.height);
                    setSelectedFormatId(sorted[0].format_id);
                } else {
                    setFailReason('No playable formats returned');
                    setFailed(true);
                    onError?.();
                }
            })
            .catch((err: any) => {
                if (cancelled || err?.name === 'AbortError') return;
                console.error('[MsePlayer] playback-info fetch failed:', err);
                setFailReason(err?.message || String(err));
                setFailed(true);
                onError?.();
            });

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [videoId, audioPref, retryKey]);

    const currentFormat = useMemo(() => {
        if (!playbackInfo?.video_formats || !selectedFormatId) return null;
        return playbackInfo.video_formats.find(f => f.format_id === selectedFormatId) || null;
    }, [playbackInfo, selectedFormatId]);

    const needsSeparateAudio = useMemo(() => {
        return !!(currentFormat && !currentFormat.has_audio && playbackInfo?.audio_format?.url);
    }, [currentFormat, playbackInfo]);

    const qualityOptions = useMemo(() => {
        if (!playbackInfo?.video_formats) return [];
        // Only list formats this player can actually play: progressive
        // (plain <video>) and HLS manifests (hls.js / native Safari).
        const playable = playbackInfo.video_formats.filter(isPlayableFormat);
        const pool = playable.length > 0 ? playable : playbackInfo.video_formats;
        const byHeight = new Map<number, PlaybackFormat>();
        for (const f of pool) {
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



    // Fullscreen change listener with screen orientation lock
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

    // KB §5: browsers/webviews cache stale JS and codec-restricted clients
    // leave the audio element in error state even when the URL is valid.
    // Retry ladder: opus → m4a (codec switch). Audio failure is non-fatal:
    // the video keeps playing and the user can manually switch to iframe.
    const handleAudioError = useCallback(() => {
        if (audioPref === 'opus' && !audioErrorHandled.current) {
            audioErrorHandled.current = true;
            setAudioPref('m4a'); // re-fetches playback-info with m4a/AAC
            return;
        }
        if (!audioErrorHandled.current) {
            audioErrorHandled.current = true;
            const a = audioRef.current;
            if (a && a.src) {
                const src = a.src;
                a.removeAttribute('src');
                a.load();
                window.setTimeout(() => {
                    if (!a) return;
                    a.src = src;
                    a.load();
                }, 300);
            }
            return;
        }
        // Audio failed after retries — continue video-only instead of
        // falling back to iframe.  User can switch manually via the
        // HD/YouTube toggle.
        console.warn('[MsePlayer] audio element failed after retries, continuing video-only');
    }, [audioPref]);

    // Synchronize media elements (video + audio)
    useEffect(() => {
        if (!currentFormat || !videoRef.current) return;
        const video = videoRef.current;
        const audio = audioRef.current;
        needsSeparateAudioRef.current = needsSeparateAudio;

        setIsBuffering(true);

        // HLS manifests (up to 4K) play via hls.js on MSE-capable browsers
        // and natively in Safari; progressive formats play directly.
        hlsRef.current?.destroy();
        hlsRef.current = null;
        if (isHlsFormat(currentFormat)) {
            if (Hls.isSupported()) {
                const hls = new Hls({ enableWorker: true, loader: ProxyLoader });
                hlsRef.current = hls;
                hls.attachMedia(video);
                hls.on(Hls.Events.ERROR, (_evt, data) => {
                    if (!data.fatal) return;
                    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                        hls.startLoad();
                    } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                        hls.recoverMediaError();
                    } else {
                        console.error('[MsePlayer] hls fatal error:', data.type, data.details);
                        setFailReason(`HLS error: ${data.details}`);
                        setFailed(true);
                    }
                });
                hls.loadSource(proxyUrl(currentFormat.url));
            } else {
                // Safari plays HLS natively in the video element
                video.src = proxyUrl(currentFormat.url);
            }
        } else {
            video.src = proxyUrl(currentFormat.url);
        }

        if (needsSeparateAudio && audio && playbackInfo?.audio_format?.url) {
            audio.src = proxyUrl(playbackInfo.audio_format.url);
            audio.load();
        } else if (audio && bgAudioOnlyRef.current && playbackInfo?.audio_format?.url) {
            // Background mode with a fresh stream (audio retry opus→m4a /
            // format switch): reload the audio element without clearing it —
            // the canplay listener resumes playback.
            const aurl = proxyUrl(playbackInfo.audio_format.url);
            if (audio.src !== aurl) {
                audio.src = aurl;
                audio.load();
            }
        } else if (audio) {
            audio.pause();
            audio.removeAttribute('src');
        }

        // Apply initial volume & rate from refs
        video.volume = volumeRef.current;
        video.muted = isMutedRef.current;
        video.playbackRate = playbackRateRef.current;

        if (audio) {
            audio.volume = volumeRef.current;
            audio.muted = isMutedRef.current;
            audio.playbackRate = playbackRateRef.current;
        }

        // Audio-video lipsync: only correct drift above 300ms.  Tighter
        // thresholds (e.g. 50ms) cause constant seeking which makes the
        // audio sound choppy.  Sub-300ms drift is imperceptible.
        let lastSyncTime = 0;
        const syncAudio = () => {
            // Background mode: the video is intentionally paused while the
            // audio element drives playback — don't fight it.
            if (bgAudioOnlyRef.current) return;
            if (!needsSeparateAudio || !audio) return;
            const now = performance.now();
            // Throttle corrections to at most once per second to avoid rapid seeking.
            if (now - lastSyncTime < 1000) {
                // Still ensure audio is playing if it should be.
                if (!video.paused && audio.paused && audio.readyState >= 2) {
                    audio.play().catch(() => {});
                }
                return;
            }
            const diff = Math.abs(audio.currentTime - video.currentTime);
            if (diff > 0.3) {
                audio.currentTime = video.currentTime;
                lastSyncTime = now;
            }
            if (video.playbackRate !== audio.playbackRate) {
                audio.playbackRate = video.playbackRate;
            }
            if (!video.paused && audio.paused && audio.readyState >= 2) {
                audio.play().catch(() => {});
            }
        };

        const checkBothReady = () => {
            const videoReady = video.readyState >= 2;
            const audioReady = !needsSeparateAudio || (audio && audio.readyState >= 2);
            if (videoReady && audioReady) {
                setIsBuffering(false);
                onVideoReady?.();
                syncAudio();
            }
        };

        const onPlay = () => {
            setIsPlaying(true);
            needsSeparateAudioRef.current = needsSeparateAudio;
            setMediaSessionPlaybackState('playing');
            updateMediaSessionPosition(video.duration || durationRef.current, video.playbackRate, video.currentTime);
            // Touchscreens: hide the controls overlay while watching — a tap
            // on the video brings them back (YouTube-style immersive view).
            if (isTouchDevice()) {
                if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
                hideControlsTimer.current = setTimeout(() => setShowControls(false), 2500);
            }
            if (needsSeparateAudio && audio) {
                audio.currentTime = video.currentTime;
                audio.volume = volumeRef.current;
                audio.muted = isMutedRef.current;
                if (audio.paused) {
                    audio.play().catch(() => {});
                }
                syncAudio();
            } else if (audio && playbackInfoRef.current?.audio_format?.url) {
                // Progressive format: preload the separate audio stream now
                // (inside the user gesture) so background playback can start
                // it later without hitting autoplay restrictions (iOS).
                const aurl = proxyUrl(playbackInfoRef.current.audio_format.url);
                if (audio.src !== aurl) {
                    audio.src = aurl;
                    audio.load();
                }
            }
        };

        const onPause = () => {
            setIsPlaying(false);
            // The browser pauses the video when the page goes hidden (screen
            // off on Android) — hand off to the audio element right away so
            // playback continues. If startBackgroundAudio paused us itself,
            // bgAudioOnlyRef is already set and we just stay quiet.
            if (document.hidden) {
                if (!bgAudioOnlyRef.current) startBackgroundAudio();
                return;
            }
            if (bgAudioOnlyRef.current) return;
            setMediaSessionPlaybackState('paused');
            if (needsSeparateAudio && audio) {
                audio.pause();
            }
        };

        const onTimeUpdate = () => {
            setCurrentTime(video.currentTime);
            if (video.duration && !isNaN(video.duration)) {
                setDuration(video.duration);
            }
            // Keep the notification seek bar fresh, throttled to ~1s.
            const now = Date.now();
            if (now - lastPosUpdateRef.current > 1000) {
                lastPosUpdateRef.current = now;
                updateMediaSessionPosition(video.duration || durationRef.current, video.playbackRate, video.currentTime);
            }
            syncAudio();
        };

        // While playing in the background the video is paused, so the audio
        // element drives the progress bar and the lock-screen seek position.
        const onAudioTime = () => {
            if (!bgAudioOnlyRef.current || !audio) return;
            setCurrentTime(audio.currentTime);
            const now = Date.now();
            if (now - lastPosUpdateRef.current > 1000) {
                lastPosUpdateRef.current = now;
                updateMediaSessionPosition(audio.duration || durationRef.current, audio.playbackRate, audio.currentTime);
            }
        };

        const onSeeking = () => {
            setIsBuffering(true);
            syncAudio();
        };

        const onSeeked = () => {
            checkBothReady();
            syncAudio();
        };

        const onWaiting = () => {
            setIsBuffering(true);
            // Do NOT pause audio here — audio may still be able to play and
            // pausing it creates a deadlock when both elements wait on each
            // other.  syncAudio will re-align once the video recovers.
        };

        const onAudioWaiting = () => {
            // Audio is buffering.  Do NOT pause the video — that creates a
            // deadlock.  The sync handler will re-align once audio recovers.
            setIsBuffering(true);
        };

        const onCanPlay = () => {
            checkBothReady();
        };

        const onAudioCanPlay = () => {
            // Retry a background handoff that couldn't start (element wasn't
            // ready yet, or the stream was reloaded while hidden).
            if (bgAudioOnlyRef.current && audio && audio.paused && document.hidden) {
                audio.play().catch(() => {});
            }
            checkBothReady();
        };

        const onAudioEnded = () => {
            // In background mode the video is paused, so only the audio
            // element knows the track finished — forward it for autoplay-next.
            if (bgAudioOnlyRef.current) onVideoEndRef.current?.();
        };

        video.addEventListener('play', onPlay);
        video.addEventListener('playing', syncAudio);
        video.addEventListener('pause', onPause);
        video.addEventListener('timeupdate', onTimeUpdate);
        video.addEventListener('seeking', onSeeking);
        video.addEventListener('seeked', onSeeked);
        video.addEventListener('waiting', onWaiting);
        video.addEventListener('canplay', onCanPlay);

        if (audio) {
            // Always track audio time so the progress bar and the lock-screen
            // seek position keep updating during background playback (the
            // video element is paused then and emits no timeupdate).
            audio.addEventListener('timeupdate', onAudioTime);
            audio.addEventListener('canplay', onAudioCanPlay);
            audio.addEventListener('ended', onAudioEnded);
        }
        if (needsSeparateAudio && audio) {
            audio.addEventListener('playing', syncAudio);
            audio.addEventListener('waiting', onAudioWaiting);
        }

        if (autoplay) {
            // Wait until video has enough data before attempting play.
            const attemptPlay = () => {
                video.play().then(() => {
                    setIsPlaying(true);
                    if (needsSeparateAudio && audio) {
                        audio.currentTime = video.currentTime;
                        audio.volume = volumeRef.current;
                        audio.muted = isMutedRef.current;
                        audio.play().catch(() => {});
                    }
                }).catch(() => {
                    // Autoplay blocked by browser policy — show play button.
                    setIsPlaying(false);
                    setIsBuffering(false);
                });
            };
            if (video.readyState >= 2) {
                attemptPlay();
            } else {
                video.addEventListener('canplay', attemptPlay, { once: true });
            }
        }

        return () => {
            hlsRef.current?.destroy();
            hlsRef.current = null;
            video.removeEventListener('play', onPlay);
            video.removeEventListener('playing', syncAudio);
            video.removeEventListener('pause', onPause);
            video.removeEventListener('timeupdate', onTimeUpdate);
            video.removeEventListener('seeking', onSeeking);
            video.removeEventListener('seeked', onSeeked);
            video.removeEventListener('waiting', onWaiting);
            video.removeEventListener('canplay', onCanPlay);
            if (audio) {
                audio.removeEventListener('timeupdate', onAudioTime);
                audio.removeEventListener('canplay', onAudioCanPlay);
                audio.removeEventListener('ended', onAudioEnded);
                audio.removeEventListener('playing', syncAudio);
                audio.removeEventListener('waiting', onAudioWaiting);
            }
        };
    // Only re-run when the format or audio source changes, NOT on volume/mute/rate.
    }, [currentFormat, playbackInfo, autoplay, needsSeparateAudio, onVideoReady]);

    // Play / Pause toggle
    const togglePlay = useCallback(() => {
        if (!videoRef.current) return;
        const video = videoRef.current;
        const audio = audioRef.current;

        if (video.paused) {
            video.volume = volumeRef.current;
            video.muted = isMutedRef.current;
            if (needsSeparateAudio && audio) {
                // Start the audio element inside the user gesture: a play()
                // called from the video.play() promise callback is no longer
                // gesture-scoped and iOS would reject it.
                audio.volume = volumeRef.current;
                audio.muted = isMutedRef.current;
                audio.currentTime = video.currentTime;
                audio.play().catch(() => {});
            }
            video.play().then(() => {
                setIsPlaying(true);
                setIsBuffering(false);
            }).catch(() => {
                // Play failed — leave state as-is, user can try again.
            });
        } else {
            video.pause();
            if (needsSeparateAudio && audio) audio.pause();
            setIsPlaying(false);
        }
    }, [needsSeparateAudio]);

    // Touchscreen behavior: tapping the video toggles the controls overlay
    // (the center button inside the overlay still plays/pauses). Desktop
    // keeps click-to-play/pause.
    const handleVideoTap = useCallback(() => {
        if (!isTouchDevice()) {
            togglePlay();
            return;
        }
        const next = !showControls;
        setShowControls(next);
        if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
        if (next && isPlaying) {
            hideControlsTimer.current = setTimeout(() => setShowControls(false), 2500);
        }
    }, [showControls, isPlaying, togglePlay]);

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

    const handleQualitySelect = useCallback((formatId: string) => {
        setSelectedFormatId(formatId);
        setShowSettings(false);
        setIsBuffering(true);
    }, []);

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

    // Fullscreen toggle with orientation lock
    const toggleFullscreen = () => {
        if (!containerRef.current) return;
        const orientation = typeof screen !== 'undefined' ? (screen.orientation as any) : null;
        if (!document.fullscreenElement) {
            containerRef.current.requestFullscreen().then(() => {
                setIsFullscreen(true);
                if (orientation && typeof orientation.lock === 'function') {
                    orientation.lock('landscape').catch(() => {});
                }
            }).catch(() => {});
        } else {
            document.exitFullscreen().then(() => {
                setIsFullscreen(false);
                if (orientation && typeof orientation.unlock === 'function') {
                    try { orientation.unlock(); } catch (_) {}
                }
            }).catch(() => {});
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



    if (failed) {
        return (
            <div style={{
                position: 'relative',
                width: '100%',
                aspectRatio: '16/9',
                backgroundColor: '#111',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '16px',
                borderRadius: '12px',
                color: '#fff',
            }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p style={{ margin: 0, fontSize: '14px', opacity: 0.7, textAlign: 'center', padding: '0 24px' }}>
                    {failReason || 'Playback failed'}
                </p>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                        onClick={() => {
                            setFailed(false);
                            setFailReason(null);
                            audioErrorHandled.current = false;
                            setRetryKey(k => k + 1);
                        }}
                        style={{
                            padding: '8px 20px',
                            borderRadius: '20px',
                            border: '1px solid rgba(255,255,255,0.3)',
                            backgroundColor: 'rgba(255,255,255,0.1)',
                            color: '#fff',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 500,
                            transition: 'background 0.2s',
                        }}
                        onMouseOver={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.2)')}
                        onMouseOut={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)')}
                    >
                        ↻ Retry
                    </button>
                    {onUseIframe && (
                        <button
                            onClick={() => onUseIframe()}
                            style={{
                                padding: '8px 20px',
                                borderRadius: '20px',
                                border: 'none',
                                backgroundColor: '#c00',
                                color: '#fff',
                                cursor: 'pointer',
                                fontSize: '13px',
                                fontWeight: 500,
                                transition: 'background 0.2s',
                            }}
                            onMouseOver={e => (e.currentTarget.style.backgroundColor = '#e00')}
                            onMouseOut={e => (e.currentTarget.style.backgroundColor = '#c00')}
                        >
                            ▶ Use YouTube
                        </button>
                    )}
                </div>
            </div>
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
            onTouchStart={() => { if (isTouchDevice()) resetHideControlsTimer(); }}
            onDoubleClick={toggleFullscreen}
        >
            {/* HTML5 Video Element (Clean, no default controls) */}
            <video
                ref={videoRef}
                key={videoId}
                className="w-full h-full cursor-pointer"
                onClick={handleVideoTap}
                autoPlay={autoplay}
                loop={loop}
                playsInline
                onError={() => {
                    const fallback = playbackInfo?.video_formats?.find(f => f.format_id !== selectedFormatId && isPlayableFormat(f));
                    if (fallback) {
                        setSelectedFormatId(fallback.format_id);
                    } else {
                        console.error('[MsePlayer] video element error, current src:', videoRef.current?.src?.slice(0, 120));
                        setFailReason('Video stream failed to load');
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
                onError={handleAudioError}
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

            {/* Center Play/Pause Splash animation button. On touchscreens it
                is the ONLY thing shown while paused (the bottom bar stays
                hidden until tapped), so a blocked-autoplay video still has a
                visible play button without the whole control bar. */}
            {!isBuffering && (showControls || (isTouchDevice() && !isPlaying)) && (
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
                    // Desktop: keep the bar visible while paused (classic
                    // player UX). Touchscreens: bar only after a tap —
                    // a paused video shows just the center play button.
                    opacity: showControls || (!isTouchDevice() && !isPlaying) ? 1 : 0,
                    pointerEvents: showControls || (!isTouchDevice() && !isPlaying) ? 'auto' : 'none',
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
                                                            justifyContent: 'space-between',
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
                                                            justifyContent: 'space-between',
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

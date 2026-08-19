'use client';

import { useEffect, useRef } from 'react';

// Media Session API — shows the video on the phone's lock screen / media
// notification with the thumbnail cover and full playback controls
// (play/pause, ±10s seek, seek bar, prev/next). Works on Android Chrome
// (installed PWA) and iOS 15+ (now-playing metadata + play/pause).
// No-op on browsers without support.

export interface UseMediaSessionOptions {
    videoId: string;
    title?: string;
    uploader?: string;
    thumbnail?: string;
    getVideo: () => HTMLVideoElement | null;
    getAudio: () => HTMLAudioElement | null;
    onNext?: () => void;
    onPrev?: () => void;
}

const SEEK_STEP_SECONDS = 10;

function mediaSessionAvailable(): boolean {
    return typeof navigator !== 'undefined' && 'mediaSession' in navigator;
}

// Build the artwork list from the video thumbnail (the notification cover).
// We supply standard square sizes (96x96 up to 512x512) alongside 4:3 and 16:9
// so the OS Media Card (Android 11+ & iOS Lock Screen) reliably places the thumbnail
// ASIDE in the album art slot, avoiding text overlaying the artwork.
function buildArtwork(videoId: string, thumbnail?: string): MediaImage[] {
    const base = thumbnail && /^https?:\/\//i.test(thumbnail)
        ? thumbnail
        : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    
    const hq = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    const mq = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
    const sd = `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`;

    return [
        { src: base, sizes: '96x96', type: 'image/jpeg' },
        { src: base, sizes: '128x128', type: 'image/jpeg' },
        { src: base, sizes: '192x192', type: 'image/jpeg' },
        { src: hq, sizes: '256x256', type: 'image/jpeg' },
        { src: hq, sizes: '384x384', type: 'image/jpeg' },
        { src: sd, sizes: '512x512', type: 'image/jpeg' },
        { src: hq, sizes: '480x360', type: 'image/jpeg' },
        { src: mq, sizes: '320x180', type: 'image/jpeg' },
    ];
}

// The element that should answer media-session commands: while the page is
// visible the <video> drives playback; when the app runs in the background
// (screen off / another app open) the <audio> element keeps playing, so the
// lock-screen / notification card must control THAT one.
function activeMedia(getVideo: () => HTMLVideoElement | null, getAudio: () => HTMLAudioElement | null): HTMLVideoElement | HTMLAudioElement | null {
    const video = getVideo();
    const audio = getAudio();
    const hidden = typeof document !== 'undefined' && document.hidden;
    if (hidden && audio && !audio.paused && !audio.ended) return audio;
    return video || audio;
}

// Attaches media-session metadata + action handlers for the given video.
// Action handlers read live refs, so they never go stale (format switches,
// separate-audio mode, video changes).
export function useMediaSession(opts: UseMediaSessionOptions) {
    const optsRef = useRef(opts);
    useEffect(() => {
        optsRef.current = opts;
    });

    // Metadata (notification cover + title/artist) — refreshed whenever the
    // video or its info changes (title/thumbnail arrive async after mount).
    useEffect(() => {
        if (!mediaSessionAvailable()) return;
        const { videoId, title, uploader, thumbnail } = optsRef.current;
        try {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: title || 'KV-Tube',
                artist: uploader || 'KV-Tube',
                album: 'KV-Tube',
                artwork: buildArtwork(videoId, thumbnail),
            });
        } catch {
            // ignore — media session metadata is best-effort
        }
    }, [opts.videoId, opts.title, opts.uploader, opts.thumbnail]);

    // Action handlers — registered once on mount.
    useEffect(() => {
        if (!mediaSessionAvailable()) return;
        const ms = navigator.mediaSession;

        const play = () => {
            const el = activeMedia(optsRef.current.getVideo, optsRef.current.getAudio);
            if (el) el.play().catch(() => {});
        };
        const pause = () => {
            const el = activeMedia(optsRef.current.getVideo, optsRef.current.getAudio);
            if (el) el.pause();
        };
        const seekBy = (delta: number) => {
            const el = activeMedia(optsRef.current.getVideo, optsRef.current.getAudio);
            if (!el) return;
            const dur = Number.isFinite(el.duration) ? el.duration : 0;
            const t = Math.max(0, Math.min(dur, el.currentTime + delta));
            el.currentTime = t;
            // Mirror the seek onto the other element so they stay in sync
            // when the page becomes visible again.
            const video = optsRef.current.getVideo();
            const audio = optsRef.current.getAudio();
            if (el !== video && video) video.currentTime = t;
            if (el !== audio && audio) audio.currentTime = t;
        };
        const seekTo = (time: number) => {
            const el = activeMedia(optsRef.current.getVideo, optsRef.current.getAudio);
            if (!el) return;
            const t = Number.isFinite(time) ? Math.max(0, time) : 0;
            el.currentTime = t;
            const video = optsRef.current.getVideo();
            const audio = optsRef.current.getAudio();
            if (el !== video && video) video.currentTime = t;
            if (el !== audio && audio) audio.currentTime = t;
        };
        const next = () => optsRef.current.onNext?.();
        const prev = () => optsRef.current.onPrev?.();

        try {
            ms.setActionHandler('play', play);
            ms.setActionHandler('pause', pause);
            ms.setActionHandler('seekbackward', () => seekBy(-SEEK_STEP_SECONDS));
            ms.setActionHandler('seekforward', () => seekBy(SEEK_STEP_SECONDS));
            ms.setActionHandler('seekto', (details) => seekTo(details.seekTime ?? 0));
            ms.setActionHandler('previoustrack', prev);
            ms.setActionHandler('nexttrack', next);
            ms.setActionHandler('stop', pause);
        } catch {
            // Older browsers throw for unsupported actions — ignore.
        }

        // Remove the handlers on unmount so a later owner of the media session
        // (e.g. the MiniPlayer) can take over instead of hitting dead refs.
        return () => {
            try {
                ms.setActionHandler('play', null);
                ms.setActionHandler('pause', null);
                ms.setActionHandler('seekbackward', null);
                ms.setActionHandler('seekforward', null);
                ms.setActionHandler('seekto', null);
                ms.setActionHandler('previoustrack', null);
                ms.setActionHandler('nexttrack', null);
                ms.setActionHandler('stop', null);
            } catch {
                // ignore
            }
        };
    }, []);
}

// Reflect play/pause state in the notification.
export function setMediaSessionPlaybackState(state: 'playing' | 'paused' | 'none') {
    if (!mediaSessionAvailable()) return;
    try {
        navigator.mediaSession.playbackState = state;
    } catch {
        // ignore
    }
}

// Keep the notification seek bar in sync with the playback position.
// Call on timeupdate (throttled by the caller if needed).
export function updateMediaSessionPosition(duration: number, playbackRate: number, position: number) {
    if (!mediaSessionAvailable()) return;
    try {
        if (typeof navigator.mediaSession.setPositionState !== 'function') return;
        navigator.mediaSession.setPositionState({
            duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
            playbackRate: playbackRate || 1,
            position: Number.isFinite(position) ? position : 0,
        });
    } catch {
        // position 0 with unknown duration throws — ignore
    }
}

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
// Multiple sizes let the browser pick the best one; hq720 is the large cover.
function buildArtwork(videoId: string, thumbnail?: string): MediaImage[] {
    const base = thumbnail && /^https?:\/\//i.test(thumbnail)
        ? thumbnail
        : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    const artwork: MediaImage[] = [
        { src: base, sizes: '480x360', type: 'image/jpeg' },
        { src: `https://i.ytimg.com/vi/${videoId}/hq720.jpg`, sizes: '1280x720', type: 'image/jpeg' },
        { src: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`, sizes: '320x180', type: 'image/jpeg' },
    ];
    return artwork;
}

// Attaches media-session metadata + action handlers for the given video.
// Action handlers read live refs, so they never go stale (format switches,
// separate-audio mode, video changes).
export function useMediaSession(opts: UseMediaSessionOptions) {
    const optsRef = useRef(opts);
    optsRef.current = opts;

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
            const video = optsRef.current.getVideo();
            if (video) video.play().catch(() => {});
            const audio = optsRef.current.getAudio();
            if (audio) audio.play().catch(() => {});
        };
        const pause = () => {
            const video = optsRef.current.getVideo();
            if (video) video.pause();
            const audio = optsRef.current.getAudio();
            if (audio) audio.pause();
        };
        const seekBy = (delta: number) => {
            const video = optsRef.current.getVideo();
            if (!video) return;
            const dur = Number.isFinite(video.duration) ? video.duration : 0;
            const t = Math.max(0, Math.min(dur, video.currentTime + delta));
            video.currentTime = t;
            const audio = optsRef.current.getAudio();
            if (audio) audio.currentTime = t;
        };
        const seekTo = (time: number) => {
            const video = optsRef.current.getVideo();
            if (!video) return;
            const t = Number.isFinite(time) ? Math.max(0, time) : 0;
            video.currentTime = t;
            const audio = optsRef.current.getAudio();
            if (audio) audio.currentTime = t;
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

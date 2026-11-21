'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { usePlayer } from '../context/PlayerContext';
import { invidious } from '../services/invidious';
import { fetchSponsorSegments, SponsorSegment, SPONSOR_CATEGORY_COLORS } from '../services/sponsorblock';
import { triggerHapticImpact } from '../utils/nativeBridge';
import { useMediaSession, setMediaSessionPlaybackState, updateMediaSessionPosition } from '../hooks/useMediaSession';
import LoadingSpinner from '../components/LoadingSpinner';
import {
  IoPlay,
  IoPause,
  IoPlaySkipForward,
  IoPlaySkipBack,
  IoVolumeHigh,
  IoVolumeMedium,
  IoVolumeLow,
  IoVolumeMute,
  IoSettingsOutline,
  IoExpand,
  IoExpandOutline,
  IoContract,
  IoRepeat,
  IoCheckmark,
  IoArrowBack,
  IoRefreshOutline,
  IoTvOutline,
  IoClose,
  IoCloseOutline,
  IoMusicalNotes,
} from 'react-icons/io5';
import { MdPictureInPictureAlt } from 'react-icons/md';

// Coarse-pointer / touchscreen detection. On phones the screen turns off and
// the browser pauses the video, so playback is handed off to a separate audio
// element. Desktop browsers keep an audible <video> playing in hidden tabs
// natively — switching to the audio element there would only silence playback.
function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    window.matchMedia?.('(pointer: coarse)').matches === true
  );
}

// iOS keeps playing the audio of a *playing* video in the background (screen
// lock / app switch). Pausing the video would kill the sound, so no audio-element
// handoff is needed there for progressive (sound-in-video) formats.
function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

interface QualityOption {
  id: string;
  label: string;
  height?: number;
  itag?: number;
  fps?: number;
  url?: string;
  hasAudio?: boolean;
}

interface CaptionOption {
  label: string;
  lang: string;
  url: string;
}

interface MaterialiousPlayerProps {
  videoId: string;
  title?: string;
  uploader?: string;
  thumbnail?: string;
  autoplay?: boolean;
  loop?: boolean;
  compact?: boolean;
  forcePaused?: boolean;
  onVideoEnd?: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  onError?: () => void;
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

function parseVideoHeight(f: any): number | null {
  if (typeof f.height === 'number' && f.height > 0) return f.height;
  if (typeof f.qualityLabel === 'string') {
    const match = f.qualityLabel.match(/(\d+)p/i);
    if (match) return parseInt(match[1], 10);
    const num = parseInt(f.qualityLabel.replace(/[^0-9]/g, ''), 10);
    if (num >= 144 && num <= 4320) return num;
  }
  if (typeof f.resolution === 'string' && f.resolution.includes('x')) {
    const parts = f.resolution.split('x');
    const h = parseInt(parts[1], 10);
    if (!isNaN(h) && h >= 144 && h <= 4320) return h;
  }
  if (typeof f.quality === 'string') {
    const match = f.quality.match(/(\d+)p/i);
    if (match) return parseInt(match[1], 10);
    const standardMap: Record<string, number> = {
      hd2160: 2160,
      hd1440: 1440,
      hd1080: 1080,
      hd720: 720,
      large: 480,
      medium: 360,
      small: 240,
      tiny: 144,
    };
    if (standardMap[f.quality]) return standardMap[f.quality];
  }
  if (f.itag) {
    const itagNum = parseInt(String(f.itag), 10);
    const itagToHeight: Record<number, number> = {
      313: 2160, 271: 1440, 137: 1080, 248: 1080, 299: 1080,
      22: 720, 136: 720, 247: 720, 298: 720,
      135: 480, 244: 480,
      18: 360, 134: 360, 243: 360,
      133: 240, 242: 240,
      160: 144, 278: 144,
    };
    if (itagToHeight[itagNum]) return itagToHeight[itagNum];
  }
  return null;
}

let cachedShakaModule: any = null;
let shakaImportPromise: Promise<any> | null = null;

function getShakaModule(): Promise<any> {
  if (cachedShakaModule) return Promise.resolve(cachedShakaModule);
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (!shakaImportPromise) {
    shakaImportPromise = import('shaka-player')
      .then((mod) => {
        const resolved = mod?.default || mod;
        if (resolved?.polyfill) {
          resolved.polyfill.installAll();
        }
        cachedShakaModule = resolved;
        return resolved;
      })
      .catch((err) => {
        console.warn('[MaterialiousPlayer] Shaka import fallback:', err);
        shakaImportPromise = null;
        return null;
      });
  }
  return shakaImportPromise;
}

if (typeof window !== 'undefined') {
  setTimeout(() => {
    void getShakaModule();
  }, 50);
}

let lastMeasuredBandwidthBps = 0;

function getInitialBandwidthEstimateBps(): number {
  if (lastMeasuredBandwidthBps >= 500_000) {
    return Math.min(45_000_000, Math.max(2_500_000, lastMeasuredBandwidthBps));
  }
  if (typeof window !== 'undefined') {
    try {
      const saved = parseInt(localStorage.getItem('kv_abr_bw_bps') || '0', 10);
      if (saved >= 500_000) {
        lastMeasuredBandwidthBps = saved;
        return Math.min(45_000_000, Math.max(2_500_000, saved));
      }
    } catch {}
    const navConn = (navigator as any)?.connection;
    if (navConn && typeof navConn.downlink === 'number' && navConn.downlink > 0) {
      const connBps = Math.round(navConn.downlink * 1_000_000);
      return Math.min(35_000_000, Math.max(2_500_000, connBps));
    }
  }
  return 8_000_000;
}

function recordMeasuredBandwidthBps(bwBps?: number): void {
  if (typeof bwBps !== 'number' || !isFinite(bwBps) || bwBps < 300_000) return;
  const clamped = Math.round(Math.min(80_000_000, bwBps));
  lastMeasuredBandwidthBps = clamped;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('kv_abr_bw_bps', String(clamped));
    } catch {}
  }
}

function findBestShakaVariantTrack(
  tracks: any[],
  targetHeight: number,
  targetFps?: number,
  maxBandwidthBps?: number
): any | null {
  if (!Array.isArray(tracks) || tracks.length === 0) return null;
  const valid = tracks.filter((t: any) => typeof t.height === 'number' && t.height > 0);
  if (valid.length === 0) return tracks[0];

  let pool = valid;
  if (maxBandwidthBps && maxBandwidthBps > 0) {
    const affordable = valid.filter(
      (t: any) => (t.bandwidth || t.videoBandwidth || 0) <= maxBandwidthBps * 0.92
    );
    if (affordable.length > 0) pool = affordable;
  }

  let minDiff = Infinity;
  for (const t of pool) {
    const diff = Math.abs(t.height - targetHeight);
    if (diff < minDiff) minDiff = diff;
  }

  const closest = pool.filter((t: any) => Math.abs(t.height - targetHeight) === minDiff);
  closest.sort((a: any, b: any) => {
    if (targetFps) {
      const aFpsMatch = Math.round(a.frameRate || 30) === targetFps ? 1 : 0;
      const bFpsMatch = Math.round(b.frameRate || 30) === targetFps ? 1 : 0;
      if (aFpsMatch !== bFpsMatch) return bFpsMatch - aFpsMatch;
    }
    const fpsDiff = (b.frameRate || 30) - (a.frameRate || 30);
    if (Math.abs(fpsDiff) > 5) return fpsDiff;
    const vBwDiff =
      (b.videoBandwidth || b.bandwidth || 0) - (a.videoBandwidth || a.bandwidth || 0);
    if (vBwDiff !== 0) return vBwDiff;
    return (b.audioBandwidth || 0) - (a.audioBandwidth || 0);
  });

  return closest[0] || valid[0];
}

function getBufferedAheadSeconds(vid: HTMLVideoElement): number {
  const cur = vid.currentTime;
  for (let i = 0; i < vid.buffered.length; i++) {
    if (vid.buffered.start(i) <= cur + 0.1 && cur <= vid.buffered.end(i)) {
      return Math.max(0, vid.buffered.end(i) - cur);
    }
  }
  return 0;
}

function switchShakaTrackSmoothly(player: any, vid: HTMLVideoElement, targetTrack: any): void {
  if (!player || !targetTrack) return;
  const bufferedAhead = getBufferedAheadSeconds(vid);
  // Keep at least 2.2s - 3.5s (approx two segments / GOPs) of already-buffered frames in the
  // MSE SourceBuffer ahead of playhead so the decoder never underruns and never shows a black screen.
  // If less than 2.4s is buffered ahead, switch without clearing the current buffer at all.
  if (!vid.paused && bufferedAhead >= 2.4) {
    const safeMargin = Math.min(3.8, Math.max(2.2, bufferedAhead * 0.65));
    player.selectVariantTrack(targetTrack, true, safeMargin);
  } else {
    player.selectVariantTrack(targetTrack, false);
  }
}

export default function MaterialiousPlayer({
  videoId,
  title,
  uploader,
  thumbnail,
  autoplay = true,
  loop = false,
  compact = false,
  forcePaused = false,
  onVideoEnd,
  onNext,
  onPrev,
  onError,
}: MaterialiousPlayerProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTimeParam = parseFloat(searchParams.get('t') || '0');
  const {
    setPlayingVideo,
    setIsPlaying: setGlobalIsPlaying,
    setCurrentTime: setGlobalCurrentTime,
    currentTime: contextCurrentTime,
    closeMiniPlayer,
  } = usePlayer();

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const frameFreezeCanvasRef = useRef<HTMLCanvasElement>(null);
  const shakaPlayerRef = useRef<any>(null);
  const usingProgressiveRef = useRef<boolean>(false);
  const triedLatestVersionFallbackRef = useRef<boolean>(false);
  const playbackStartedRef = useRef<boolean>(false);
  const isSwitchingQualityRef = useRef<boolean>(false);
  const lastAbrCheckTimeRef = useRef<number>(0);
  const qualityTierRef = useRef<'auto' | 'highest' | 'low' | 'custom'>('auto');
  const videoDataRef = useRef<any>(null);
  const scrubberRef = useRef<HTMLDivElement>(null);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 });

  // Playback state
  const [isPlaying, setIsPlaying] = useState(autoplay);
  const [currentTime, setCurrentTime] = useState(initialTimeParam > 0 ? initialTimeParam : 0);

  // Reset timestamp whenever the video ID changes (a genuinely new video) unless
  // ?t= is provided in the URL. Deliberately ignores the ?t= param when the SAME
  // video continues (e.g. expand mini -> full) so playback never jumps.
  useEffect(() => {
    const startPos = initialTimeParam > 0 ? initialTimeParam : 0;
    setCurrentTime(startPos);
    setGlobalCurrentTime(startPos);
  }, [videoId, setGlobalCurrentTime]);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isBuffering, setIsBuffering] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isLooping, setIsLooping] = useState(loop);

  // Keep the loop toggle in sync with the watch-page pill (loopMode in context)
  useEffect(() => {
    setIsLooping(loop);
  }, [loop]);

  // When the engine is parked offscreen (no full/mini slot active), pause the
  // video so hidden playback stops. This is separate from the internal play/pause
  // toggle — it only ever pauses; it never auto-resumes.
  useEffect(() => {
    if (!forcePaused) return;
    const video = videoRef.current;
    const audio = audioRef.current;
    video?.pause();
    audio?.pause();
  }, [forcePaused]);

  // Audio Sync for High-Res Formats
  const [needsSeparateAudio, setNeedsSeparateAudio] = useState(false);
  const [bestAudioUrl, setBestAudioUrl] = useState<string>('');

  // Settings & Menus
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'main' | 'quality' | 'speed' | 'subtitles'>('main');
  const [qualities, setQualities] = useState<QualityOption[]>([]);
  const [currentQuality, setCurrentQuality] = useState<string>('Auto');
  const [qualityTier, setQualityTier] = useState<'auto' | 'highest' | 'low' | 'custom'>('auto');
  const [activeStreamHeight, setActiveStreamHeight] = useState<number>(0);
  const [activeStreamFps, setActiveStreamFps] = useState<number>(0);
  const [estimatedMbps, setEstimatedMbps] = useState<number>(0);
  const [hasFrozenFrame, setHasFrozenFrame] = useState<boolean>(false);
  const [showAdvancedQualities, setShowAdvancedQualities] = useState(false);

  useEffect(() => {
    qualityTierRef.current = qualityTier;
  }, [qualityTier]);

  const captureCurrentVideoFrame = useCallback(() => {
    const vid = videoRef.current;
    const canvas = frameFreezeCanvasRef.current;
    if (!vid || !canvas || vid.readyState < 2 || !vid.videoWidth || !vid.videoHeight) return;
    try {
      canvas.width = vid.videoWidth;
      canvas.height = vid.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
        setHasFrozenFrame(true);
      }
    } catch {}
  }, []);

  const syncActiveShakaStats = useCallback((player: any) => {
    if (!player) return;
    try {
      const tracks = player.getVariantTracks?.() || [];
      const active = tracks.find((t: any) => t.active);
      if (active?.height) {
        setActiveStreamHeight(active.height);
        setActiveStreamFps(active.frameRate ? Math.round(active.frameRate) : 0);
      }
      const stats = player.getStats?.();
      const bw = stats?.estimatedBandwidth || player.getBandwidthEstimate?.() || 0;
      if (bw > 0) {
        recordMeasuredBandwidthBps(bw);
        setEstimatedMbps(Math.round((bw / 1_000_000) * 10) / 10);
      }
    } catch {}
  }, []);
  const [captions, setCaptions] = useState<CaptionOption[]>([]);
  const [currentCaption, setCurrentCaption] = useState<string>('off');
  const [activeCaptionUrl, setActiveCaptionUrl] = useState<string | null>(null);

  // Gestures & Toasts
  const [seekRipple, setSeekRipple] = useState<{ side: 'left' | 'right'; text: string } | null>(null);
  const [sponsorSegments, setSponsorSegments] = useState<SponsorSegment[]>([]);
  const [sponsorToast, setSponsorToast] = useState<{ text: string; segment: SponsorSegment } | null>(null);
  const [lastSkippedSegment, setLastSkippedSegment] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  // 1. Fetch SponsorBlock segments (deferred slightly so initial stream manifest & segments take priority)
  useEffect(() => {
    if (!videoId) return;
    const timer = setTimeout(() => {
      fetchSponsorSegments(videoId)
        .then((segs) => setSponsorSegments(segs || []))
        .catch(() => setSponsorSegments([]));
    }, 400);
    return () => clearTimeout(timer);
  }, [videoId]);

  // 2. MediaSession hook for background / lockscreen controls
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

  // 3. Initialize Video / Shaka / Invidious Stream Loader
  useEffect(() => {
    let isCancelled = false;
    const video = videoRef.current;
    if (!video || !videoId) return;

    usingProgressiveRef.current = false;
    triedLatestVersionFallbackRef.current = false;
    playbackStartedRef.current = false;
    isSwitchingQualityRef.current = false;
    setHasFrozenFrame(false);
    setActiveStreamHeight(0);
    setActiveStreamFps(0);
    setDataLoaded(false);
    setErrorMsg(null);
    setIsBuffering(true);
    if (qualityTierRef.current === 'auto') {
      setCurrentQuality('Auto');
    }

    function hydrateMetadataAndQualities(videoData: any, activePlayer?: any) {
      if (isCancelled || !videoData) return;
      videoDataRef.current = videoData;

      if (Array.isArray(videoData?.captions)) {
        const validCaps: CaptionOption[] = videoData.captions.map((c: any) => ({
          label: c.label || c.name || c.language || 'English',
          lang: c.languageCode || c.lang || 'en',
          url: invidious.proxyUrl(c.url),
        }));
        setCaptions(validCaps);
      }

      const formatStreams = Array.isArray(videoData?.formatStreams) ? videoData.formatStreams : [];
      const adaptiveFormats = Array.isArray(videoData?.adaptiveFormats) ? videoData.adaptiveFormats : [];

      const audioFormat =
        adaptiveFormats.find((f: any) => f.type?.includes('audio/mp4') || f.mimeType?.includes('audio/mp4')) ||
        adaptiveFormats.find((f: any) => f.type?.includes('audio') || f.mimeType?.includes('audio')) ||
        adaptiveFormats[0];

      const extractedAudioUrl = audioFormat?.url
        ? invidious.proxyUrl(audioFormat.url)
        : `/api/invidious/latest_version?id=${videoId}&itag=140`;

      setBestAudioUrl(extractedAudioUrl);

      const qualList: QualityOption[] = [{ id: 'auto', label: 'Auto (Best)' }];
      const seenHeights = new Set<number>();
      const seenIds = new Set<string>(['auto']);

      // 1. Prefer live Shaka variant tracks first when MSE is active so all listed resolutions exist in DASH
      if (activePlayer) {
        try {
          const vTracks = activePlayer.getVariantTracks?.() || [];
          for (const t of vTracks) {
            if (t.height && t.height >= 144 && !seenHeights.has(t.height)) {
              const entryId = `shaka_${t.id || t.height}`;
              if (seenIds.has(entryId)) continue;
              seenHeights.add(t.height);
              seenIds.add(entryId);
              const tag =
                t.height >= 2160
                  ? ' (4K)'
                  : t.height >= 1440
                  ? ' (2K)'
                  : t.height >= 1080
                  ? ' (Full HD)'
                  : t.height >= 720
                  ? ' (HD)'
                  : '';
              qualList.push({
                id: entryId,
                label: `${t.height}p${t.frameRate && t.frameRate > 30 ? Math.round(t.frameRate) : ''}${tag}`,
                height: t.height,
                fps: t.frameRate,
                hasAudio: true,
              });
            }
          }
          syncActiveShakaStats(activePlayer);
        } catch {}
      }

      for (const f of formatStreams) {
        const isAudio = f.type?.includes('audio') || f.mimeType?.includes('audio');
        if (isAudio) continue;
        const h = parseVideoHeight(f);
        if (h && h >= 144 && !seenHeights.has(h)) {
          const entryId = String(f.itag || f.format_id || `prog_${h}`);
          if (seenIds.has(entryId)) continue;
          seenHeights.add(h);
          seenIds.add(entryId);
          const tag = h >= 1080 ? ' (Full HD)' : h >= 720 ? ' (HD)' : '';
          qualList.push({
            id: entryId,
            label: `${h}p${tag}`,
            height: h,
            itag: f.itag,
            fps: f.fps,
            url: f.url,
            hasAudio: true,
          });
        }
      }

      for (const f of adaptiveFormats) {
        const isAudio =
          f.type?.includes('audio') ||
          f.mimeType?.includes('audio') ||
          f.audioQuality ||
          (!f.qualityLabel && !f.height && !f.fps && !f.resolution);
        if (isAudio) continue;

        const h = parseVideoHeight(f);
        if (h && h >= 144 && !seenHeights.has(h)) {
          const entryId = String(f.itag || f.format_id || `adapt_${h}`);
          if (seenIds.has(entryId)) continue;
          seenHeights.add(h);
          seenIds.add(entryId);
          const tag = h >= 2160 ? ' (4K)' : h >= 1440 ? ' (2K)' : h >= 1080 ? ' (Full HD)' : h >= 720 ? ' (HD)' : '';
          qualList.push({
            id: entryId,
            label: `${h}p${f.fps && f.fps > 30 ? f.fps : ''}${tag}`,
            height: h,
            itag: f.itag,
            fps: f.fps,
            url: f.url,
            hasAudio: false,
          });
        }
      }

      // Only add fallback standard tiers if no real tracks were discovered
      if (seenHeights.size === 0) {
        const standardTiers = [
          { height: 1080, itag: 137, label: '1080p (Full HD)' },
          { height: 720, itag: 22, label: '720p (HD)' },
          { height: 480, itag: 135, label: '480p (SD)' },
          { height: 360, itag: 18, label: '360p' },
          { height: 240, itag: 133, label: '240p' },
        ];
        for (const tier of standardTiers) {
          if (!seenHeights.has(tier.height)) {
            const entryId = `std_${tier.itag}_${tier.height}`;
            if (seenIds.has(entryId)) continue;
            seenHeights.add(tier.height);
            seenIds.add(entryId);
            qualList.push({
              id: entryId,
              label: tier.label,
              height: tier.height,
              itag: tier.itag,
              hasAudio: tier.height <= 720,
            });
          }
        }
      }

      qualList.sort((a, b) => (b.height || 0) - (a.height || 0));
      setQualities(qualList);
    }

    async function loadStream(attempt = 1) {
      try {
        const vid = videoRef.current;
        if (!vid) return;

        // Kick off metadata fetch and Shaka module lookup in parallel at t=0ms
        // so DASH manifest loading never waits for /api/v1/videos/:id!
        const videoDataPromise = invidious.getVideo(videoId);
        const shakaModule = await getShakaModule();
        if (isCancelled) return;

        if (shakaModule && shakaModule.Player && shakaModule.Player.isBrowserSupported()) {
          if (shakaPlayerRef.current) {
            await shakaPlayerRef.current.destroy().catch(() => {});
            shakaPlayerRef.current = null;
          }
          const player = new shakaModule.Player(vid);
          shakaPlayerRef.current = player;

          player.getNetworkingEngine()?.registerRequestFilter((_type: any, request: any) => {
            if (Array.isArray(request?.uris)) {
              request.uris = request.uris.map((uri: string) => invidious.proxyUrl(uri));
            }
          });

          const onShakaAdaptation = () => {
            if (!isCancelled) {
              syncActiveShakaStats(player);
            }
          };
          player.addEventListener('adaptation', onShakaAdaptation);
          player.addEventListener('variantchanged', onShakaAdaptation);

          // Configure Shaka for sub-second first-frame startup + fast, smooth bandwidth ABR
          player.configure({
            manifest: {
              dash: {
                ignoreMinBufferTime: true,
              },
            },
            streaming: {
              rebufferingGoal: 0.5,
              bufferingGoal: 14,
              bufferBehind: 20,
              segmentPrefetchLimit: 2,
              retryParameters: {
                maxAttempts: 3,
                baseDelay: 400,
                backoffFactor: 1.5,
              },
            },
            abr: {
              enabled: qualityTierRef.current === 'auto',
              useNetworkInformation: true,
              defaultBandwidthEstimate: getInitialBandwidthEstimateBps(),
              switchInterval: 2,
              minTimeToSwitch: 0.5,
              bandwidthUpgradeTarget: 0.9,
              bandwidthDowngradeTarget: 0.95,
              clearBufferSwitch: true,
              safeMarginSwitch: 3.0,
              restrictToElementSize: false,
              restrictToScreenSize: false,
              ignoreDevicePixelRatio: false,
              advanced: {
                fastHalfLife: 1.2,
                slowHalfLife: 2.5,
                minBytes: 8_000,
                minTotalBytes: 32_000,
              },
            },
          });

          // 1. Immediately load predictable DASH manifest URL in parallel with getVideo()
          const predictableDashUrl = `/api/invidious/api/manifest/dash/id/${encodeURIComponent(videoId)}`;
          try {
            await player.load(predictableDashUrl);
            if (isCancelled) return;
            usingProgressiveRef.current = false;
            setNeedsSeparateAudio(false);

            // Populate initial Shaka variant tracks immediately
            const vTracks = player.getVariantTracks();
            if (Array.isArray(vTracks) && vTracks.length > 0) {
              const quickQuals: QualityOption[] = [{ id: 'auto', label: 'Auto (Best)' }];
              const seenH = new Set<number>();
              for (const t of vTracks) {
                if (t.height && t.height >= 144 && !seenH.has(t.height)) {
                  seenH.add(t.height);
                  const tag = t.height >= 2160 ? ' (4K)' : t.height >= 1440 ? ' (2K)' : t.height >= 1080 ? ' (Full HD)' : t.height >= 720 ? ' (HD)' : '';
                  quickQuals.push({
                    id: `shaka_${t.id || t.height}`,
                    label: `${t.height}p${t.frameRate && t.frameRate > 30 ? Math.round(t.frameRate) : ''}${tag}`,
                    height: t.height,
                    fps: t.frameRate,
                    hasAudio: true,
                  });
                }
              }
              quickQuals.sort((a, b) => (b.height || 0) - (a.height || 0));
              setQualities(quickQuals);

              // Apply user's selected quality tier or initial bandwidth-matched auto track
              if (qualityTierRef.current === 'highest') {
                player.configure({ abr: { enabled: false } });
                const best = findBestShakaVariantTrack(vTracks, 4320);
                if (best) player.selectVariantTrack(best, false);
              } else if (qualityTierRef.current === 'low') {
                player.configure({ abr: { enabled: false } });
                const low = findBestShakaVariantTrack(vTracks, 360);
                if (low) player.selectVariantTrack(low, false);
              }
            }

            syncActiveShakaStats(player);

            if (autoplay) vid.play().catch(() => {});
            setIsBuffering(false);

            // Hydrate captions, audio URL, and full quality list once videoData resolves
            videoDataPromise
              .then((vData) => hydrateMetadataAndQualities(vData, player))
              .catch(() => {});
            return;
          } catch (dashErr) {
            console.warn('[MaterialiousPlayer] Fast-path Shaka DASH load failed, checking videoData fallbacks:', dashErr);
          }
        }

        // Fallback path: wait for videoData if fast-path DASH did not succeed
        const videoData: any = await videoDataPromise;
        if (isCancelled) return;
        hydrateMetadataAndQualities(videoData, shakaPlayerRef.current);

        const formatStreams = Array.isArray(videoData?.formatStreams) ? videoData.formatStreams : [];
        const hlsManifest = videoData?.hlsUrl;

        if (shakaPlayerRef.current && hlsManifest) {
          try {
            const hlsUrl = invidious.proxyUrl(hlsManifest);
            await shakaPlayerRef.current.load(hlsUrl);
            if (isCancelled) return;
            usingProgressiveRef.current = false;
            setNeedsSeparateAudio(false);
            if (autoplay) vid.play().catch(() => {});
            setIsBuffering(false);
            return;
          } catch (hlsErr) {
            console.warn('[MaterialiousPlayer] Shaka HLS load failed, trying progressive stream:', hlsErr);
          }
        }

        if (shakaPlayerRef.current) {
          await shakaPlayerRef.current.destroy().catch(() => {});
          shakaPlayerRef.current = null;
        }

        // Direct Progressive Format Streams (720p/360p MP4) Fallback
        const progressive = formatStreams.find((f: any) => f.url && f.container === 'mp4') || formatStreams[0];
        if (progressive?.url) {
          const directUrl = invidious.proxyUrl(progressive.url);
          usingProgressiveRef.current = true;
          setNeedsSeparateAudio(false);
          vid.src = directUrl;
          vid.load();
          if (autoplay) vid.play().catch(() => {});
          setIsBuffering(false);
          return;
        }

        // Invidious Latest Version stream URL fallback
        const itag = formatStreams[0]?.itag || 18;
        usingProgressiveRef.current = true;
        if (Number(itag) === 18) {
          triedLatestVersionFallbackRef.current = true;
        }
        setNeedsSeparateAudio(false);
        vid.src = `/api/invidious/latest_version?id=${videoId}&itag=${itag}`;
        vid.load();
        if (autoplay) vid.play().catch(() => {});
        setIsBuffering(false);
      } catch (err: any) {
        if (isCancelled) return;
        if (attempt < 3) {
          const delay = attempt * 1500;
          console.warn(`[MaterialiousPlayer] Stream load attempt ${attempt} failed, retrying in ${delay}ms...`, err);
          setTimeout(() => {
            if (!isCancelled) {
              loadStream(attempt + 1);
            }
          }, delay);
          return;
        }
        console.error('[MaterialiousPlayer] Stream load error after all attempts:', err);
        setErrorMsg('Unable to load video stream from Invidious.');
        setIsBuffering(false);
      }
    }

    loadStream();

    return () => {
      isCancelled = true;
      if (shakaPlayerRef.current) {
        shakaPlayerRef.current.destroy().catch(() => {});
        shakaPlayerRef.current = null;
      }
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
        audioRef.current.load();
      }
    };
  }, [videoId, autoplay]);

  // 4. Video & Synchronized Audio Event Listeners
  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video) return;

    const onPlay = () => {
      setIsPlaying(true);
      setGlobalIsPlaying(true);
      setMediaSessionPlaybackState('playing');
      const dur = video.duration || duration || 0;
      if (dur > 0) {
        updateMediaSessionPosition(dur, video.playbackRate || playbackRate || 1, video.currentTime);
      }
      if (needsSeparateAudio && audio && audio.paused) {
        audio.play().catch(() => {});
      }
      if (videoId) {
        setPlayingVideo({
          id: videoId,
          title: title || 'Video',
          uploader: uploader || 'Creator',
          thumbnail: thumbnail,
        });
      }
    };

    const onPause = () => {
      setIsPlaying(false);
      setGlobalIsPlaying(false);
      setMediaSessionPlaybackState('paused');
      const dur = video.duration || duration || 0;
      if (dur > 0) {
        updateMediaSessionPosition(dur, video.playbackRate || playbackRate || 1, video.currentTime);
      }
      if (audio && !audio.paused) {
        audio.pause();
      }
    };

    const onTimeUpdate = () => {
      const cur = video.currentTime;
      setCurrentTime(cur);
      setGlobalCurrentTime(cur);

      // PLL Soft Rate Steering: Sync video clock smoothly to audio clock without popping audio decoder
      if (needsSeparateAudio && audio && !audio.paused && !video.paused) {
        const drift = video.currentTime - audio.currentTime;
        if (Math.abs(drift) > 1.2) {
          // Significant drift: soft alignment
          video.currentTime = audio.currentTime;
          video.playbackRate = playbackRate;
        } else if (drift > 0.05) {
          // Video is slightly ahead: gently slow down video
          video.playbackRate = Math.max(0.25, playbackRate * 0.95);
        } else if (drift < -0.05) {
          // Video is slightly behind: gently speed up video
          video.playbackRate = playbackRate * 1.05;
        } else {
          // Perfectly synchronized (< 50ms): standard playback rate
          if (video.playbackRate !== playbackRate) {
            video.playbackRate = playbackRate;
          }
        }
      }

      // Buffered calculation
      if (video.buffered.length > 0) {
        for (let i = 0; i < video.buffered.length; i++) {
          if (video.buffered.start(i) <= cur && cur <= video.buffered.end(i)) {
            setBuffered(video.buffered.end(i));
            break;
          }
        }
      }

      // Proactive Bandwidth-Based Resolution Upscaling (ABR) & Active Resolution Telemetry
      const now = Date.now();
      if (shakaPlayerRef.current && now - lastAbrCheckTimeRef.current > 2200) {
        lastAbrCheckTimeRef.current = now;
        const player = shakaPlayerRef.current;
        syncActiveShakaStats(player);

        if (qualityTierRef.current === 'auto' && !video.paused) {
          try {
            const stats = player.getStats?.();
            const estimatedBw =
              stats?.estimatedBandwidth ||
              player.getBandwidthEstimate?.() ||
              getInitialBandwidthEstimateBps();
            const bufferedAhead = getBufferedAheadSeconds(video);
            const tracks = player.getVariantTracks?.() || [];
            const activeTrack = tracks.find((t: any) => t.active);

            if (estimatedBw > 0 && bufferedAhead >= 2.2 && tracks.length > 1) {
              const bestAffordable = findBestShakaVariantTrack(
                tracks,
                4320,
                undefined,
                estimatedBw * 0.94
              );
              const activeHeight = activeTrack?.height || 0;
              const activeBw = activeTrack?.bandwidth || activeTrack?.videoBandwidth || 0;
              const targetHeight = bestAffordable?.height || 0;
              const targetBw = bestAffordable?.bandwidth || bestAffordable?.videoBandwidth || 0;

              if (
                bestAffordable &&
                (targetHeight > activeHeight ||
                  (targetHeight === activeHeight && targetBw > activeBw * 1.15))
              ) {
                isSwitchingQualityRef.current = true;
                switchShakaTrackSmoothly(player, video, bestAffordable);
                player.configure({ abr: { enabled: true } });
                syncActiveShakaStats(player);
                setTimeout(() => {
                  isSwitchingQualityRef.current = false;
                }, 1800);
              }
            }
          } catch {}
        }
      }

      const dur = video.duration || duration || 0;
      if (dur > 0) {
        updateMediaSessionPosition(dur, video.playbackRate || playbackRate || 1, cur);
      }

      // SponsorBlock segment detection & skip
      if (sponsorSegments.length > 0) {
        for (let i = 0; i < sponsorSegments.length; i++) {
          const seg = sponsorSegments[i];
          const [start, end] = seg.segment;
          if (cur >= start && cur < end - 0.5) {
            if (lastSkippedSegment !== i) {
              setLastSkippedSegment(i);
              triggerHapticImpact();
              video.currentTime = end;
              if (needsSeparateAudio && audio) audio.currentTime = end;
              const catName = seg.category.replace(/_/g, ' ');
              setSponsorToast({
                text: `Skipped ${catName} (${formatTime(start)} - ${formatTime(end)})`,
                segment: seg,
              });
              setTimeout(() => setSponsorToast(null), 4000);
            }
            break;
          }
        }
      }
    };

    const onDurationChange = () => {
      const dur = video.duration || 0;
      setDuration(dur);
      if (dur > 0) {
        updateMediaSessionPosition(dur, video.playbackRate || playbackRate || 1, video.currentTime);
      }
    };
    const onWaiting = () => {
      // Never flash the full-screen buffering overlay during a seamless quality transition
      if (isSwitchingQualityRef.current || getBufferedAheadSeconds(video) > 0.35) {
        return;
      }
      setIsBuffering(true);
      if (needsSeparateAudio && audio) audio.pause();
    };
    const onStalled = () => {
      if (isSwitchingQualityRef.current || getBufferedAheadSeconds(video) > 0.35) {
        return;
      }
      setIsBuffering(true);
    };
    const onPlaying = () => {
      playbackStartedRef.current = true;
      isSwitchingQualityRef.current = false;
      setHasFrozenFrame(false);
      setIsBuffering(false);
      setMediaSessionPlaybackState('playing');
      const dur = video.duration || duration || 0;
      if (dur > 0) {
        updateMediaSessionPosition(dur, video.playbackRate || playbackRate || 1, video.currentTime);
      }
      if (needsSeparateAudio && audio && audio.paused && isPlaying) audio.play().catch(() => {});
    };
    const onCanPlay = () => {
      isSwitchingQualityRef.current = false;
      setHasFrozenFrame(false);
      setIsBuffering(false);
      const targetTime = initialTimeParam > 0 ? initialTimeParam : 0;
      if (targetTime > 0 && Math.abs(video.currentTime - targetTime) > 2) {
        video.currentTime = targetTime;
        if (needsSeparateAudio && audio) audio.currentTime = targetTime;
      }
    };

    const onEnded = () => {
      if (isLooping) {
        video.currentTime = 0;
        if (needsSeparateAudio && audio) audio.currentTime = 0;
        video.play().catch(() => {});
      } else if (onVideoEnd) {
        onVideoEnd();
      }
    };

    const onAudioTimeUpdate = () => {
      if (audio && (document.hidden || bgAudioOnlyRef.current)) {
        const cur = audio.currentTime;
        setCurrentTime(cur);
        setGlobalCurrentTime(cur);
        const dur = audio.duration || video.duration || duration || 0;
        if (dur > 0) {
          updateMediaSessionPosition(dur, audio.playbackRate || playbackRate || 1, cur);
        }
      }
    };
    const onAudioPlay = () => {
      if (audio && (document.hidden || bgAudioOnlyRef.current)) {
        setMediaSessionPlaybackState('playing');
        const dur = audio.duration || video.duration || duration || 0;
        if (dur > 0) {
          updateMediaSessionPosition(dur, audio.playbackRate || playbackRate || 1, audio.currentTime);
        }
      }
    };
    const onAudioPause = () => {
      if (audio && (document.hidden || bgAudioOnlyRef.current)) {
        setMediaSessionPlaybackState('paused');
        const dur = audio.duration || video.duration || duration || 0;
        if (dur > 0) {
          updateMediaSessionPosition(dur, audio.playbackRate || playbackRate || 1, audio.currentTime);
        }
      }
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('ended', onEnded);

    if (audio) {
      audio.addEventListener('timeupdate', onAudioTimeUpdate);
      audio.addEventListener('play', onAudioPlay);
      audio.addEventListener('pause', onAudioPause);
    }

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('ended', onEnded);

      if (audio) {
        audio.removeEventListener('timeupdate', onAudioTimeUpdate);
        audio.removeEventListener('play', onAudioPlay);
        audio.removeEventListener('pause', onAudioPause);
      }
    };
  }, [sponsorSegments, lastSkippedSegment, isLooping, onVideoEnd, needsSeparateAudio]);

  // 5. Controls Auto-Hide
  const resetControlsTimer = useCallback((delay: number = 2500) => {
    if (compact) return;
    setShowControls(true);
    if (hideControlsTimer.current) {
      clearTimeout(hideControlsTimer.current);
      hideControlsTimer.current = null;
    }
    if (isPlaying && !showSettings) {
      hideControlsTimer.current = setTimeout(() => {
        if (!showSettings) {
          setShowControls(false);
        }
      }, delay);
    }
  }, [isPlaying, showSettings, compact]);

  // Auto-hide controls when video starts/resumes playing, or keep them open when paused/settings open
  useEffect(() => {
    if (isPlaying && !showSettings) {
      resetControlsTimer(2500);
    } else {
      setShowControls(true);
      if (hideControlsTimer.current) {
        clearTimeout(hideControlsTimer.current);
        hideControlsTimer.current = null;
      }
    }
    return () => {
      if (hideControlsTimer.current) {
        clearTimeout(hideControlsTimer.current);
        hideControlsTimer.current = null;
      }
    };
  }, [isPlaying, showSettings, resetControlsTimer]);

  const bgAudioOnlyRef = useRef(false);

  // Background playback handoff for PWA / mobile screen-off / app switching.
  // Only needed on touch devices — desktop browsers keep an audible video
  // playing in hidden tabs on their own.
  const startBackgroundAudio = useCallback(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !audio || !bestAudioUrl) return;
    if (!isTouchDevice()) return;
    if (isIOS() && !needsSeparateAudio) return;
    if (bgAudioOnlyRef.current) return;
    if (video.paused && !isPlaying) return;

    const audioSrc = bestAudioUrl.startsWith('http') || bestAudioUrl.startsWith('/')
      ? bestAudioUrl
      : `/api/invidious${bestAudioUrl}`;

    if (audio.src !== audioSrc && !audio.src.endsWith(audioSrc)) {
      audio.src = audioSrc;
      audio.load();
    }
    audio.currentTime = video.currentTime;
    audio.volume = isMuted ? 0 : volume;
    audio.muted = isMuted;
    audio.playbackRate = playbackRate;
    audio.loop = isLooping;

    bgAudioOnlyRef.current = true;
    setMediaSessionPlaybackState('playing');

    audio.play().catch((err) => {
      console.warn('[MaterialiousPlayer] Background audio start:', err);
    });

    if (!video.paused) {
      video.pause();
    }
  }, [bestAudioUrl, isPlaying, isMuted, volume, playbackRate, isLooping, needsSeparateAudio]);

  useEffect(() => {
    const onVisibility = () => {
      const video = videoRef.current;
      const audio = audioRef.current;
      if (!video || !audio) return;

      if (document.hidden) {
        // Tab went to background / phone locked
        if (isPlaying) {
          startBackgroundAudio();
        }
      } else if (bgAudioOnlyRef.current) {
        // Tab returned to foreground
        const userPausedInBg = audio.paused;
        bgAudioOnlyRef.current = false;

        if (userPausedInBg) {
          if (!needsSeparateAudio) {
            audio.pause();
          }
          setMediaSessionPlaybackState('paused');
          setIsPlaying(false);
          return;
        }

        if (video.paused) {
          video.currentTime = audio.currentTime;
          video.volume = isMuted ? 0 : volume;
          video.muted = isMuted;
          video.play().catch(() => {});
          setIsPlaying(true);
        }

        if (!needsSeparateAudio) {
          audio.pause();
        }
        setMediaSessionPlaybackState('playing');
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [startBackgroundAudio, isPlaying, needsSeparateAudio, isMuted, volume]);

  // Unlock iOS audio context on first touch
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let unlocked = false;
    const unlock = () => {
      if (unlocked) return;
      unlocked = true;
      const audio = audioRef.current;
      if (audio && !audio.src) {
        audio.play().then(() => audio.pause()).catch(() => {});
      }
    };
    container.addEventListener('pointerdown', unlock, { once: true });
    return () => container.removeEventListener('pointerdown', unlock);
  }, []);

  // 6. User Actions: Quality, Speed, Seeking, Subtitles
  const handleQualityChange = useCallback(
    (q: QualityOption, customLabel?: string) => {
      setCurrentQuality(customLabel || (q.id === 'auto' ? 'Auto' : q.label));
      setShowSettings(false);

      const vid = videoRef.current;
      const aud = audioRef.current;
      if (!vid) return;

      const curTime = vid.currentTime;
      const wasPlaying = !vid.paused;

      // 1. If Shaka Player MSE instance is active: switch variant track smoothly in-place
      // without ever destroying MediaSource or calling vid.load() (zero black screen)
      if (shakaPlayerRef.current) {
        const player = shakaPlayerRef.current;
        try {
          isSwitchingQualityRef.current = true;
          setTimeout(() => {
            isSwitchingQualityRef.current = false;
          }, 2200);

          const tracks = player.getVariantTracks?.() || [];
          if (q.id === 'auto') {
            player.configure({
              abr: {
                enabled: true,
                restrictions: { minHeight: 144, maxHeight: Infinity },
              },
            });
            if (Array.isArray(tracks) && tracks.length > 0) {
              const stats = player.getStats?.();
              const estimatedBw =
                stats?.estimatedBandwidth ||
                player.getBandwidthEstimate?.() ||
                getInitialBandwidthEstimateBps();
              const bestAutoTrack = findBestShakaVariantTrack(
                tracks,
                4320,
                undefined,
                estimatedBw * 0.94
              );
              if (bestAutoTrack) {
                switchShakaTrackSmoothly(player, vid, bestAutoTrack);
                player.configure({ abr: { enabled: true } });
              }
            }
            syncActiveShakaStats(player);
            setNeedsSeparateAudio(false);
            if (aud) aud.pause();
            return;
          }

          player.configure({ abr: { enabled: false } });
          if (Array.isArray(tracks) && tracks.length > 0) {
            const match = findBestShakaVariantTrack(tracks, q.height || 1080, q.fps);
            if (match) {
              switchShakaTrackSmoothly(player, vid, match);
              syncActiveShakaStats(player);
              setNeedsSeparateAudio(false);
              if (aud) aud.pause();
              return;
            }
          }
          // Even if variant tracks are still loading, keep Shaka active and set height restriction
          if (q.height) {
            player.configure({
              abr: {
                enabled: true,
                restrictions: { minHeight: q.height, maxHeight: q.height },
              },
            });
          }
          return;
        } catch (err) {
          console.warn('[MaterialiousPlayer] Shaka track switch warning:', err);
          return;
        }
      }

      // 2. Direct Invidious Stream switching (only used if Shaka MSE was completely unavailable)
      if (q.id !== 'auto') {
        const vData = videoDataRef.current;
        const formatStreams = vData?.formatStreams || [];
        const adaptiveFormats = vData?.adaptiveFormats || [];

        const isProgressive = formatStreams.some(
          (f: any) => f.itag === q.itag || (f.height && f.height === q.height)
        );

        const matchFormat =
          formatStreams.find((f: any) => f.itag === q.itag || f.height === q.height) ||
          adaptiveFormats.find((f: any) => f.itag === q.itag || f.height === q.height);

        let newSrc = '';
        if (matchFormat?.url) {
          newSrc = invidious.proxyUrl(matchFormat.url);
        } else if (q.itag) {
          newSrc = `/api/invidious/latest_version?id=${videoId}&itag=${q.itag}`;
        } else if (q.height) {
          const itagMap: Record<number, number> = { 1080: 137, 720: 22, 480: 18, 360: 18 };
          const itagVal = itagMap[q.height] || 22;
          newSrc = `/api/invidious/latest_version?id=${videoId}&itag=${itagVal}`;
        }

        if (newSrc) {
          // Freeze current frame onto overlay canvas before changing src so <video> never flashes black
          captureCurrentVideoFrame();
          isSwitchingQualityRef.current = true;
          usingProgressiveRef.current = true;
          if (q.height) setActiveStreamHeight(q.height);

          if (!isProgressive && bestAudioUrl) {
            setNeedsSeparateAudio(true);
            vid.muted = true;
            if (aud) {
              aud.src = bestAudioUrl;
              aud.currentTime = curTime;
              aud.volume = volume;
              aud.muted = isMuted;
              aud.playbackRate = playbackRate;
              aud.load();
              if (wasPlaying) aud.play().catch(() => {});
            }
          } else {
            setNeedsSeparateAudio(false);
            vid.muted = isMuted;
            vid.volume = volume;
            if (aud) aud.pause();
          }

          vid.src = newSrc;
          vid.currentTime = curTime;
          vid.load();
          if (wasPlaying) {
            vid.play().catch(() => {});
          }
        }
      }
    },
    [videoId, bestAudioUrl, isMuted, volume, playbackRate, captureCurrentVideoFrame, syncActiveShakaStats]
  );

  const handleQualityTierSelect = useCallback(
    (tier: 'auto' | 'highest' | 'low') => {
      qualityTierRef.current = tier;
      setQualityTier(tier);
      setShowSettings(false);

      if (tier === 'auto') {
        handleQualityChange({ id: 'auto', label: 'Auto' }, 'Auto');
        return;
      }

      if (tier === 'highest') {
        // Pick highest available video resolution (4K / 1440p / 1080p / 720p)
        const highest =
          qualities.find((q) => q.id !== 'auto' && q.height && q.height >= 1080) ||
          qualities.find((q) => q.id !== 'auto' && q.height && q.height >= 720) ||
          qualities.find((q) => q.id !== 'auto') ||
          { id: '2160', height: 2160, label: 'Highest' };

        handleQualityChange(highest, 'Highest');
        return;
      }

      if (tier === 'low') {
        // Pick lower video resolution for data saver
        const lowest =
          qualities.find((q) => q.height === 360) ||
          qualities.find((q) => q.height === 240) ||
          qualities.filter((q) => q.height && q.height <= 480).pop() ||
          { id: '360', height: 360, label: '360p' };

        handleQualityChange(lowest, 'Low');
        return;
      }
    },
    [qualities, handleQualityChange]
  );

  const handleCaptionChange = useCallback((c: CaptionOption | 'off') => {
    setShowSettings(false);
    if (c === 'off') {
      setCurrentCaption('off');
      setActiveCaptionUrl(null);
      if (shakaPlayerRef.current) {
        try {
          shakaPlayerRef.current.setTextTrackVisibility(false);
        } catch {}
      }
      return;
    }

    setCurrentCaption(c.lang);
    setActiveCaptionUrl(c.url);

    if (shakaPlayerRef.current) {
      try {
        const player = shakaPlayerRef.current;
        const tracks = player.getTextTracks();
        const match = tracks.find((t: any) => t.language === c.lang || t.label === c.label);
        if (match) {
          player.selectTextTrack(match);
          player.setTextTrackVisibility(true);
        }
      } catch (err) {
        console.warn('[MaterialiousPlayer] Shaka text track error:', err);
      }
    }
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
      if (needsSeparateAudio && audio) audio.play().catch(() => {});
    } else {
      video.pause();
      if (audio) audio.pause();
    }
    resetControlsTimer();
  };

  const handleSeek = (seconds: number) => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video) return;
    const next = Math.max(0, Math.min(duration, seconds));
    video.currentTime = next;
    if (needsSeparateAudio && audio) audio.currentTime = next;
    setCurrentTime(next);
    resetControlsTimer();
  };

  // Compact (miniplayer) mode: expand back to the full watch page, carrying the
  // current timestamp so playback continues seamlessly.
  const handleExpand = useCallback(() => {
    router.push(`/watch?v=${videoId}&t=${Math.floor(currentTime)}`);
  }, [router, videoId, currentTime]);

  const handleVolumeChange = (newVol: number) => {
    const video = videoRef.current;
    const audio = audioRef.current;
    const v = Math.max(0, Math.min(1, newVol));
    setVolume(v);
    setIsMuted(v === 0);

    if (needsSeparateAudio && audio) {
      audio.volume = v;
      audio.muted = v === 0;
    } else if (video) {
      video.volume = v;
      video.muted = v === 0;
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    const audio = audioRef.current;
    const nextMute = !(isMuted || volume === 0);
    setIsMuted(nextMute);

    if (needsSeparateAudio && audio) {
      audio.muted = nextMute;
      if (!nextMute && volume === 0) {
        audio.volume = 1;
        setVolume(1);
      }
    } else if (video) {
      video.muted = nextMute;
      if (!nextMute && volume === 0) {
        video.volume = 1;
        setVolume(1);
      }
    }
  };

  const handleSpeedChange = (rate: number) => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (video) video.playbackRate = rate;
    if (audio) audio.playbackRate = rate;
    setPlaybackRate(rate);
    setShowSettings(false);
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const togglePiP = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (video.requestPictureInPicture) {
        await video.requestPictureInPicture();
      }
    } catch (e) {
      console.warn('[MaterialiousPlayer] PiP error:', e);
    }
  };

  // 7. Double Tap Seek Gesture
  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (compact) return;
    const now = Date.now();
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const isLeft = clickX < width * 0.35;
    const isRight = clickX > width * 0.65;

    if (now - lastTapRef.current.time < 300) {
      // Double tap detected
      const video = videoRef.current;
      const audio = audioRef.current;
      if (!video) return;
      if (isLeft) {
        const next = Math.max(0, video.currentTime - 10);
        video.currentTime = next;
        if (needsSeparateAudio && audio) audio.currentTime = next;
        setSeekRipple({ side: 'left', text: '10s' });
        setTimeout(() => setSeekRipple(null), 650);
      } else if (isRight) {
        const next = Math.min(duration, video.currentTime + 10);
        video.currentTime = next;
        if (needsSeparateAudio && audio) audio.currentTime = next;
        setSeekRipple({ side: 'right', text: '10s' });
        setTimeout(() => setSeekRipple(null), 650);
      }
    } else {
      // Single tap
      if (!showControls) {
        setShowControls(true);
        resetControlsTimer();
      } else {
        togglePlay();
      }
    }
    lastTapRef.current = { time: now, x: clickX };
  };

  // 8. Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (compact) return;
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      const video = videoRef.current;
      if (!video) return;

      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
        case 'j':
        case 'arrowleft':
          e.preventDefault();
          handleSeek(video.currentTime - (e.key === 'j' ? 10 : 5));
          break;
        case 'l':
        case 'arrowright':
          e.preventDefault();
          handleSeek(video.currentTime + (e.key === 'l' ? 10 : 5));
          break;
        case 'arrowup':
          e.preventDefault();
          handleVolumeChange(volume + 0.05);
          break;
        case 'arrowdown':
          e.preventDefault();
          handleVolumeChange(volume - 0.05);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [volume, duration, isMuted, isPlaying, compact]);

  const handleVideoElementError = useCallback(() => {
    const vid = videoRef.current;
    if (!vid || !videoId) return;
    const currentSrc = vid.getAttribute('src') || '';
    if (!currentSrc) return;
    // While Shaka MSE is attached and loading DASH/HLS, let Shaka's load() catch/fallback handle errors
    if (shakaPlayerRef.current && !usingProgressiveRef.current) return;

    const fallbackUrl = `/api/invidious/latest_version?id=${videoId}&itag=18`;
    if (
      usingProgressiveRef.current &&
      !playbackStartedRef.current &&
      !triedLatestVersionFallbackRef.current &&
      !currentSrc.includes(`latest_version?id=${videoId}&itag=18`)
    ) {
      triedLatestVersionFallbackRef.current = true;
      console.warn(
        '[MaterialiousPlayer] Progressive stream failed before playback start, falling back to latest_version itag=18'
      );
      setErrorMsg(null);
      setIsBuffering(true);
      setNeedsSeparateAudio(false);
      if (audioRef.current) {
        audioRef.current.pause();
      }
      vid.src = fallbackUrl;
      vid.load();
      if (autoplay) {
        vid.play().catch(() => {});
      }
      return;
    }

    setIsBuffering(false);
    if (!playbackStartedRef.current) {
      setErrorMsg('Unable to load video stream from Invidious.');
      onError?.();
    }
  }, [videoId, autoplay, onError]);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? (buffered / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={compact ? 'mp-compact-container' : undefined}
      onMouseMove={() => resetControlsTimer(2500)}
      onMouseEnter={() => resetControlsTimer(2500)}
      onMouseLeave={() => {
        if (isPlaying && !showSettings) {
          if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
          hideControlsTimer.current = setTimeout(() => {
            if (!showSettings) setShowControls(false);
          }, 600);
        }
      }}
      onTouchStart={() => resetControlsTimer(3000)}
      onClick={handleContainerClick}
      style={
        compact
          ? {
              position: 'fixed',
              zIndex: 1200,
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'var(--yt-surface)',
              border: '1px solid var(--yt-border)',
              boxShadow: '0 12px 36px rgba(0, 0, 0, 0.65), 0 2px 10px rgba(0, 0, 0, 0.35)',
              overflow: 'hidden',
              backdropFilter: 'blur(16px)',
              transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
              animation: 'mpSlideUpMini 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            }
          : {
              position: 'relative',
              width: '100%',
              aspectRatio: '16/9',
              backgroundColor: '#000000',
              borderRadius: isFullscreen ? '0' : '16px',
              overflow: 'hidden',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              cursor: showControls || !isPlaying || showSettings ? 'default' : 'none',
              userSelect: 'none',
            }
      }
    >
      {/* HTML5 Video Element with Subtitles Support */}
      <video
        ref={videoRef}
        className={compact ? 'mp-compact-video' : undefined}
        playsInline
        muted={needsSeparateAudio ? true : isMuted}
        onLoadStart={() => {
          if (!isSwitchingQualityRef.current && !hasFrozenFrame) {
            setDataLoaded(false);
          }
        }}
        onLoadedData={() => {
          playbackStartedRef.current = true;
          isSwitchingQualityRef.current = false;
          setHasFrozenFrame(false);
          setDataLoaded(true);
        }}
        onError={handleVideoElementError}
        style={
          compact
            ? {
                width: '128px',
                height: '72px',
                minWidth: '128px',
                maxWidth: '128px',
                minHeight: '72px',
                maxHeight: '72px',
                objectFit: 'cover',
                display: 'block',
                flexShrink: 0,
                backgroundColor: '#000000',
                pointerEvents: 'none',
                zIndex: 2,
                opacity: dataLoaded ? 1 : 0,
              }
            : {
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                display: 'block',
              }
        }
      >
        {activeCaptionUrl && (
          <track
            kind="subtitles"
            src={activeCaptionUrl}
            srcLang={currentCaption}
            label={captions.find((c) => c.lang === currentCaption)?.label || 'Subtitles'}
            default
          />
        )}
      </video>

      {/* Frame-freeze overlay canvas for zero-black-screen fallback quality transitions */}
      {!compact && (
        <canvas
          ref={frameFreezeCanvasRef}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            pointerEvents: 'none',
            zIndex: 2,
            opacity: hasFrozenFrame ? 1 : 0,
            transition: 'opacity 0.18s ease',
          }}
        />
      )}

      {/* Synchronized High-Res Separate Audio Element */}
      <audio
        ref={audioRef}
        playsInline
        style={{ display: 'none' }}
      />

      {/* Full player thumbnail backdrop while video stream initial frames are loading */}
      {!compact && !dataLoaded && thumbnail && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            zIndex: 1,
            pointerEvents: 'none',
            overflow: 'hidden',
            backgroundColor: '#000000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <img
            src={thumbnail}
            alt={title || ''}
            width={1280}
            height={720}
            {...({ fetchpriority: 'high' } as any)}
            decoding="async"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              filter: 'brightness(0.7)',
              transition: 'opacity 0.3s ease',
            }}
          />
        </div>
      )}

      {/* Compact (miniplayer) UI — the <video>/<audio> above stay mounted so
          switching full ↔ compact never re-buffers. */}
      {compact ? (
        <>
          {/* Thumbnail placeholder behind the video while its first frames load */}
          {!dataLoaded && thumbnail && (
            <img
              src={thumbnail}
              alt={title || ''}
              className="mp-compact-thumb"
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: '128px',
                height: '72px',
                objectFit: 'cover',
                zIndex: 1,
                pointerEvents: 'none',
              }}
            />
          )}

          {/* Time badge over the video */}
          <div
            style={{
              position: 'absolute',
              left: '4px',
              bottom: '4px',
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              color: '#ffffff',
              fontSize: '10px',
              fontWeight: 600,
              padding: '1px 4px',
              borderRadius: '3px',
              pointerEvents: 'none',
              fontVariantNumeric: 'tabular-nums',
              zIndex: 3,
              lineHeight: 1.2,
            }}
          >
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>

          {/* Expand hover overlay on the video */}
          <div
            onClick={handleExpand}
            className="mp-compact-expand"
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: '128px',
              height: '72px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              color: '#ffffff',
              opacity: 0,
              transition: 'opacity 0.2s ease',
              cursor: 'pointer',
              zIndex: 4,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.opacity = '1';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.opacity = '0';
            }}
          >
            <IoExpandOutline size={22} />
          </div>

          {/* Info + Controls */}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              padding: '6px 10px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: '4px',
              height: '72px',
              boxSizing: 'border-box',
              overflow: 'hidden',
            }}
          >
            <div onClick={handleExpand} style={{ cursor: 'pointer', minWidth: 0 }}>
              <h4
                style={{
                  margin: '0 0 2px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--yt-text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  lineHeight: 1.2,
                }}
                title={title || 'Now Playing'}
              >
                {title || 'Now Playing'}
              </h4>
              <p
                style={{
                  margin: 0,
                  fontSize: '11px',
                  color: 'var(--yt-text-secondary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <IoMusicalNotes size={11} />
                <span>{uploader || 'Creator'}</span>
              </p>
            </div>

            {/* Progress bar */}
            <div
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                if (rect.width > 0) {
                  handleSeek(((e.clientX - rect.left) / rect.width) * (duration || 0));
                }
              }}
              style={{
                position: 'relative',
                height: '3px',
                borderRadius: '1.5px',
                backgroundColor: 'var(--yt-border)',
                cursor: 'pointer',
                overflow: 'hidden',
              }}
              title="Seek"
            >
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${progressPercent}%`,
                  backgroundColor: 'var(--md-sys-color-primary, var(--yt-brand-red))',
                  borderRadius: '1.5px',
                }}
              />
            </div>

            {/* Action Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
              <button
                type="button"
                onClick={togglePlay}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: 'var(--yt-text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: 0,
                }}
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <IoPause size={18} /> : <IoPlay size={18} />}
              </button>

              <button
                type="button"
                onClick={handleExpand}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: 'var(--yt-text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: 0,
                }}
                title="Open in player"
              >
                <IoExpandOutline size={18} />
              </button>

              <button
                type="button"
                onClick={closeMiniPlayer}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: 'var(--yt-text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: 0,
                }}
                title="Close"
              >
                <IoCloseOutline size={20} />
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
      {/* Buffering Spinner Overlay */}
      {isBuffering && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.45)',
            backdropFilter: 'blur(3px)',
            zIndex: 15,
            gap: '12px',
            pointerEvents: 'none',
          }}
        >
          <LoadingSpinner text="" size="large" />
          <span
            style={{
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 600,
              letterSpacing: '0.3px',
              textShadow: '0 2px 8px rgba(0,0,0,0.8)',
            }}
          >
            Buffering for smooth playback...
          </span>
        </div>
      )}

      {/* Double Tap Ripple Indicators */}
      {seekRipple && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            [seekRipple.side]: 0,
            width: '40%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(255,255,255,0.15)',
            borderRadius: seekRipple.side === 'left' ? '0 50% 50% 0' : '50% 0 0 50%',
            color: '#ffffff',
            fontSize: '18px',
            fontWeight: 700,
            zIndex: 15,
            animation: 'fadeIn 0.2s ease',
          }}
        >
          {seekRipple.side === 'left' ? `« ${seekRipple.text}` : `${seekRipple.text} »`}
        </div>
      )}

      {/* SponsorBlock Auto-Skip Toast */}
      {sponsorToast && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            backgroundColor: 'rgba(28, 28, 30, 0.92)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '24px',
            padding: '8px 16px',
            color: '#ffffff',
            fontSize: '12px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            zIndex: 25,
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          }}
        >
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#00d26a' }} />
          <span>{sponsorToast.text}</span>
          <button
            onClick={() => {
              if (videoRef.current && sponsorToast.segment) {
                const target = sponsorToast.segment.segment[0];
                videoRef.current.currentTime = target;
                if (needsSeparateAudio && audioRef.current) audioRef.current.currentTime = target;
                setSponsorToast(null);
              }
            }}
            style={{
              backgroundColor: 'transparent',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '12px',
              color: '#ffffff',
              padding: '2px 8px',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            Unskip
          </button>
        </div>
      )}

      {/* Error / Fallback State */}
      {errorMsg && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.85)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            textAlign: 'center',
            zIndex: 30,
            gap: '14px',
          }}
        >
          <p style={{ color: '#ffffff', fontSize: '14px', maxWidth: '400px', margin: 0 }}>{errorMsg}</p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '8px 16px',
                borderRadius: '18px',
                backgroundColor: 'var(--yt-hover)',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '12px',
              }}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Material 3 Floating Control Bar Overlay */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          bottom: '0',
          left: '0',
          right: '0',
          padding: '16px 20px 14px',
          background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          opacity: showControls || !isPlaying || showSettings ? 1 : 0,
          pointerEvents: showControls || !isPlaying || showSettings ? 'auto' : 'none',
          transition: 'opacity 0.25s ease',
          zIndex: 20,
        }}
      >
        {/* 1. Scrubber Timeline with Buffer & SponsorBlock Markers */}
        <div
          ref={scrubberRef}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pos = (e.clientX - rect.left) / rect.width;
            handleSeek(pos * duration);
          }}
          style={{
            position: 'relative',
            height: '6px',
            borderRadius: '3px',
            backgroundColor: 'rgba(255,255,255,0.25)',
            cursor: 'pointer',
            transition: 'height 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.height = '10px')}
          onMouseLeave={(e) => (e.currentTarget.style.height = '6px')}
        >
          {/* Buffered Progress */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: `${bufferedPercent}%`,
              backgroundColor: 'rgba(255,255,255,0.45)',
              borderRadius: '3px',
            }}
          />

          {/* SponsorBlock Segment Markers */}
          {duration > 0 &&
            sponsorSegments.map((seg, i) => {
              const left = (seg.segment[0] / duration) * 100;
              const segWidth = ((seg.segment[1] - seg.segment[0]) / duration) * 100;
              const color = (SPONSOR_CATEGORY_COLORS as any)[seg.category] || '#00d26a';
              return (
                <div
                  key={i}
                  title={`Skip ${seg.category}`}
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: `${left}%`,
                    width: `${segWidth}%`,
                    backgroundColor: color,
                    zIndex: 2,
                    opacity: 0.85,
                  }}
                />
              );
            })}

          {/* Current Played Progress */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: `${progressPercent}%`,
              backgroundColor: 'var(--yt-brand-red, #ff0000)',
              borderRadius: '3px',
              zIndex: 3,
            }}
          >
            {/* Scrubber Knob */}
            <div
              style={{
                position: 'absolute',
                right: '-6px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor: 'var(--yt-brand-red, #ff0000)',
                boxShadow: '0 0 6px rgba(0,0,0,0.5)',
              }}
            />
          </div>
        </div>

        {/* 2. Control Toolbar */}
        {/* 2. Control Toolbar */}
        <div className="player-control-toolbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          {/* Left Toolbar Items: Play/Pause, Prev, Next, Volume, Time */}
          <div className="player-bottom-bar-left" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {onPrev && (
              <button
                className="player-prev-btn"
                onClick={onPrev}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#ffffff',
                  cursor: 'pointer',
                  display: 'flex',
                  padding: '6px',
                  borderRadius: '50%',
                }}
                title="Previous video"
              >
                <IoPlaySkipBack size={18} />
              </button>
            )}

            <button
              onClick={togglePlay}
              style={{
                background: 'none',
                border: 'none',
                color: '#ffffff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px',
                borderRadius: '50%',
                transition: 'transform 0.15s ease',
              }}
              title={isPlaying ? 'Pause (k)' : 'Play (k)'}
            >
              {isPlaying ? <IoPause size={24} /> : <IoPlay size={24} />}
            </button>

            {onNext && (
              <button
                className="player-next-btn"
                onClick={onNext}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#ffffff',
                  cursor: 'pointer',
                  display: 'flex',
                  padding: '6px',
                  borderRadius: '50%',
                }}
                title="Next video"
              >
                <IoPlaySkipForward size={18} />
              </button>
            )}

            {/* Volume Control */}
            <div className="player-volume-group" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                onClick={toggleMute}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#ffffff',
                  cursor: 'pointer',
                  display: 'flex',
                  padding: '6px',
                  borderRadius: '50%',
                }}
                title="Mute (m)"
              >
                {isMuted || volume === 0 ? (
                  <IoVolumeMute size={20} />
                ) : volume < 0.35 ? (
                  <IoVolumeLow size={20} />
                ) : volume < 0.7 ? (
                  <IoVolumeMedium size={20} />
                ) : (
                  <IoVolumeHigh size={20} />
                )}
              </button>
              <input
                className="player-volume-slider"
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                style={{
                  width: '64px',
                  height: '4px',
                  cursor: 'pointer',
                  accentColor: '#ffffff',
                }}
              />
            </div>

            {/* Time Display */}
            <div className="player-time-display" style={{ fontSize: '13px', color: '#ffffff', fontWeight: 500, marginLeft: '6px', whiteSpace: 'nowrap' }}>
              <span>{formatTime(currentTime)}</span>
              <span style={{ margin: '0 3px', opacity: 0.7 }}>/</span>
              <span style={{ opacity: 0.7 }}>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Right Toolbar Items: Captions, Settings, Loop, PiP, Fullscreen */}
          <div className="player-bottom-bar-right" style={{ display: 'flex', alignItems: 'center', gap: '6px', position: 'relative' }}>
            {/* Loop Toggle */}
            <button
              className="player-loop-btn"
              onClick={() => setIsLooping(!isLooping)}
              style={{
                background: isLooping ? 'rgba(255,255,255,0.2)' : 'none',
                border: 'none',
                color: isLooping ? 'var(--md-sys-color-primary, var(--yt-blue))' : '#ffffff',
                cursor: 'pointer',
                display: 'flex',
                padding: '6px',
                borderRadius: '50%',
              }}
              title="Loop video"
            >
              <IoRepeat size={20} />
            </button>

            {/* Settings Gear */}
            <button
              className="player-settings-btn"
              onClick={() => {
                setSettingsTab('main');
                setShowSettings(!showSettings);
              }}
              style={{
                position: 'relative',
                background: showSettings ? 'rgba(255,255,255,0.2)' : 'none',
                border: 'none',
                color: '#ffffff',
                cursor: 'pointer',
                display: 'flex',
                padding: '6px',
                borderRadius: '50%',
              }}
              title="Settings (Quality, Speed, Subtitles)"
            >
              <IoSettingsOutline size={20} />
              {activeStreamHeight >= 720 && (
                <span
                  style={{
                    position: 'absolute',
                    top: '1px',
                    right: '-2px',
                    backgroundColor: 'var(--md-sys-color-primary, var(--yt-brand-red, #ff0000))',
                    color: '#ffffff',
                    fontSize: '8px',
                    fontWeight: 800,
                    lineHeight: 1,
                    padding: '1.5px 3px',
                    borderRadius: '3px',
                    pointerEvents: 'none',
                    letterSpacing: '-0.2px',
                  }}
                >
                  {activeStreamHeight >= 2160 ? '4K' : activeStreamHeight >= 1440 ? '2K' : 'HD'}
                </span>
              )}
            </button>

            {/* Picture-in-Picture Button */}
            <button
              className="player-pip-btn"
              onClick={togglePiP}
              style={{
                background: 'none',
                border: 'none',
                color: '#ffffff',
                cursor: 'pointer',
                display: 'flex',
                padding: '6px',
                borderRadius: '50%',
              }}
              title="Picture in Picture"
            >
              <MdPictureInPictureAlt size={20} />
            </button>

            {/* Fullscreen Button */}
            <button
              className="player-fullscreen-btn"
              onClick={toggleFullscreen}
              style={{
                background: 'none',
                border: 'none',
                color: '#ffffff',
                cursor: 'pointer',
                display: 'flex',
                padding: '6px',
                borderRadius: '50%',
              }}
              title="Fullscreen (f)"
            >
              {isFullscreen ? <IoContract size={20} /> : <IoExpand size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* Settings Modal (Quality, Speed, Subtitles) */}
      {showSettings && (
        <div
          className="player-settings-overlay"
          onClick={() => setShowSettings(false)}
        >
          <div
            className="player-settings-modal"
            onClick={(e) => e.stopPropagation()}
          >
          {settingsTab === 'main' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <button
                onClick={() => setSettingsTab('quality')}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'none',
                  border: 'none',
                  color: '#fff',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  textAlign: 'left',
                }}
              >
                <span>Quality</span>
                <span style={{ opacity: 0.85, color: 'var(--md-sys-color-primary, var(--yt-blue))', fontWeight: 600 }}>
                  {qualityTier === 'auto' && activeStreamHeight > 0
                    ? `Auto (${activeStreamHeight}p${activeStreamFps > 30 ? activeStreamFps : ''})`
                    : qualityTier === 'highest' && activeStreamHeight > 0
                    ? `Highest (${activeStreamHeight}p${activeStreamFps > 30 ? activeStreamFps : ''})`
                    : currentQuality}
                </span>
              </button>
              <button
                onClick={() => setSettingsTab('speed')}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'none',
                  border: 'none',
                  color: '#fff',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  textAlign: 'left',
                }}
              >
                <span>Playback speed</span>
                <span style={{ opacity: 0.7 }}>{playbackRate === 1 ? 'Normal' : `${playbackRate}x`}</span>
              </button>
              {captions.length > 0 && (
                <button
                  onClick={() => setSettingsTab('subtitles')}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'none',
                    border: 'none',
                    color: '#fff',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    textAlign: 'left',
                  }}
                >
                  <span>Subtitles / CC</span>
                  <span style={{ opacity: 0.7 }}>{currentCaption === 'off' ? 'Off' : currentCaption}</span>
                </button>
              )}
            </div>
          ) : settingsTab === 'quality' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <button
                onClick={() => setSettingsTab('main')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'none',
                  border: 'none',
                  color: '#ffffff',
                  padding: '6px 8px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  borderBottom: '1px solid rgba(255,255,255,0.12)',
                  marginBottom: '4px',
                }}
              >
                <IoArrowBack size={16} /> Quality
                {activeStreamHeight > 0 && (
                  <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 500, color: 'rgba(255,255,255,0.6)' }}>
                    {activeStreamHeight}p{activeStreamFps > 30 ? activeStreamFps : ''}
                    {estimatedMbps > 0 ? ` · ~${estimatedMbps} Mbps` : ''}
                  </span>
                )}
              </button>

              {/* Step 1: Auto (Recommended) */}
              <button
                onClick={() => handleQualityTierSelect('auto')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: qualityTier === 'auto' ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.04)',
                  border: qualityTier === 'auto' ? '1px solid rgba(255,255,255,0.3)' : '1px solid transparent',
                  padding: '10px 12px',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: qualityTier === 'auto' ? 'var(--md-sys-color-primary, var(--yt-blue))' : '#ffffff' }}>
                      Auto{qualityTier === 'auto' && activeStreamHeight > 0 ? ` (${activeStreamHeight}p)` : ''}
                    </span>
                    <span style={{ fontSize: '9px', fontWeight: 800, background: 'rgba(255,255,255,0.15)', color: '#ffffff', padding: '1px 5px', borderRadius: '4px' }}>
                      Recommended
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>
                    Automatically increases resolution based on your internet bandwidth
                  </span>
                </div>
                {qualityTier === 'auto' && <IoCheckmark size={18} color="var(--md-sys-color-primary, var(--yt-blue))" />}
              </button>

              {/* Step 2: Low (Data Saver) */}
              <button
                onClick={() => handleQualityTierSelect('low')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: qualityTier === 'low' ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.04)',
                  border: qualityTier === 'low' ? '1px solid rgba(255,255,255,0.3)' : '1px solid transparent',
                  padding: '10px 12px',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: qualityTier === 'low' ? 'var(--md-sys-color-primary, var(--yt-blue))' : '#ffffff' }}>
                      Low
                    </span>
                    <span style={{ fontSize: '9px', fontWeight: 800, background: 'rgba(255,255,255,0.15)', color: '#ffffff', padding: '1px 5px', borderRadius: '4px' }}>
                      Data Saver
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>
                    Lower picture quality (240p - 360p) to save data
                  </span>
                </div>
                {qualityTier === 'low' && <IoCheckmark size={18} color="var(--md-sys-color-primary, var(--yt-blue))" />}
              </button>

              {/* Step 3: Highest (Best Quality) */}
              <button
                onClick={() => handleQualityTierSelect('highest')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: qualityTier === 'highest' ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.04)',
                  border: qualityTier === 'highest' ? '1px solid rgba(255,255,255,0.3)' : '1px solid transparent',
                  padding: '10px 12px',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: qualityTier === 'highest' ? 'var(--md-sys-color-primary, var(--yt-blue))' : '#ffffff' }}>
                      Highest
                    </span>
                    <span style={{ fontSize: '9px', fontWeight: 800, background: 'var(--md-sys-color-primary, var(--yt-blue))', color: '#ffffff', padding: '1px 5px', borderRadius: '4px' }}>
                      HD
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>
                    Crisp maximum resolution (1080p - 4K)
                  </span>
                </div>
                {qualityTier === 'highest' && <IoCheckmark size={18} color="var(--md-sys-color-primary, var(--yt-blue))" />}
              </button>

              {/* Collapsible Advanced Specific Resolutions */}
              <div style={{ marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '6px' }}>
                <button
                  onClick={() => setShowAdvancedQualities(!showAdvancedQualities)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    background: 'none',
                    border: 'none',
                    color: 'rgba(255,255,255,0.7)',
                    padding: '6px 8px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  <span>Advanced (Specific resolution)</span>
                  <span>{showAdvancedQualities ? '▲' : '▼'}</span>
                </button>

                {showAdvancedQualities && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px' }}>
                    {qualities.map((q, idx) => (
                      <button
                        key={`qual-${q.id || 'res'}-${idx}`}
                        onClick={() => {
                          const nextTier = q.id === 'auto' ? 'auto' : 'custom';
                          qualityTierRef.current = nextTier;
                          setQualityTier(nextTier);
                          handleQualityChange(q);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: currentQuality === q.label ? 'rgba(255,255,255,0.15)' : 'none',
                          border: 'none',
                          color: currentQuality === q.label ? 'var(--md-sys-color-primary, var(--yt-blue))' : '#ffffff',
                          padding: '6px 10px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '12px',
                        }}
                      >
                        <span>{q.label}</span>
                        {currentQuality === q.label && <IoCheckmark size={14} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : settingsTab === 'speed' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <button
                onClick={() => setSettingsTab('main')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'none',
                  border: 'none',
                  color: '#fff',
                  padding: '6px 8px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  borderBottom: '1px solid rgba(255,255,255,0.1)',
                  marginBottom: '6px',
                }}
              >
                <IoArrowBack size={16} /> Playback Speed
              </button>
              {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((rate) => (
                <button
                  key={rate}
                  onClick={() => handleSpeedChange(rate)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: playbackRate === rate ? 'rgba(255,255,255,0.15)' : 'none',
                    border: 'none',
                    color: playbackRate === rate ? 'var(--md-sys-color-primary, var(--yt-blue))' : '#fff',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  <span>{rate === 1 ? 'Normal' : `${rate}x`}</span>
                  {playbackRate === rate && <IoCheckmark size={16} />}
                </button>
              ))}
            </div>
          ) : (
            /* Subtitles Menu */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <button
                onClick={() => setSettingsTab('main')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'none',
                  border: 'none',
                  color: '#fff',
                  padding: '6px 8px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  borderBottom: '1px solid rgba(255,255,255,0.1)',
                  marginBottom: '6px',
                }}
              >
                <IoArrowBack size={16} /> Subtitles / CC
              </button>
              <button
                onClick={() => handleCaptionChange('off')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: currentCaption === 'off' ? 'rgba(255,255,255,0.15)' : 'none',
                  border: 'none',
                  color: currentCaption === 'off' ? 'var(--md-sys-color-primary, var(--yt-blue))' : '#fff',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                <span>Off</span>
                {currentCaption === 'off' && <IoCheckmark size={16} />}
              </button>
              {captions.map((c, idx) => (
                <button
                  key={`cap-${c.lang || 'track'}-${idx}`}
                  onClick={() => handleCaptionChange(c)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: currentCaption === c.lang ? 'rgba(255,255,255,0.15)' : 'none',
                    border: 'none',
                    color: currentCaption === c.lang ? 'var(--md-sys-color-primary, var(--yt-blue))' : '#fff',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  <span>{c.label}</span>
                  {currentCaption === c.lang && <IoCheckmark size={16} />}
                </button>
              ))}
            </div>
          )}
          </div>
        </div>
      )}

        </>
      )}

      {/* Responsive styles for toolbar and settings bottom sheet modal */}
      <style jsx global>{`
        .player-settings-overlay {
          position: absolute;
          inset: 0;
          z-index: 50;
          background: rgba(0, 0, 0, 0.45);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: flex-end;
          justify-content: flex-end;
          padding: 16px;
        }
        .player-settings-modal {
          background: rgba(24, 24, 27, 0.96);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 16px;
          padding: 12px;
          min-width: 250px;
          max-width: 320px;
          max-height: calc(100% - 24px);
          overflow-y: auto;
          color: #ffffff;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
          margin-bottom: 50px;
          margin-right: 8px;
        }
        @media (max-width: 900px) {
          .player-settings-overlay {
            background: rgba(0, 0, 0, 0.75) !important;
            backdrop-filter: blur(12px) !important;
            align-items: flex-end !important;
            justify-content: center !important;
            padding: 0 !important;
          }
          .player-settings-modal {
            width: 100% !important;
            max-width: 100% !important;
            min-width: unset !important;
            max-height: 90% !important;
            border-radius: 16px 16px 0 0 !important;
            border-bottom: none !important;
            margin: 0 !important;
            padding: 14px 14px 20px !important;
            box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.85) !important;
          }
          /* Hide non-essential player buttons on mobile */
          .player-volume-slider,
          .player-pip-btn,
          .player-prev-btn,
          .player-next-btn,
          .player-loop-btn,
          .player-fullscreen-btn,
          .player-quality-pill,
          .player-captions-btn {
            display: none !important;
          }
          .player-bottom-bar-left {
            gap: 2px !important;
          }
          .player-bottom-bar-right {
            gap: 4px !important;
          }
          .player-time-display {
            font-size: 11px !important;
            margin-left: 2px !important;
          }
          .player-bottom-bar-left button,
          .player-bottom-bar-right button {
            padding: 6px !important;
            min-width: 32px !important;
            min-height: 32px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
          }
          /* Re-hide the ones we explicitly hid (the generic button rule above forces display:flex) */
          .player-prev-btn,
          .player-next-btn,
          .player-loop-btn,
          .player-fullscreen-btn,
          .player-pip-btn,
          .player-quality-pill,
          .player-captions-btn {
            display: none !important;
          }
        }

        @keyframes mpSlideUpMini {
          from {
            opacity: 0;
            transform: translateY(24px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @media (max-width: 768px) {
          .mp-compact-container {
            bottom: calc(48px + env(safe-area-inset-bottom, 0px)) !important;
            left: 0 !important;
            right: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            height: 56px !important;
            border-radius: 0 !important;
            border-top: 1px solid rgba(255, 255, 255, 0.12) !important;
            overflow: hidden !important;
          }
          .mp-compact-video,
          .mp-compact-thumb,
          .mp-compact-expand {
            width: 96px !important;
            height: 56px !important;
          }
        }
        @media (min-width: 769px) {
          .mp-compact-container {
            bottom: 24px !important;
            right: 24px !important;
            left: auto !important;
            width: 400px !important;
            max-width: 400px !important;
            height: 72px !important;
            border-radius: 12px !important;
            overflow: hidden !important;
          }
          .mp-compact-video,
          .mp-compact-thumb,
          .mp-compact-expand {
            width: 128px !important;
            height: 72px !important;
          }
        }
      `}</style>
    </div>
  );
}

'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePlayer } from '../context/PlayerContext';
import { invidious } from '../services/invidious';
import { useMediaSession, setMediaSessionPlaybackState, updateMediaSessionPosition } from '../hooks/useMediaSession';
import {
  IoExpandOutline,
  IoCloseOutline,
  IoMusicalNotes,
  IoPlay,
  IoPause,
  IoPlaySkipForward,
  IoPlaySkipBack,
  IoVolumeHigh,
  IoVolumeMedium,
  IoVolumeLow,
  IoVolumeMute,
  IoRepeat,
  IoRepeatOutline,
  IoContractOutline,
  IoCheckmark,
  IoSettingsOutline,
} from 'react-icons/io5';
import { MdPictureInPictureAlt, MdClosedCaption, MdClosedCaptionOff } from 'react-icons/md';

interface InvidiousPlayerProps {
  videoId: string;
  title?: string;
  uploader?: string;
  autoplay?: boolean;
  loop?: boolean;
  compact?: boolean;
  forcePaused?: boolean;
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0 || !isFinite(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function proxyUrl(raw: string): string {
  try {
    if (/^https?:\/\//.test(raw)) {
      const u = new URL(raw);
      return `/api/invidious${u.pathname}${u.search}`;
    }
    return `/api/invidious${raw.startsWith('/') ? '' : '/'}${raw}`;
  } catch {
    return raw;
  }
}

export default function InvidiousPlayer({
  videoId,
  title,
  uploader,
  autoplay = true,
  loop = false,
  compact = false,
  forcePaused = false,
}: InvidiousPlayerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    closeMiniPlayer,
    watchHandlersRef,
    setLoopMode,
    setIsPlaying: setGlobalIsPlaying,
    setCurrentTime: setGlobalCurrentTime,
    setDuration: setGlobalDuration,
    setIsMuted: setGlobalIsMuted,
  } = usePlayer();
  const initialT = parseFloat(searchParams.get('t') || '0');

  // Track videoId to trigger stream load ONLY when video actually changes
  const [loadCfg, setLoadCfg] = useState(() => ({
    videoId,
    t: initialT > 0 ? initialT : 0,
  }));
  if (loadCfg.videoId !== videoId) {
    setLoadCfg({ videoId, t: initialT > 0 ? initialT : 0 });
  }

  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrubberRef = useRef<HTMLDivElement>(null);
  const shakaRef = useRef<any>(null);
  const hideTimerRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);

  const [shakaReady, setShakaReady] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolumeState] = useState(() => {
    if (typeof window === 'undefined') return 1;
    const v = parseFloat(localStorage.getItem('kv_player_volume') || '1');
    return isNaN(v) ? 1 : v;
  });
  const [muted, setMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isVolumeHovered, setIsVolumeHovered] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'main' | 'quality' | 'speed'>('main');
  const [qualityTracks, setQualityTracks] = useState<{ id: number; height: number }[]>([]);
  const [qualitySel, setQualitySel] = useState<'auto' | 'normal' | 'max' | number>('auto');
  const [playbackRate, setPlaybackRate] = useState(1);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPip, setIsPip] = useState(false);
  const [videoData, setVideoData] = useState<any>(null);
  const [centerRipple, setCenterRipple] = useState<'play' | 'pause' | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState<number>(0);

  // Initialize Shaka Player once for the persistent element
  useEffect(() => {
    let disposed = false;
    let player: any = null;
    (async () => {
      try {
        const mod: any = await import('shaka-player');
        const shaka = mod.default || mod;
        if (!shaka.Player.isBrowserSupported()) {
          console.warn('[InvidiousPlayer] shaka-player not supported by browser');
          setShakaReady(true);
          return;
        }
        shaka.polyfill.installAll();
        if (disposed) return;
        player = new shaka.Player(videoRef.current!);
        player.configure({
          streaming: {
            rebufferingGoal: 4,
            bufferingGoal: 15,
            bufferBehind: 30,
            retryParameters: {
              maxAttempts: 4,
              baseDelay: 800,
              backoffFactor: 2,
            },
          },
        });
        shakaRef.current = player;
        setShakaReady(true);
      } catch (e: any) {
        console.warn('[InvidiousPlayer] Shaka init error:', e);
        setShakaReady(true);
      }
    })();
    return () => {
      disposed = true;
      if (shakaRef.current) {
        shakaRef.current.destroy().catch(() => {});
        shakaRef.current = null;
      }
    };
  }, []);

  // Load manifest when video changes (DASH -> HLS -> Progressive MP4)
  useEffect(() => {
    if (!shakaReady) return;
    let cancelled = false;
    const vid = videoRef.current;
    if (!vid) return;
    setStatus('loading');
    setErrorMsg('');
    setCaptionsOn(false);
    setCurrentTime(0);
    setDuration(0);
    setBuffered(0);
    setQualitySel('auto');
    setQualityTracks([]);
    setVideoData(null);

    (async () => {
      try {
        const data = await invidious.getVideo(loadCfg.videoId);
        if (cancelled) return;
        setVideoData(data);

        const instance = invidious.getInstanceUrl();
        const candidates: Array<{ url: string; kind: 'dash' | 'hls' | 'progressive' }> = [];
        if (data.dashUrl) {
          candidates.push({ url: proxyUrl(data.dashUrl.startsWith('http') ? data.dashUrl : `${instance}${data.dashUrl}`), kind: 'dash' });
        } else if (instance) {
          candidates.push({ url: proxyUrl(`${instance}/api/v1/dash/${loadCfg.videoId}`), kind: 'dash' });
        }
        if (data.hlsUrl) {
          candidates.push({ url: proxyUrl(data.hlsUrl.startsWith('http') ? data.hlsUrl : `${instance}${data.hlsUrl}`), kind: 'hls' });
        }
        if (data.formatStreams && data.formatStreams.length > 0) {
          for (const s of data.formatStreams) {
            if (s.url) candidates.push({ url: s.url, kind: 'progressive' });
          }
        }
        if (candidates.length === 0) throw new Error('No playable streams found');

        // Extract available quality tracks from Invidious formatStreams and adaptiveFormats
        const allVideoFormats = [
          ...(data.formatStreams || []),
          ...(data.adaptiveFormats || []).filter((f: any) => f.type?.includes('video')),
        ];
        const extractedHeights = Array.from(
          new Set(
            allVideoFormats
              .map((f: any) => {
                if (typeof f.height === 'number') return f.height;
                const m = (f.qualityLabel || f.resolution || '').match(/(\d+)p?/);
                return m ? parseInt(m[1]) : 0;
              })
              .filter((h: number) => h >= 144)
          )
        ).sort((a, b) => b - a);

        if (extractedHeights.length > 0) {
          setQualityTracks(extractedHeights.map((h) => ({ id: h, height: h })));
        }

        const player = shakaRef.current;
        let lastErr: any = null;
        if (player) {
          for (const c of candidates) {
            if (c.kind === 'progressive') continue;
            try {
              await player.unload();
              await player.load(c.url, loadCfg.t > 0 ? loadCfg.t : undefined);
              if (cancelled) return;

              const tracks: any[] = player.getVariantTracks() || [];
              if (tracks.length > 0) {
                const heights = Array.from(
                  new Set(tracks.map((t: any) => t.height).filter((h: any) => h >= 144))
                ).sort((a, b) => b - a);
                setQualityTracks(
                  heights.map((h) => {
                    const best = tracks
                      .filter((t: any) => t.height === h)
                      .sort((a: any, b: any) => (b.bandwidth || 0) - (a.bandwidth || 0))[0];
                    return { id: best?.id ?? h, height: h };
                  })
                );
              }

              setStatus('ready');
              const dur = vid.duration || data.lengthSeconds || 0;
              setDuration(dur);
              setGlobalDuration(dur);
              if (autoplay && !cancelled) {
                vid.play().then(() => {
                  setIsPlaying(true);
                  setGlobalIsPlaying(true);
                }).catch(() => {});
              }
              return;
            } catch (e) {
              lastErr = e;
            }
          }
        }

        const prog = candidates.find((c) => c.kind === 'progressive');
        if (prog) {
          vid.src = prog.url;
          await new Promise<void>((res, rej) => {
            vid.onloadedmetadata = () => res();
            vid.onerror = () => rej(vid.error || new Error('Progressive stream failed'));
          });
          if (cancelled) return;
          if (loadCfg.t > 0) vid.currentTime = loadCfg.t;
          setStatus('ready');
          const dur = vid.duration || data.lengthSeconds || 0;
          setDuration(dur);
          setGlobalDuration(dur);
          if (autoplay && !cancelled) {
            vid.play().then(() => {
              setIsPlaying(true);
              setGlobalIsPlaying(true);
            }).catch(() => {});
          }
          return;
        }

        throw lastErr || new Error('Stream load failed');
      } catch (e: any) {
        if (!cancelled) {
          setStatus('error');
          setErrorMsg(e?.message || String(e));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadCfg.videoId, retryKey, shakaReady, autoplay, setGlobalDuration, setGlobalIsPlaying]);

  // Video element event listeners
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const onTime = () => {
      if (!isDraggingRef.current) {
        const t = vid.currentTime;
        setCurrentTime(t);
        setGlobalCurrentTime(t);
      }
    };
    const onDur = () => {
      const d = vid.duration || 0;
      setDuration(d);
      setGlobalDuration(d);
    };
    const onPlay = () => {
      setIsPlaying(true);
      setGlobalIsPlaying(true);
    };
    const onPause = () => {
      setIsPlaying(false);
      setGlobalIsPlaying(false);
    };
    const onEnded = () => {
      setIsPlaying(false);
      setGlobalIsPlaying(false);
      watchHandlersRef.current.onVideoEnd?.();
    };
    const onProgress = () => {
      const b = vid.buffered;
      if (b.length) setBuffered(b.end(b.length - 1));
    };
    vid.addEventListener('timeupdate', onTime);
    vid.addEventListener('durationchange', onDur);
    vid.addEventListener('loadedmetadata', onDur);
    vid.addEventListener('play', onPlay);
    vid.addEventListener('pause', onPause);
    vid.addEventListener('ended', onEnded);
    vid.addEventListener('progress', onProgress);
    return () => {
      vid.removeEventListener('timeupdate', onTime);
      vid.removeEventListener('durationchange', onDur);
      vid.removeEventListener('loadedmetadata', onDur);
      vid.removeEventListener('play', onPlay);
      vid.removeEventListener('pause', onPause);
      vid.removeEventListener('ended', onEnded);
      vid.removeEventListener('progress', onProgress);
    };
  }, [watchHandlersRef, setGlobalCurrentTime, setGlobalDuration, setGlobalIsPlaying]);

  const displayTitle = title || videoData?.title || 'Now Playing';
  const displayUploader = uploader || videoData?.author || '';
  const displayThumbnail = videoData?.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${loadCfg.videoId}/hqdefault.jpg`;

  // MediaSession API for OS lock screen & background playback
  useMediaSession({
    videoId: loadCfg.videoId,
    title: displayTitle,
    uploader: displayUploader,
    thumbnail: displayThumbnail,
    getVideo: () => videoRef.current,
    getAudio: () => null,
    onNext: watchHandlersRef.current.onNext,
    onPrev: watchHandlersRef.current.onPrev,
  });

  useEffect(() => {
    setMediaSessionPlaybackState(isPlaying ? 'playing' : 'paused');
  }, [isPlaying]);

  useEffect(() => {
    if (duration > 0) {
      updateMediaSessionPosition(duration, playbackRate, currentTime);
    }
  }, [currentTime, duration, playbackRate]);

  useEffect(() => {
    const vid = videoRef.current;
    if (vid) vid.loop = loop;
  }, [loop]);

  useEffect(() => {
    const vid = videoRef.current;
    if (vid && forcePaused) {
      vid.pause();
      setIsPlaying(false);
      setGlobalIsPlaying(false);
    }
  }, [forcePaused, setGlobalIsPlaying]);

  useEffect(() => {
    const vid = videoRef.current;
    if (vid) vid.volume = volume;
  }, [volume]);

  useEffect(() => {
    const vid = videoRef.current;
    if (vid) vid.muted = muted;
  }, [muted]);

  useEffect(() => {
    const el = document.documentElement;
    el.dataset.kvPlayerActive = 'true';
    document.dispatchEvent(new CustomEvent('kv-player-active', { detail: true }));
    return () => {
      delete el.dataset.kvPlayerActive;
      document.dispatchEvent(new CustomEvent('kv-player-active', { detail: false }));
    };
  }, []);

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  useEffect(() => {
    const onPip = () => setIsPip(!!(document as any).pictureInPictureElement);
    document.addEventListener('enterpictureinpicture', onPip);
    document.addEventListener('leavepictureinpicture', onPip);
    return () => {
      document.removeEventListener('enterpictureinpicture', onPip);
      document.removeEventListener('leavepictureinpicture', onPip);
    };
  }, []);

  const wakeControls = useCallback(() => {
    setShowControls(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused && !settingsOpen) {
        setShowControls(false);
      }
    }, 2500);
  }, [settingsOpen]);

  useEffect(() => {
    if (compact) {
      setShowControls(false);
      return;
    }
    wakeControls();
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, [compact, status, wakeControls]);

  const handleExpand = useCallback(() => {
    router.push(`/watch?v=${videoId}`);
  }, [router, videoId]);

  const togglePlay = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) {
      vid.play().then(() => {
        setIsPlaying(true);
        setGlobalIsPlaying(true);
        setCenterRipple('play');
        setTimeout(() => setCenterRipple(null), 500);
      }).catch((e) => {
        console.warn('Playback play prevented:', e);
      });
    } else {
      vid.pause();
      setIsPlaying(false);
      setGlobalIsPlaying(false);
      setCenterRipple('pause');
      setTimeout(() => setCenterRipple(null), 500);
    }
  }, [setGlobalIsPlaying]);

  const handleScrubberSeek = (clientX: number) => {
    const scrubber = scrubberRef.current;
    const vid = videoRef.current;
    if (!scrubber || !vid || !duration || !isFinite(duration)) return;
    const rect = scrubber.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const targetTime = ratio * duration;
    vid.currentTime = targetTime;
    setCurrentTime(targetTime);
    setGlobalCurrentTime(targetTime);
  };

  const handleScrubberMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    isDraggingRef.current = true;
    handleScrubberSeek(e.clientX);

    const onMouseMove = (ev: MouseEvent) => {
      if (isDraggingRef.current) {
        handleScrubberSeek(ev.clientX);
      }
    };
    const onMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleScrubberHover = (e: React.MouseEvent<HTMLDivElement>) => {
    const scrubber = scrubberRef.current;
    if (!scrubber || !duration || !isFinite(duration)) return;
    const rect = scrubber.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setHoverTime(ratio * duration);
    setHoverPos(e.clientX - rect.left);
  };

  const handleQualitySelect = (mode: 'auto' | 'normal' | 'max' | number) => {
    const player = shakaRef.current;
    const vid = videoRef.current;
    if (!vid) return;

    const shakaTracks: any[] = player ? (player.getVariantTracks() || []) : [];
    const hasShakaTracks = shakaTracks.length > 0;

    if (hasShakaTracks && player) {
      if (mode === 'auto') {
        player.configure({ abr: { enabled: true } });
        player.selectVariantTrack(null);
        setQualitySel('auto');
      } else if (mode === 'max') {
        player.configure({ abr: { enabled: false } });
        const sorted = [...shakaTracks].sort((a, b) => (b.height || 0) - (a.height || 0) || (b.bandwidth || 0) - (a.bandwidth || 0));
        if (sorted[0]) {
          player.selectVariantTrack(sorted[0], true);
        }
        setQualitySel('max');
      } else if (mode === 'normal') {
        player.configure({ abr: { enabled: false } });
        const normals = shakaTracks.filter((t) => (t.height || 0) <= 720 && (t.height || 0) >= 360);
        const bestNormal = normals.sort((a, b) => (b.height || 0) - (a.height || 0))[0] || shakaTracks[0];
        if (bestNormal) {
          player.selectVariantTrack(bestNormal, true);
        }
        setQualitySel('normal');
      } else if (typeof mode === 'number') {
        player.configure({ abr: { enabled: false } });
        const match = shakaTracks
          .filter((t: any) => t.height === mode || t.id === mode)
          .sort((a: any, b: any) => (b.bandwidth || 0) - (a.bandwidth || 0))[0];
        if (match) {
          player.selectVariantTrack(match, true);
        }
        setQualitySel(mode);
      }
    } else if (videoData) {
      // Direct Invidious stream selection
      const formatStreams = videoData.formatStreams || [];
      const adaptiveFormats = (videoData.adaptiveFormats || []).filter((f: any) => f.type?.includes('video'));
      const allVideoFormats = [...formatStreams, ...adaptiveFormats];

      const getFormatHeight = (f: any): number => {
        if (typeof f.height === 'number') return f.height;
        const match = (f.qualityLabel || f.resolution || '').match(/(\d+)p?/);
        return match ? parseInt(match[1]) : 0;
      };

      let targetFormat: any = null;
      if (mode === 'max') {
        targetFormat = [...formatStreams].sort((a, b) => getFormatHeight(b) - getFormatHeight(a))[0] ||
                       [...allVideoFormats].sort((a, b) => getFormatHeight(b) - getFormatHeight(a))[0];
        setQualitySel('max');
      } else if (mode === 'normal') {
        targetFormat = formatStreams.find((f: any) => {
          const h = getFormatHeight(f);
          return h <= 720 && h >= 480;
        }) || formatStreams[0] || allVideoFormats[0];
        setQualitySel('normal');
      } else if (mode === 'auto') {
        targetFormat = formatStreams[0] || allVideoFormats[0];
        setQualitySel('auto');
      } else if (typeof mode === 'number') {
        targetFormat = allVideoFormats.find((f: any) => getFormatHeight(f) === mode) ||
                       allVideoFormats.find((f: any) => Math.abs(getFormatHeight(f) - mode) <= 120) ||
                       formatStreams[0];
        setQualitySel(mode);
      }

      if (targetFormat?.url) {
        const streamUrl = targetFormat.url;
        if (vid.src !== streamUrl) {
          const curTime = vid.currentTime;
          const wasPlaying = !vid.paused;
          vid.src = streamUrl;
          vid.currentTime = curTime;
          if (wasPlaying) {
            vid.play().catch(() => {});
          }
        }
      }
    } else {
      setQualitySel(mode);
    }
    setSettingsOpen(false);
  };

  const getQualityLabel = () => {
    if (qualitySel === 'auto') return 'Auto';
    if (qualitySel === 'max') return 'Max';
    if (qualitySel === 'normal') return 'Normal';
    if (typeof qualitySel === 'number') {
      const match = qualityTracks.find((t) => t.id === qualitySel || t.height === qualitySel);
      return match ? `${match.height}p` : `${qualitySel}p`;
    }
    return 'Auto';
  };

  const handleSpeed = (r: number) => {
    const vid = videoRef.current;
    if (vid) vid.playbackRate = r;
    setPlaybackRate(r);
    setSettingsOpen(false);
  };

  const toggleCaptions = () => {
    const player = shakaRef.current;
    if (!player || !videoData?.captions?.length) return;
    if (!captionsOn) {
      try {
        if (!(player.getTextTracks() || []).length) {
          for (const c of videoData.captions) {
            player.addTextTrack(proxyUrl(c.url), c.languageCode || 'en', 'subtitles', c.label, 'text/vtt');
          }
        }
        player.setTextTrackVisibility(true);
        setCaptionsOn(true);
      } catch {}
    } else {
      player.setTextTrackVisibility(false);
      setCaptionsOn(false);
    }
  };

  const toggleFullscreen = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen().catch(() => {});
    }
  };

  const togglePip = () => {
    const vid = videoRef.current;
    if (!vid) return;
    if ((document as any).pictureInPictureElement) {
      (document as any).exitPictureInPicture().catch(() => {});
    } else {
      vid.requestPictureInPicture().catch(() => {});
    }
  };

  const handleVolumeChange = (v: number) => {
    setVolumeState(v);
    setMuted(false);
    setGlobalIsMuted(false);
    try {
      localStorage.setItem('kv_player_volume', String(v));
    } catch {}
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (compact || status !== 'ready') return;
    const vid = videoRef.current;
    if (!vid) return;
    switch (e.key) {
      case ' ':
      case 'k':
        e.preventDefault();
        togglePlay();
        break;
      case 'ArrowRight':
      case 'l':
        e.preventDefault();
        vid.currentTime = Math.min(vid.duration || 0, vid.currentTime + (e.key === 'l' ? 10 : 5));
        break;
      case 'ArrowLeft':
      case 'j':
        e.preventDefault();
        vid.currentTime = Math.max(0, vid.currentTime - (e.key === 'j' ? 10 : 5));
        break;
      case 'ArrowUp':
        e.preventDefault();
        handleVolumeChange(Math.min(1, volume + 0.05));
        break;
      case 'ArrowDown':
        e.preventDefault();
        handleVolumeChange(Math.max(0, volume - 0.05));
        break;
      case 'f':
        toggleFullscreen();
        break;
      case 'm':
        setMuted((m) => !m);
        setGlobalIsMuted(!muted);
        break;
      case 'c':
        toggleCaptions();
        break;
    }
  };

  const VolIcon =
    muted || volume === 0
      ? IoVolumeMute
      : volume < 0.5
        ? IoVolumeLow
        : volume < 0.8
          ? IoVolumeMedium
          : IoVolumeHigh;

  const isLive = isFinite(duration) && duration > 0 ? false : status === 'ready' && videoData?.liveNow;
  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration > 0 ? Math.min(100, (buffered / duration) * 100) : 0;

  // Miniplayer container styles vs Full Player styles
  const rootStyle: React.CSSProperties = compact
    ? {
        position: 'fixed',
        zIndex: 1200,
        display: 'flex',
        alignItems: 'center',
        backgroundColor: 'var(--yt-surface, #212121)',
        border: '1px solid var(--yt-border, rgba(255,255,255,0.1))',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.75), 0 2px 8px rgba(0, 0, 0, 0.4)',
        overflow: 'hidden',
        backdropFilter: 'blur(16px)',
        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        animation: 'ytSlideUpMini 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      }
    : {
        position: 'relative',
        width: '100%',
        height: '100%',
        backgroundColor: '#000000',
        overflow: 'hidden',
      };

  const videoWrapStyle: React.CSSProperties = compact
    ? {
        width: '128px',
        height: '72px',
        flexShrink: 0,
        position: 'relative',
        backgroundColor: '#000000',
        zIndex: 2,
      }
    : {
        position: 'absolute',
        inset: 0,
      };

  const menuItemStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    width: '100%',
    padding: '8px 14px',
    fontSize: '13px',
    color: active ? '#ffffff' : 'rgba(255,255,255,0.85)',
    backgroundColor: active ? 'rgba(255,255,255,0.1)' : 'transparent',
    cursor: 'pointer',
    borderRadius: 6,
    whiteSpace: 'nowrap',
    transition: 'background-color 0.15s ease',
  });

  return (
    <div
      ref={wrapRef}
      className={compact ? 'yt-compact-container' : 'yt-player-container'}
      style={rootStyle}
      onMouseMove={!compact ? wakeControls : undefined}
      onKeyDown={handleKeyDown}
      tabIndex={compact ? -1 : 0}
    >
      {/* Video Stream Element */}
      <div
        className={compact ? 'yt-compact-video' : undefined}
        style={videoWrapStyle}
      >
        <video
          ref={videoRef}
          playsInline
          preload="auto"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            display: 'block',
            backgroundColor: '#000000',
            pointerEvents: compact ? 'none' : 'auto',
          }}
        />

        {/* Center Ripple Animation (YouTube Style) */}
        {!compact && centerRipple && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%) scale(1.1)',
              width: 64,
              height: 64,
              borderRadius: '50%',
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              zIndex: 8,
              animation: 'ytRipple 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
            }}
          >
            {centerRipple === 'play' ? <IoPlay size={32} style={{ marginLeft: 3 }} /> : <IoPause size={32} />}
          </div>
        )}

        {/* Buffering Spinner */}
        {status === 'loading' && !compact && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              zIndex: 6,
            }}
          >
            <div className="yt-spinner" />
          </div>
        )}

        {/* Error State */}
        {status === 'error' && !compact && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              backgroundColor: '#000000',
              color: '#ffffff',
              padding: 20,
              textAlign: 'center',
              zIndex: 10,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 600 }}>An error occurred during playback</div>
            <div style={{ fontSize: 13, opacity: 0.7, maxWidth: 400 }}>{errorMsg}</div>
            <button
              type="button"
              onClick={() => setRetryKey((k) => k + 1)}
              style={{
                marginTop: 6,
                padding: '8px 20px',
                borderRadius: 20,
                border: '1px solid rgba(255,255,255,0.4)',
                backgroundColor: 'rgba(255,255,255,0.1)',
                color: '#ffffff',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Try Again
            </button>
          </div>
        )}

        {/* YouTube Desktop Controls Overlay */}
        {!compact && status === 'ready' && (
          <div
            className="yt-controls-overlay"
            onClick={togglePlay}
            onDoubleClick={(e) => {
              e.stopPropagation();
              toggleFullscreen();
            }}
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              background: 'linear-gradient(rgba(0,0,0,0.6) 0%, transparent 20%, transparent 70%, rgba(0,0,0,0.85) 100%)',
              opacity: showControls ? 1 : 0,
              transition: 'opacity 0.2s ease',
              pointerEvents: showControls ? 'auto' : 'none',
              cursor: showControls ? 'default' : 'none',
              zIndex: 5,
            }}
          >
            {/* Top Bar: Title & Channel */}
            <div
              style={{
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ minWidth: 0, marginRight: 16 }}>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    color: '#ffffff',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                  }}
                  title={displayTitle}
                >
                  {displayTitle}
                </div>
                {displayUploader && (
                  <div
                    style={{
                      fontSize: 13,
                      color: 'rgba(255,255,255,0.8)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                      marginTop: 2,
                    }}
                  >
                    {displayUploader}
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Controls Bar */}
            <div
              style={{
                padding: '0 16px 8px',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* YouTube Red Scrubber Progress Bar */}
              <div
                ref={scrubberRef}
                className="yt-progress-bar-container"
                onMouseDown={handleScrubberMouseDown}
                onMouseMove={handleScrubberHover}
                onMouseLeave={() => setHoverTime(null)}
                style={{
                  position: 'relative',
                  width: '100%',
                  height: 16,
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                }}
              >
                {/* Hover Tooltip Timestamp */}
                {hoverTime !== null && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 22,
                      left: Math.max(20, Math.min(hoverPos, (scrubberRef.current?.clientWidth || 0) - 20)),
                      transform: 'translateX(-50%)',
                      backgroundColor: 'rgba(28,28,28,0.9)',
                      color: '#ffffff',
                      fontSize: 11,
                      fontWeight: 500,
                      padding: '3px 6px',
                      borderRadius: 4,
                      pointerEvents: 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formatTime(hoverTime)}
                  </div>
                )}

                {/* Progress Tracks */}
                <div className="yt-progress-rail">
                  {/* Buffer bar */}
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      height: '100%',
                      width: `${bufferedPct}%`,
                      backgroundColor: 'rgba(255,255,255,0.4)',
                    }}
                  />
                  {/* Played red bar */}
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      height: '100%',
                      width: `${progressPct}%`,
                      backgroundColor: '#ff0000',
                    }}
                  />
                  {/* Scrubber Red Circle Knob */}
                  <div
                    className="yt-scrubber-knob"
                    style={{
                      left: `${progressPct}%`,
                    }}
                  />
                </div>
              </div>

              {/* Action Buttons Row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  height: 40,
                }}
              >
                {/* Left Controls: Play/Pause, Next, Volume, Time */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {/* Play / Pause */}
                  <button
                    type="button"
                    className="yt-control-btn"
                    onClick={togglePlay}
                    title={isPlaying ? 'Pause (k)' : 'Play (k)'}
                  >
                    {isPlaying ? <IoPause size={24} /> : <IoPlay size={24} style={{ marginLeft: 2 }} />}
                  </button>

                  {/* Previous Video */}
                  {watchHandlersRef.current.onPrev && (
                    <button
                      type="button"
                      className="yt-control-btn"
                      onClick={() => watchHandlersRef.current.onPrev?.()}
                      title="Previous"
                    >
                      <IoPlaySkipBack size={20} />
                    </button>
                  )}

                  {/* Next Video */}
                  {watchHandlersRef.current.onNext && (
                    <button
                      type="button"
                      className="yt-control-btn"
                      onClick={() => watchHandlersRef.current.onNext?.()}
                      title="Next (Shift+N)"
                    >
                      <IoPlaySkipForward size={20} />
                    </button>
                  )}

                  {/* Volume Control with Expanding Slider */}
                  <div
                    className="yt-volume-control"
                    onMouseEnter={() => setIsVolumeHovered(true)}
                    onMouseLeave={() => setIsVolumeHovered(false)}
                    style={{ display: 'flex', alignItems: 'center' }}
                  >
                    <button
                      type="button"
                      className="yt-control-btn"
                      onClick={() => {
                        setMuted((m) => !m);
                        setGlobalIsMuted(!muted);
                      }}
                      title={muted ? 'Unmute (m)' : 'Mute (m)'}
                    >
                      <VolIcon size={22} />
                    </button>
                    <div
                      className={`yt-volume-slider-wrap ${isVolumeHovered ? 'expanded' : ''}`}
                    >
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={muted ? 0 : volume}
                        onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                        className="yt-volume-range"
                        title="Volume"
                      />
                    </div>
                  </div>

                  {/* Time Display */}
                  <div
                    style={{
                      fontSize: 13,
                      color: '#ffffff',
                      marginLeft: 6,
                      userSelect: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    {isLive ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ff0000', fontWeight: 600 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#ff0000' }} />
                        LIVE
                      </span>
                    ) : (
                      <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
                    )}
                  </div>
                </div>

                {/* Right Controls: CC, Settings, PiP, Fullscreen */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, position: 'relative' }}>
                  {/* Captions / Subtitles */}
                  <button
                    type="button"
                    className="yt-control-btn"
                    onClick={toggleCaptions}
                    style={{ color: captionsOn ? '#ff0000' : '#ffffff', opacity: videoData?.captions?.length ? 1 : 0.4 }}
                    title="Subtitles/closed captions (c)"
                  >
                    {captionsOn ? <MdClosedCaption size={22} /> : <MdClosedCaptionOff size={22} />}
                  </button>

                  {/* Loop Toggle */}
                  <button
                    type="button"
                    className="yt-control-btn"
                    onClick={() => setLoopMode((prev) => !prev)}
                    style={{ color: loop ? '#ff0000' : '#ffffff' }}
                    title={loop ? 'Loop: on' : 'Loop: off'}
                  >
                    {loop ? <IoRepeat size={21} /> : <IoRepeatOutline size={21} />}
                  </button>

                  {/* Direct Quality Button */}
                  <button
                    type="button"
                    className="yt-control-btn"
                    onClick={() => {
                      setSettingsOpen((o) => (settingsTab === 'quality' && o ? false : true));
                      setSettingsTab('quality');
                    }}
                    style={{
                      width: 'auto',
                      padding: '0 8px',
                      height: 28,
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: 600,
                      backgroundColor: 'rgba(255, 255, 255, 0.1)',
                      color: settingsOpen && settingsTab === 'quality' ? '#ff0000' : '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                    }}
                    title="Video quality (Auto, Normal, Max)"
                  >
                    <span>{getQualityLabel()}</span>
                  </button>

                  {/* Settings Gear */}
                  <button
                    type="button"
                    className="yt-control-btn"
                    onClick={() => {
                      setSettingsOpen((o) => !o);
                      setSettingsTab('main');
                    }}
                    style={{ color: settingsOpen ? '#ff0000' : '#ffffff' }}
                    title="Settings"
                  >
                    <IoSettingsOutline size={20} style={{ transform: settingsOpen ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s' }} />
                  </button>

                  {/* Settings Popup Menu */}
                  {settingsOpen && (
                    <div
                      className="yt-settings-menu"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {settingsTab === 'main' && (
                        <div>
                          <div
                            onClick={() => setSettingsTab('quality')}
                            style={menuItemStyle(false)}
                          >
                            <span>Quality</span>
                            <span style={{ opacity: 0.7, fontSize: 12 }}>
                              {getQualityLabel()} &gt;
                            </span>
                          </div>
                          <div
                            onClick={() => setSettingsTab('speed')}
                            style={menuItemStyle(false)}
                          >
                            <span>Playback speed</span>
                            <span style={{ opacity: 0.7, fontSize: 12 }}>
                              {playbackRate === 1 ? 'Normal' : `${playbackRate}x`} &gt;
                            </span>
                          </div>
                        </div>
                      )}

                      {settingsTab === 'quality' && (
                        <div>
                          <div
                            onClick={() => setSettingsTab('main')}
                            style={{ ...menuItemStyle(false), fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 6 }}
                          >
                            <span>&lt; Quality</span>
                          </div>
                          {/* Presets: Auto, Normal, Max */}
                          <div onClick={() => handleQualitySelect('auto')} style={menuItemStyle(qualitySel === 'auto')}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontWeight: 600 }}>Auto</span>
                              <span style={{ fontSize: 11, opacity: 0.65 }}>Adjusts to your connection</span>
                            </div>
                            {qualitySel === 'auto' && <IoCheckmark size={16} />}
                          </div>
                          <div onClick={() => handleQualitySelect('normal')} style={menuItemStyle(qualitySel === 'normal')}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontWeight: 600 }}>Normal</span>
                              <span style={{ fontSize: 11, opacity: 0.65 }}>Standard data saver (720p / 480p)</span>
                            </div>
                            {qualitySel === 'normal' && <IoCheckmark size={16} />}
                          </div>
                          <div onClick={() => handleQualitySelect('max')} style={menuItemStyle(qualitySel === 'max')}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontWeight: 600 }}>Max</span>
                              <span style={{ fontSize: 11, opacity: 0.65 }}>Highest available quality (HD/4K)</span>
                            </div>
                            {qualitySel === 'max' && <IoCheckmark size={16} />}
                          </div>
                          {/* Specific resolutions */}
                          {qualityTracks.length > 0 && (
                            <div style={{ marginTop: 6, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 4 }}>
                              <div style={{ padding: '4px 14px 2px', fontSize: '11px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Advanced
                              </div>
                              {qualityTracks.map((t) => (
                                <div key={t.id} onClick={() => handleQualitySelect(t.height)} style={menuItemStyle(qualitySel === t.height || qualitySel === t.id)}>
                                  <span>{t.height}p {t.height >= 720 ? 'HD' : ''}</span>
                                  {(qualitySel === t.height || qualitySel === t.id) && <IoCheckmark size={16} />}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {settingsTab === 'speed' && (
                        <div>
                          <div
                            onClick={() => setSettingsTab('main')}
                            style={{ ...menuItemStyle(false), fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 6 }}
                          >
                            <span>&lt; Playback speed</span>
                          </div>
                          {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => (
                            <div key={r} onClick={() => handleSpeed(r)} style={menuItemStyle(playbackRate === r)}>
                              <span>{r === 1 ? 'Normal' : `${r}x`}</span>
                              {playbackRate === r && <IoCheckmark size={16} />}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Picture-in-Picture */}
                  {(document as any).pictureInPictureEnabled && (
                    <button
                      type="button"
                      className="yt-control-btn"
                      onClick={togglePip}
                      style={{ color: isPip ? '#ff0000' : '#ffffff' }}
                      title="Picture-in-picture"
                    >
                      <MdPictureInPictureAlt size={20} />
                    </button>
                  )}

                  {/* Fullscreen */}
                  <button
                    type="button"
                    className="yt-control-btn"
                    onClick={toggleFullscreen}
                    title={isFullscreen ? 'Exit full screen (f)' : 'Full screen (f)'}
                  >
                    {isFullscreen ? <IoContractOutline size={21} /> : <IoExpandOutline size={21} />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Miniplayer Hover Overlay */}
        {compact && (
          <div
            onClick={handleExpand}
            className="yt-compact-expand-overlay"
            title="Expand player"
          >
            <IoExpandOutline size={24} />
          </div>
        )}
      </div>

      {/* Miniplayer Metadata & Actions */}
      {compact && (
        <div
          style={{
            flex: 1,
            minWidth: 0,
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          {/* Title & Channel - Click to expand */}
          <div
            onClick={handleExpand}
            style={{
              cursor: 'pointer',
              minWidth: 0,
              flex: 1,
            }}
          >
            <h4
              style={{
                margin: '0 0 2px',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--yt-text-primary, #ffffff)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                lineHeight: 1.3,
              }}
              title={displayTitle}
            >
              {displayTitle}
            </h4>
            <p
              style={{
                margin: 0,
                fontSize: '11px',
                color: 'var(--yt-text-secondary, rgba(255,255,255,0.7))',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <IoMusicalNotes size={12} />
              <span>{displayUploader || 'Creator'}</span>
            </p>
          </div>

          {/* Miniplayer Action Buttons */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              flexShrink: 0,
            }}
          >
            {watchHandlersRef.current.onPrev && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  watchHandlersRef.current.onPrev?.();
                }}
                className="yt-mini-btn"
                title="Previous"
              >
                <IoPlaySkipBack size={18} />
              </button>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              className="yt-mini-btn yt-mini-btn-play"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <IoPause size={20} /> : <IoPlay size={20} style={{ marginLeft: 2 }} />}
            </button>

            {watchHandlersRef.current.onNext && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  watchHandlersRef.current.onNext?.();
                }}
                className="yt-mini-btn"
                title="Next"
              >
                <IoPlaySkipForward size={18} />
              </button>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleExpand();
              }}
              className="yt-mini-btn"
              title="Expand"
            >
              <IoExpandOutline size={19} />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                closeMiniPlayer();
              }}
              className="yt-mini-btn"
              title="Close"
            >
              <IoCloseOutline size={22} />
            </button>
          </div>
        </div>
      )}

      {/* Miniplayer Bottom Progress Bar */}
      {compact && duration > 0 && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            handleScrubberSeek(e.clientX);
          }}
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 3,
            backgroundColor: 'rgba(255, 255, 255, 0.15)',
            cursor: 'pointer',
            zIndex: 10,
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              height: '100%',
              width: `${bufferedPct}%`,
              backgroundColor: 'rgba(255, 255, 255, 0.35)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              height: '100%',
              width: `${progressPct}%`,
              backgroundColor: '#ff0000',
              transition: 'width 0.1s linear',
            }}
          />
        </div>
      )}

      {/* YouTube Player Styles */}
      <style jsx>{`
        .yt-spinner {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          border: 4px solid rgba(255, 255, 255, 0.2);
          border-top-color: #ff0000;
          animation: ytSpin 0.8s linear infinite;
        }
        @keyframes ytSpin {
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes ytRipple {
          0% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(0.9);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(1.3);
          }
        }

        @keyframes ytSlideUpMini {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .yt-control-btn {
          background: none;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          color: #ffffff;
          cursor: pointer;
          transition: background-color 0.15s, transform 0.1s;
        }
        .yt-control-btn:hover {
          background-color: rgba(255, 255, 255, 0.15);
        }
        .yt-control-btn:active {
          transform: scale(0.92);
        }

        .yt-progress-rail {
          position: relative;
          width: 100%;
          height: 3px;
          background-color: rgba(255, 255, 255, 0.25);
          transition: height 0.15s ease;
        }
        .yt-progress-bar-container:hover .yt-progress-rail {
          height: 5px;
        }

        .yt-scrubber-knob {
          position: absolute;
          top: 50%;
          transform: translate(-50%, -50%) scale(0);
          width: 13px;
          height: 13px;
          border-radius: 50%;
          background-color: #ff0000;
          box-shadow: 0 0 4px rgba(0, 0, 0, 0.6);
          transition: transform 0.15s ease;
        }
        .yt-progress-bar-container:hover .yt-scrubber-knob {
          transform: translate(-50%, -50%) scale(1);
        }

        .yt-volume-slider-wrap {
          width: 0;
          overflow: hidden;
          transition: width 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          display: flex;
          align-items: center;
        }
        .yt-volume-slider-wrap.expanded {
          width: 62px;
          margin-left: 4px;
        }
        .yt-volume-range {
          width: 58px;
          accent-color: #ff0000;
          cursor: pointer;
        }

        .yt-settings-menu {
          position: absolute;
          bottom: 46px;
          right: 0;
          min-width: 180px;
          background-color: rgba(28, 28, 28, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 10px;
          padding: 6px;
          z-index: 30;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(12px);
          max-height: 280px;
          overflow-y: auto;
        }

        .yt-compact-expand-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: rgba(0, 0, 0, 0.35);
          color: #ffffff;
          opacity: 0;
          transition: opacity 0.2s ease;
          cursor: pointer;
          z-index: 4;
        }
        .yt-compact-expand-overlay:hover {
          opacity: 1;
        }

        .yt-mini-btn {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          border: none;
          background-color: transparent;
          color: var(--yt-text-primary, #ffffff);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background-color 0.15s, transform 0.1s;
        }
        .yt-mini-btn:hover {
          background-color: rgba(255, 255, 255, 0.15);
        }
        .yt-mini-btn:active {
          transform: scale(0.92);
        }
        .yt-mini-btn-play {
          background-color: rgba(255, 255, 255, 0.12);
        }

        @media (max-width: 768px) {
          .yt-compact-container {
            bottom: calc(64px + env(safe-area-inset-bottom, 0px) + 8px) !important;
            left: 8px !important;
            right: 8px !important;
            width: calc(100vw - 16px) !important;
            max-width: 100% !important;
            border-radius: 14px !important;
          }
          .yt-compact-video,
          .yt-compact-expand-overlay {
            width: 110px !important;
            height: 62px !important;
          }
        }
        @media (min-width: 769px) {
          .yt-compact-container {
            bottom: 24px !important;
            right: 24px !important;
            left: auto !important;
            width: 420px !important;
            max-width: 420px !important;
            border-radius: 14px !important;
          }
        }
      `}</style>
    </div>
  );
}
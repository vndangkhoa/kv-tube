'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';

export interface PlayingVideoInfo {
  id: string;
  title: string;
  uploader?: string;
  thumbnail?: string;
  duration?: string;
}

// Callbacks owned by the watch page but consumed by the persistent player
// (full player on /watch, miniplayer elsewhere). The persistent player lives
// in the layout, so the watch page publishes its navigation/loop handlers here.
export interface WatchHandlers {
  onNext?: () => void;
  onPrev?: () => void;
  onVideoEnd?: () => void;
  onUseIframe?: () => void;
  onError?: () => void;
  loopMode?: boolean;
}

interface PlayerContextType {
  currentVideo: PlayingVideoInfo | null;
  isPlaying: boolean;
  isMuted: boolean;
  currentTime: number;
  duration: number;
  isMiniPlayerOpen: boolean;
  playerMode: 'iframe' | 'hd';
  setPlayerMode: React.Dispatch<React.SetStateAction<'iframe' | 'hd'>>;
  loopMode: boolean;
  setLoopMode: React.Dispatch<React.SetStateAction<boolean>>;
  watchHandlersRef: React.MutableRefObject<WatchHandlers>;
  setPlayingVideo: (video: PlayingVideoInfo | null) => void;
  setIsPlaying: (playing: boolean) => void;
  setIsMuted: (muted: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (dur: number) => void;
  togglePlayPause: () => void;
  closeMiniPlayer: () => void;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [currentVideo, setCurrentVideo] = useState<PlayingVideoInfo | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDismissed, setIsDismissed] = useState(false);
  const [playerMode, setPlayerMode] = useState<'iframe' | 'hd'>('hd');
  const [loopMode, setLoopMode] = useState(false);
  const watchHandlersRef = useRef<WatchHandlers>({});

  // Show miniplayer when there is a current video AND we are not on /watch or /shorts AND user hasn't dismissed it
  const isMiniPlayerOpen = !!currentVideo && pathname !== '/watch' && pathname !== '/shorts' && !isDismissed;

  // Pause playback when navigating to /shorts to prevent conflicting audio/video
  useEffect(() => {
    if (pathname === '/shorts') {
      setIsPlaying(false);
    }
  }, [pathname]);

  // Restore the persisted player source (iframe vs self-hosted HD)
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('kv-player-mode');
      if (saved === 'iframe' || saved === 'hd') {
        setPlayerMode(saved);
      }
    } catch {}
  }, []);

  // Reset dismissed state and timestamp when a new video is loaded; preserve existing non-empty metadata if the same video is refreshed
  const setPlayingVideo = useCallback((video: PlayingVideoInfo | null) => {
    setCurrentVideo((prev) => {
      if (!video) return null;
      if (prev?.id === video.id) {
        return {
          id: video.id,
          title: video.title || prev.title,
          uploader: video.uploader || prev.uploader,
          thumbnail: video.thumbnail || prev.thumbnail,
          duration: video.duration || prev.duration,
        };
      }
      setCurrentTime(0);
      return video;
    });
    if (video) {
      setIsDismissed(false);
    }
  }, []);

  const togglePlayPause = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const closeMiniPlayer = useCallback(() => {
    setIsPlaying(false);
    setIsDismissed(true);
  }, []);

  return (
    <PlayerContext.Provider
      value={{
        currentVideo,
        isPlaying,
        isMuted,
        currentTime,
        duration,
        isMiniPlayerOpen,
        playerMode,
        setPlayerMode,
        loopMode,
        setLoopMode,
        watchHandlersRef,
        setPlayingVideo,
        setIsPlaying,
        setIsMuted,
        setCurrentTime,
        setDuration,
        togglePlayPause,
        closeMiniPlayer,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer must be used within a PlayerProvider');
  }
  return context;
}

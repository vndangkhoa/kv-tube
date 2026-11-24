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
  loopMode: boolean;
  setLoopMode: React.Dispatch<React.SetStateAction<boolean>>;
  queue: PlayingVideoInfo[];
  queueTitle: string;
  setQueue: (items: PlayingVideoInfo[], title?: string) => void;
  playFromQueue: (video: PlayingVideoInfo) => void;
  playNextInQueue: () => void;
  playPrevInQueue: () => void;
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
  const [loopMode, setLoopMode] = useState(false);
  const [queue, setQueueState] = useState<PlayingVideoInfo[]>([]);
  const [queueTitle, setQueueTitle] = useState('');
  const watchHandlersRef = useRef<WatchHandlers>({});
  const queueRef = useRef<PlayingVideoInfo[]>([]);
  const currentVideoRef = useRef<PlayingVideoInfo | null>(null);
  const loopModeRef = useRef(false);
  currentVideoRef.current = currentVideo;
  loopModeRef.current = loopMode;

  // Show miniplayer when there is a current video AND we are not on /watch or /shorts AND user hasn't dismissed it
  const isMiniPlayerOpen = !!currentVideo && pathname !== '/watch' && pathname !== '/shorts' && !isDismissed;

  // Pause playback when navigating to /shorts to prevent conflicting audio/video
  useEffect(() => {
    if (pathname === '/shorts') {
      setIsPlaying(false);
    }
  }, [pathname]);

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

  const setQueue = useCallback((items: PlayingVideoInfo[], title: string = '') => {
    queueRef.current = items;
    setQueueState(items);
    setQueueTitle(title);
  }, []);

  const playFromQueue = useCallback((video: PlayingVideoInfo) => {
    if (!video?.id) return;
    setPlayingVideo(video);
    setIsPlaying(true);
  }, [setPlayingVideo]);

  const playNextInQueue = useCallback(() => {
    const list = queueRef.current;
    if (list.length === 0) return;
    const curId = currentVideoRef.current?.id;
    const idx = list.findIndex((item) => item.id === curId);
    const nextIdx = idx >= 0 ? idx + 1 : 0;
    if (nextIdx < list.length) {
      playFromQueue(list[nextIdx]);
    } else if (loopModeRef.current && list.length > 0) {
      playFromQueue(list[0]);
    }
  }, [playFromQueue]);

  const playPrevInQueue = useCallback(() => {
    const list = queueRef.current;
    if (list.length === 0) return;
    const curId = currentVideoRef.current?.id;
    const idx = list.findIndex((item) => item.id === curId);
    if (idx > 0) {
      playFromQueue(list[idx - 1]);
    } else if (loopModeRef.current && list.length > 0) {
      playFromQueue(list[list.length - 1]);
    }
  }, [playFromQueue]);

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
        loopMode,
        setLoopMode,
        queue,
        queueTitle,
        setQueue,
        playFromQueue,
        playNextInQueue,
        playPrevInQueue,
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

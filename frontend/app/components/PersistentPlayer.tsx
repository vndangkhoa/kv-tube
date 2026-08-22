'use client';

import { useLayoutEffect, useEffect, useRef, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { usePlayer } from '../context/PlayerContext';
import MaterialiousPlayer from '../watch/MaterialiousPlayer';

// Persistent Player Host:
// The single persistent player instance lives permanently under <body> in RootLayout.
// It is NEVER reparented or detached from the DOM tree, ensuring that the <video>
// element and its MediaSource / MSE decoder pipeline stay alive continuously across
// all route changes without resetting currentTime or re-buffering.
//
// On /watch: it is positioned over the #watch-player-slot placeholder.
// On other routes: it transitions into the floating miniplayer.
export default function PersistentPlayer() {
  const {
    currentVideo,
    isMiniPlayerOpen,
    loopMode,
    watchHandlersRef,
  } = usePlayer();
  const pathname = usePathname();
  const hostRef = useRef<HTMLDivElement>(null);
  const [slotRect, setSlotRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  const isWatchPage = pathname === '/watch';
  const showFull = isWatchPage;
  const showMini = isMiniPlayerOpen && !isWatchPage;
  const hidden = !showMini && !showFull;

  const updateSlotRect = useCallback(() => {
    if (!showFull) {
      setSlotRect(null);
      return;
    }
    const slot = document.getElementById('watch-player-slot') || document.getElementById('watch-player-mount');
    if (slot) {
      const rect = slot.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setSlotRect({
          top: rect.top + window.scrollY,
          left: rect.left + window.scrollX,
          width: rect.width,
          height: rect.height,
        });
      }
    }
  }, [showFull]);

  useLayoutEffect(() => {
    if (showFull) {
      updateSlotRect();
      const raf = requestAnimationFrame(updateSlotRect);
      return () => cancelAnimationFrame(raf);
    } else {
      setSlotRect(null);
    }
  }, [showFull, pathname, updateSlotRect]);

  useEffect(() => {
    if (!showFull) return;
    window.addEventListener('resize', updateSlotRect);
    window.addEventListener('orientationchange', updateSlotRect);

    const slot = document.getElementById('watch-player-slot') || document.getElementById('watch-player-mount');
    let ro: ResizeObserver | null = null;
    if (slot && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => updateSlotRect());
      ro.observe(slot);
    }

    return () => {
      window.removeEventListener('resize', updateSlotRect);
      window.removeEventListener('orientationchange', updateSlotRect);
      if (ro) ro.disconnect();
    };
  }, [showFull, updateSlotRect]);

  if (!currentVideo) return null;

  const getHostStyle = (): React.CSSProperties => {
    if (showFull && slotRect && slotRect.width > 0) {
      return {
        position: 'absolute',
        top: `${slotRect.top}px`,
        left: `${slotRect.left}px`,
        width: `${slotRect.width}px`,
        height: `${slotRect.height}px`,
        zIndex: 50,
        pointerEvents: 'auto',
        visibility: 'visible',
        borderRadius: '16px',
        overflow: 'hidden',
      };
    }
    if (showFull) {
      return {
        position: 'absolute',
        top: '64px',
        left: '0px',
        right: '0px',
        width: '100%',
        maxWidth: '1280px',
        margin: '0 auto',
        aspectRatio: '16/9',
        zIndex: 50,
        visibility: 'visible',
        pointerEvents: 'auto',
      };
    }
    if (showMini) {
      return {
        position: 'fixed',
        zIndex: 1200,
        pointerEvents: 'auto',
        visibility: 'visible',
      };
    }
    return {
      position: 'absolute',
      left: '-99999px',
      top: '-99999px',
      width: '0px',
      height: '0px',
      visibility: 'hidden',
      pointerEvents: 'none',
    };
  };

  return (
    <div
      ref={hostRef}
      id="persistent-player-host"
      style={getHostStyle()}
    >
      <MaterialiousPlayer
        videoId={currentVideo.id}
        title={currentVideo.title}
        uploader={currentVideo.uploader}
        thumbnail={currentVideo.thumbnail}
        autoplay={true}
        loop={loopMode}
        compact={showMini}
        forcePaused={hidden}
        onVideoEnd={() => watchHandlersRef.current.onVideoEnd?.()}
        onNext={() => watchHandlersRef.current.onNext?.()}
        onPrev={() => watchHandlersRef.current.onPrev?.()}
        onError={() => watchHandlersRef.current.onError?.()}
      />
    </div>
  );
}
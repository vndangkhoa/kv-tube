'use client';

import { useLayoutEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { usePlayer } from '../context/PlayerContext';
import MaterialiousPlayer from '../watch/MaterialiousPlayer';

// The single persistent player engine. It renders ONE MaterialiousPlayer
// instance (and therefore one <video> element) inside a stable shell div that
// lives under <body> (the layout's React position).
//
// The shell is physically reparented between the watch page's player slot and
// the fixed miniplayer slot with a plain DOM appendChild (in a layout effect).
// Because it is the SAME DOM node being moved, React never recreates the video
// element, so switching full <-> mini keeps the buffered stream alive and never
// re-buffers. When no UI slot is active (e.g. /shorts, iframe mode on /watch, or
// the miniplayer was dismissed), the shell is parked back under <body> offscreen
// and playback is force-paused rather than unmounted — this keeps React's
// tracked parent (<body>) in sync so it never tries to remove a node it does
// not own. currentVideo is never set to null while the app runs, so the shell
// stays mounted for the whole session.
export default function PersistentPlayer() {
  const {
    currentVideo,
    isMiniPlayerOpen,
    playerMode,
    loopMode,
    watchHandlersRef,
  } = usePlayer();
  const pathname = usePathname();
  const shellRef = useRef<HTMLDivElement>(null);

  const showMini = isMiniPlayerOpen && pathname !== '/watch';
  const showFull = pathname === '/watch' && playerMode === 'hd';
  const hidden = !showMini && !showFull;
  const hasVideo = !!currentVideo;

  // Move the persistent shell into the active mount BEFORE the browser paints,
  // or park it offscreen under <body> when no slot is active. Only reparents the
  // existing node — the video element and its buffer are untouched.
  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    const target = showMini
      ? document.getElementById('mini-player-mount')
      : showFull
        ? document.getElementById('watch-player-mount')
        : null;

    if (target) {
      if (shell.parentElement !== target) target.appendChild(shell);
      shell.style.position = '';
      shell.style.left = '';
      shell.style.top = '';
      shell.style.width = '';
      shell.style.height = '';
      shell.style.visibility = '';
    } else {
      if (shell.parentElement !== document.body) document.body.appendChild(shell);
      shell.style.position = 'absolute';
      shell.style.left = '-99999px';
      shell.style.top = '-99999px';
      shell.style.width = '0px';
      shell.style.height = '0px';
      shell.style.visibility = 'hidden';
    }
  }, [showMini, showFull, hasVideo]);

  if (!currentVideo) return null;

  return (
    <div
      ref={shellRef}
      style={{
        position: 'absolute',
        left: -99999,
        top: -99999,
        width: 0,
        height: 0,
        visibility: 'hidden',
      }}
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
        onUseIframe={() => watchHandlersRef.current.onUseIframe?.()}
        onError={() => watchHandlersRef.current.onError?.()}
      />
    </div>
  );
}
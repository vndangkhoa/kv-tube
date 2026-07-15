'use client';

import { useEffect, useState } from 'react';

// OrientationGuard keeps the *browsing UI* in portrait. On phones, when the
// device is rotated to landscape we show a full-screen overlay asking the user
// to rotate back — unless a video is playing, in which case the player itself
// goes fullscreen landscape (see SelfHostedPlayer). We do NOT call
// screen.orientation.lock so the player is free to rotate.
export default function OrientationGuard() {
    const [landscape, setLandscape] = useState(false);
    const [playerActive, setPlayerActive] = useState(false);

    useEffect(() => {
        const mq = window.matchMedia('(orientation: landscape)');
        const mobileMq = window.matchMedia('(max-width: 820px), (pointer: coarse)');
        const update = () => {
            setLandscape(mq.matches && mobileMq.matches);
            setPlayerActive(document.documentElement.dataset.kvPlayerActive === 'true');
        };
        update();
        mq.addEventListener('change', update);
        mobileMq.addEventListener('change', update);
        window.addEventListener('resize', update);

        // The player announces when it is active (playing) so we suppress the
        // portrait overlay and let it take over the landscape orientation.
        const onPlayerActive = (e: Event) => {
            const detail = (e as CustomEvent<boolean>).detail;
            setPlayerActive(detail === true);
        };
        document.addEventListener('kv-player-active', onPlayerActive as EventListener);

        return () => {
            mq.removeEventListener('change', update);
            mobileMq.removeEventListener('change', update);
            window.removeEventListener('resize', update);
            document.removeEventListener('kv-player-active', onPlayerActive as EventListener);
        };
    }, []);

    if (!landscape || playerActive) return null;

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                backgroundColor: '#000',
                color: '#fff',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                padding: '24px',
                gap: '16px',
            }}
        >
            <svg width="64" height="64" viewBox="0 0 24 24" fill="white">
                <path d="M16.48 2.52c3.27 1.55 4.61 5.7 3.06 8.97l1.34 1.34C21.92 11.6 23 9.06 23 6.5 23 4.2 21.95 2.24 20.17 1.02l-3.69 1.5zM1.65 13.5l1.34-1.34C2.27 9.89 3.61 5.74 6.88 4.19l1.5-3.69C6.6.48 4.2 0 1.85 0 1.39.01.96.06.55.12l1.1 1.1C.39 2.33 0 4.1 0 6.5c0 2.56 1.08 5.1 3.65 7zM12 8a4 4 0 100 8 4 4 0 000-8zm0-6a6 6 0 00-6 6v1l-2-2-1 1 4 4 4-4-1-1-2 2V8a4 4 0 014-4V4l2 2 1-1-4-4-4 4 1 1 2-2V2z" />
            </svg>
            <div style={{ fontSize: '18px', fontWeight: 600 }}>Rotate your phone to portrait</div>
            <div style={{ fontSize: '14px', opacity: 0.7 }}>
                Rotate back to portrait to browse. Playing a video? It goes
                fullscreen automatically in landscape.
            </div>
        </div>
    );
}

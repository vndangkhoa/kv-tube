'use client';

import { useEffect } from 'react';

export default function NextVideoClient({ videoId }: { videoId: string }) {
    useEffect(() => {
        if (typeof window !== 'undefined' && videoId) {
            const event = new CustomEvent('setNextVideoId', { detail: { videoId } });
            window.dispatchEvent(event);
        }
    }, [videoId]);

    return null;
}

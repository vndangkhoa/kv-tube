'use client';

import { useEffect } from 'react';

export default function NextVideoClient({ videoId, listId }: { videoId: string, listId?: string }) {
    useEffect(() => {
        window.dispatchEvent(new CustomEvent('setNextVideoId', { detail: { videoId, listId } }));
    }, [videoId, listId]);

    return null;
}

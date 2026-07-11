'use client';

import { useState } from 'react';

interface Props {
    avatarUrl?: string;
    letter: string;
    title: string;
}

export default function ChannelAvatar({ avatarUrl, letter }: Props) {
    const [failed, setFailed] = useState(false);

    if (avatarUrl && !failed) {
        return (
            <div className="channel-avatar channel-avatar--img">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={avatarUrl}
                    alt="Channel avatar"
                    onError={() => setFailed(true)}
                />
            </div>
        );
    }

    return (
        <div className="channel-avatar" style={{ backgroundColor: 'var(--yt-avatar-bg)' }}>
            {letter}
        </div>
    );
}

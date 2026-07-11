'use client';

import { useState } from 'react';

export default function ChannelDescription({ text }: { text: string }) {
    const [expanded, setExpanded] = useState(false);
    const trimmed = text.trim();
    if (!trimmed) return null;

    const isLong = trimmed.length > 160;
    const display = expanded || !isLong ? trimmed : trimmed.slice(0, 160) + '…';

    return (
        <div className="channel-description">
            <span style={{ whiteSpace: 'pre-wrap' }}>{display}</span>
            {isLong && (
                <button
                    className="channel-description-toggle"
                    onClick={() => setExpanded(e => !e)}
                >
                    {expanded ? 'Show less' : 'more'}
                </button>
            )}
        </div>
    );
}

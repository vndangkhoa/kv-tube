'use client';

import { useEffect, useState } from 'react';

interface VideoFormat {
    format_id: string;
    format_note: string;
    ext: string;
    resolution: string;
    filesize: number;
    vcodec: string;
    acodec: string;
    type: string;
}

type DlMode = 'video' | 'audio';

type QualityOption = {
    height: number; // 0 = best
    label: string;
    mode: DlMode;
};

function extractHeights(formats: VideoFormat[]): number[] {
    const heights = new Set<number>();
    for (const f of formats) {
        if (f.vcodec === 'none') continue;
        const match = f.resolution.match(/(\d+)x(\d+)/);
        if (match) {
            heights.add(parseInt(match[2], 10));
        }
        const noteMatch = f.format_note.match(/(\d+)p/);
        if (noteMatch) {
            heights.add(parseInt(noteMatch[1], 10));
        }
    }
    return [...heights].sort((a, b) => b - a);
}

function bestAudioFormat(formats: VideoFormat[]): VideoFormat | null {
    const audioFormats = formats
        .filter((f) => f.vcodec === 'none' && f.acodec !== 'none')
        .sort((a, b) => b.filesize - a.filesize);
    return audioFormats[0] ?? null;
}

export default function DownloadSheet({
    videoId,
    title,
    onClose,
}: {
    videoId: string;
    title?: string;
    onClose: () => void;
}) {
    const [formats, setFormats] = useState<VideoFormat[]>([]);
    const [loading, setLoading] = useState(true);
    const [mode, setMode] = useState<DlMode>('video');
    const [selectedHeight, setSelectedHeight] = useState<number>(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<string>('');

    useEffect(() => {
        let cancelled = false;
        fetch(`/api/video/${videoId}/download/formats`)
            .then((r) => r.json())
            .then((data: VideoFormat[]) => {
                if (cancelled) return;
                setFormats(Array.isArray(data) ? data : []);
            })
            .catch(() => setError('Could not load formats'))
            .finally(() => !cancelled && setLoading(false));
        return () => { cancelled = true; };
    }, [videoId]);

    const heights = extractHeights(formats);
    const audioFmt = bestAudioFormat(formats);

    const videoOptions: QualityOption[] = [
        { height: 0, label: 'Best quality', mode: 'video' },
        ...heights
            .filter((h) => h <= 1080)
            .map((h) => ({
                height: h,
                label: h >= 1080 ? '1080p' : `${h}p`,
                mode: 'video' as DlMode,
            })),
    ];

    const audioOptions: QualityOption[] = audioFmt
        ? [
              { height: -1, label: 'Best sound (m4a)', mode: 'audio' },
          ]
        : [];

    const options = mode === 'video' ? videoOptions : audioOptions;
    const selected = options.find((o) =>
        mode === 'video' ? o.height === selectedHeight : o.height === selectedHeight
    ) ?? options[0];

    function selectMode(next: DlMode) {
        setMode(next);
        setSelectedHeight(next === 'video' ? 0 : -1);
    }

    async function start() {
        if (!selected) return;
        setBusy(true);
        setError(null);
        setProgress('Starting download…');

        try {
            if (selected.mode === 'audio' && audioFmt) {
                // Audio: direct URL download
                const res = await fetch(`/api/video/${videoId}/download?format=${encodeURIComponent(audioFmt.format_id)}`);
                const data = await res.json();
                if (data?.url) {
                    window.open(data.url, '_blank', 'noopener');
                    onClose();
                } else {
                    setError('No download URL returned');
                }
            } else {
                // Video: server-side merge (streams the merged MP4)
                const heightParam = selected.height > 0 ? `?height=${selected.height}` : '';
                const res = await fetch(`/api/video/${videoId}/download/merge${heightParam}`);
                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    setError(errData.error || 'Download failed');
                    return;
                }

                // Get filename from Content-Disposition header
                const disposition = res.headers.get('Content-Disposition') || '';
                const filenameMatch = disposition.match(/filename="(.+)"/);
                const filename = filenameMatch ? filenameMatch[1] : `${title || 'video'}.mp4`;

                setProgress('Merging video + audio…');
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);

                // Trigger download
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                onClose();
            }
        } catch {
            setError('Download failed');
        } finally {
            setBusy(false);
            setProgress('');
        }
    }

    return (
        <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                backgroundColor: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(8px)',
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
            }}
        >
            <div
                style={{
                    width: 'min(46rem, 100%)',
                    maxHeight: '80vh',
                    background: '#1a1a1a',
                    borderTopLeftRadius: '16px',
                    borderTopRightRadius: '16px',
                    boxShadow: '0 -8px 32px rgba(0,0,0,0.5)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                {/* Drag handle */}
                <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
                    <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.2)' }} />
                </div>

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ fontSize: '16px', fontWeight: 600, color: '#fff', margin: 0 }}>Download</p>
                        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', margin: '2px 0 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {title}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255,255,255,0.08)',
                            border: 'none',
                            color: 'rgba(255,255,255,0.6)',
                            cursor: 'pointer',
                            fontSize: '12px',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            flexShrink: 0,
                            marginLeft: '12px',
                        }}
                    >
                        Close
                    </button>
                </div>

                {/* Content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                    {loading ? (
                        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', padding: '12px 0', textAlign: 'center' }}>Loading formats…</p>
                    ) : error ? (
                        <p style={{ color: '#ff6b6b', fontSize: '13px', padding: '12px 0' }}>{error}</p>
                    ) : (
                        <>
                            {/* Mode tabs */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '16px' }}>
                                {(['video', 'audio'] as DlMode[]).map((m) => (
                                    <button
                                        key={m}
                                        onClick={() => selectMode(m)}
                                        style={{
                                            padding: '10px',
                                            borderRadius: '10px',
                                            border: 'none',
                                            background: mode === m ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
                                            color: mode === m ? '#fff' : 'rgba(255,255,255,0.5)',
                                            cursor: 'pointer',
                                            fontWeight: mode === m ? 600 : 400,
                                            fontSize: '13px',
                                            transition: 'all 0.15s',
                                        }}
                                    >
                                        {m === 'video' ? 'Video + Audio' : 'Audio Only'}
                                    </button>
                                ))}
                            </div>

                            {/* Quality options */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {options.map((opt) => {
                                    const isSel = opt.height === selectedHeight;
                                    const desc = mode === 'video'
                                        ? opt.height === 0
                                            ? 'Merged video + audio (server-side)'
                                            : `${opt.height}p merged with best audio`
                                        : 'Direct audio stream (no video)';
                                    return (
                                        <button
                                            key={opt.height}
                                            onClick={() => setSelectedHeight(opt.height)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                textAlign: 'left',
                                                padding: '12px 14px',
                                                borderRadius: '10px',
                                                border: isSel ? '1px solid rgba(56,189,248,0.4)' : '1px solid rgba(255,255,255,0.06)',
                                                background: isSel ? 'rgba(56,189,248,0.08)' : 'rgba(255,255,255,0.03)',
                                                color: '#fff',
                                                cursor: 'pointer',
                                                transition: 'all 0.15s',
                                            }}
                                        >
                                            <div style={{ minWidth: 0 }}>
                                                <p style={{ margin: 0, fontSize: '14px', fontWeight: 500 }}>{opt.label}</p>
                                                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                                                    {desc}
                                                </p>
                                            </div>
                                            {isSel && (
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="#38bdf8" style={{ flexShrink: 0, marginLeft: '8px' }}>
                                                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                                                </svg>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {mode === 'video' && (
                                <p style={{ marginTop: '12px', fontSize: '11px', color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>
                                    Server merges video + audio with ffmpeg (no re-encode)
                                </p>
                            )}
                        </>
                    )}
                </div>

                {/* Sticky download button */}
                {!loading && !error && (
                    <div style={{ padding: '12px 20px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        {progress && (
                            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', textAlign: 'center', margin: '0 0 8px' }}>
                                {progress}
                            </p>
                        )}
                        <button
                            onClick={() => void start()}
                            disabled={!selected || busy}
                            style={{
                                width: '100%',
                                padding: '12px',
                                borderRadius: '10px',
                                border: 'none',
                                background: selected && !busy ? '#3b82f6' : 'rgba(255,255,255,0.08)',
                                color: selected && !busy ? '#fff' : 'rgba(255,255,255,0.3)',
                                cursor: selected && !busy ? 'pointer' : 'not-allowed',
                                fontWeight: 600,
                                fontSize: '14px',
                                transition: 'all 0.15s',
                            }}
                        >
                            {busy ? 'Merging…' : 'Start download'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

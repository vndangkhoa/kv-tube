'use client';

import { useState, useRef, useEffect } from 'react';

interface DownloadProgress {
    type: 'progress' | 'merging' | 'complete' | 'error';
    percent?: number;
    speed?: string;
    eta?: string;
    message?: string;
    filename?: string;
    size?: number;
}

const qualities = [
    { key: 'low', label: 'Low', desc: '~360p', note: 'Small file, fast download' },
    { key: 'recommended', label: 'Recommended', desc: '~1080p', note: 'Best quality-size balance' },
    { key: 'best', label: 'Best', desc: 'Highest', note: 'Large file, best quality' },
];

function formatSize(bytes: number): string {
    const mb = bytes / (1024 * 1024);
    if (mb < 1) return `${(bytes / 1024).toFixed(0)} KB`;
    if (mb < 1000) return `${mb.toFixed(1)} MB`;
    return `${(mb / 1024).toFixed(1)} GB`;
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
    const [activeQuality, setActiveQuality] = useState<string | null>(null);
    const [progress, setProgress] = useState<DownloadProgress | null>(null);
    const [status, setStatus] = useState<'idle' | 'downloading' | 'done' | 'error'>('idle');
    const esRef = useRef<EventSource | null>(null);

    useEffect(() => {
        return () => {
            esRef.current?.close();
        };
    }, []);

    function startDownload(quality: string) {
        if (esRef.current) {
            esRef.current.close();
        }

        setActiveQuality(quality);
        setStatus('downloading');
        setProgress({ type: 'progress', percent: 0, message: 'Starting download...' });

        const es = new EventSource(`/api/video/${videoId}/download/status?quality=${quality}`);
        esRef.current = es;

        es.onmessage = (e) => {
            try {
                const data: DownloadProgress = JSON.parse(e.data);
                setProgress(data);

                if (data.type === 'complete') {
                    es.close();
                    setStatus('done');
                    setProgress(prev => prev ? { ...prev, message: 'Download complete' } : { type: 'complete' });
                } else if (data.type === 'error') {
                    es.close();
                    setStatus('error');
                }
            } catch {}
        };

        es.onerror = () => {
            es.close();
            setStatus(prev => {
                if (prev === 'downloading') {
                    setProgress({ type: 'error', message: 'Connection lost' });
                    return 'error';
                }
                return prev;
            });
        };
    }

    function triggerDownload() {
        if (!activeQuality) return;
        const a = document.createElement('a');
        a.href = `/api/video/${videoId}/download?quality=${activeQuality}`;
        a.download = '';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
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
                <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
                    <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.2)' }} />
                </div>

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

                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                    {status === 'idle' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {qualities.map((q) => (
                                <button
                                    key={q.key}
                                    onClick={() => startDownload(q.key)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '14px 16px',
                                        borderRadius: '10px',
                                        border: '1px solid rgba(255,255,255,0.06)',
                                        background: 'rgba(255,255,255,0.03)',
                                        cursor: 'pointer',
                                        color: '#fff',
                                        textAlign: 'left',
                                        width: '100%',
                                        fontSize: '14px',
                                        transition: 'all 0.15s',
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                                >
                                    <div>
                                        <div style={{ fontWeight: 600, marginBottom: '2px' }}>{q.label}</div>
                                        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>{q.desc} · {q.note}</div>
                                    </div>
                                    <div style={{ fontSize: '20px', color: 'rgba(255,255,255,0.3)' }}>›</div>
                                </button>
                            ))}
                        </div>
                    )}

                    {status === 'downloading' && progress && (
                        <div style={{ padding: '12px 0', textAlign: 'center' }}>
                            <div style={{ marginBottom: '12px', fontSize: '14px', color: '#fff' }}>
                                {progress.type === 'merging' ? 'Merging video & audio...' : progress.message || 'Downloading...'}
                            </div>

                            {progress.type === 'progress' && progress.percent !== undefined && (
                                <>
                                    <div style={{
                                        width: '100%',
                                        height: '8px',
                                        borderRadius: '4px',
                                        background: 'rgba(255,255,255,0.1)',
                                        overflow: 'hidden',
                                        marginBottom: '8px',
                                    }}>
                                        <div style={{
                                            width: `${Math.min(progress.percent, 100)}%`,
                                            height: '100%',
                                            borderRadius: '4px',
                                            background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
                                            transition: 'width 0.3s ease',
                                        }} />
                                    </div>
                                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
                                        {progress.percent.toFixed(1)}%
                                        {progress.speed && ` · ${progress.speed}`}
                                        {progress.eta && ` · ETA ${progress.eta}`}
                                    </div>
                                </>
                            )}

                            {progress.type === 'merging' && (
                                <div style={{
                                    width: '100%',
                                    height: '8px',
                                    borderRadius: '4px',
                                    background: 'rgba(255,255,255,0.1)',
                                    overflow: 'hidden',
                                    marginBottom: '8px',
                                }}>
                                    <div style={{
                                        width: '100%',
                                        height: '100%',
                                        borderRadius: '4px',
                                        background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
                                        animation: 'pulse 1.5s infinite',
                                    }} />
                                </div>
                            )}
                        </div>
                    )}

                    {status === 'done' && (
                        <div style={{ textAlign: 'center', padding: '12px 0' }}>
                            <div style={{ fontSize: '40px', marginBottom: '8px', color: '#22c55e' }}>✓</div>
                            <div style={{ fontSize: '14px', color: '#fff', marginBottom: '4px' }}>Download complete</div>
                            {progress?.size && progress.size > 0 && (
                                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '16px' }}>
                                    {formatSize(progress.size)} · {progress.filename}
                                </div>
                            )}
                            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginBottom: '16px' }}>
                                File cached for 30 min. Click below to download.
                            </div>
                            <button
                                onClick={triggerDownload}
                                style={{
                                    padding: '10px 24px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: '#3b82f6',
                                    color: '#fff',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 600,
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
                                onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                            >
                                Download to device
                            </button>
                        </div>
                    )}

                    {status === 'error' && (
                        <div style={{ textAlign: 'center', padding: '12px 0' }}>
                            <div style={{ fontSize: '40px', marginBottom: '8px', color: '#ef4444' }}>✕</div>
                            <div style={{ fontSize: '14px', color: '#fff', marginBottom: '4px' }}>
                                {progress?.message || 'Download failed'}
                            </div>
                            <button
                                onClick={() => { setStatus('idle'); setActiveQuality(null); setProgress(null); }}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    background: 'transparent',
                                    color: '#fff',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    marginTop: '12px',
                                }}
                            >
                                Try again
                            </button>
                        </div>
                    )}

                    {status !== 'idle' && status !== 'done' && (
                        <button
                            onClick={() => { esRef.current?.close(); setStatus('idle'); setActiveQuality(null); setProgress(null); }}
                            style={{
                                display: 'block',
                                margin: '12px auto 0',
                                padding: '6px 14px',
                                borderRadius: '8px',
                                border: '1px solid rgba(255,255,255,0.15)',
                                background: 'transparent',
                                color: 'rgba(255,255,255,0.5)',
                                cursor: 'pointer',
                                fontSize: '12px',
                            }}
                        >
                            Cancel
                        </button>
                    )}
                </div>
            </div>

            <style jsx>{`
                @keyframes pulse {
                    0%, 100% { opacity: 0.5; }
                    50% { opacity: 1; }
                }
            `}</style>
        </div>
    );
}

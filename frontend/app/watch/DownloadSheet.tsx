'use client';

import { useState, useEffect } from 'react';
import { invidious } from '../services/invidious';
import { IoDownloadOutline, IoCheckmarkCircle, IoAlertCircle, IoMusicalNotesOutline, IoVideocamOutline, IoClose } from 'react-icons/io5';

interface DownloadOption {
    id: string;
    label: string;
    resolution?: string;
    container: string;
    type: 'video' | 'audio';
    url?: string;
    videoUrl?: string;
    audioUrl?: string;
    size?: string;
    note?: string;
    order: number;
}

const QUALITY_ORDER: Record<string, number> = {
    '2160p': 100,
    '1440p': 90,
    '1080p': 80,
    '720p': 70,
    '480p': 60,
    '360p': 50,
    '240p': 40,
    '144p': 30,
};

function getQualityOrder(label: string): number {
    for (const [k, v] of Object.entries(QUALITY_ORDER)) {
        if (label.includes(k)) return v;
    }
    const num = parseInt(label.replace(/\D/g, ''), 10);
    return isNaN(num) ? 0 : num;
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
    const [loading, setLoading] = useState(true);
    const [options, setOptions] = useState<DownloadOption[]>([]);
    const [selectedTab, setSelectedTab] = useState<'video' | 'audio'>('video');
    const [downloadingId, setDownloadingId] = useState<string | null>(null);
    const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isCancelled = false;
        setLoading(true);
        setError(null);

        async function fetchFormats() {
            try {
                const videoData: any = await invidious.getVideo(videoId);
                if (isCancelled) return;

                const opts: DownloadOption[] = [];
                const formatStreams = Array.isArray(videoData?.formatStreams) ? videoData.formatStreams : [];
                const adaptiveFormats = Array.isArray(videoData?.adaptiveFormats) ? videoData.adaptiveFormats : [];

                // 1. Find Best Audio stream (prefer AAC/M4A, then WebM)
                let bestAudioUrl: string | undefined;
                const audioFormats = adaptiveFormats.filter((f: any) => {
                    return (f.type && f.type.includes('audio')) || (f.mimeType && f.mimeType.includes('audio'));
                });

                const m4aAudio = audioFormats.find((f: any) => f.container === 'm4a' || f.type?.includes('audio/mp4'));
                const anyAudio = audioFormats[0];
                bestAudioUrl = m4aAudio?.url || anyAudio?.url;

                // 2. Audio-only download options
                audioFormats.forEach((f: any, idx: number) => {
                    if (f.url) {
                        const isM4A = f.container === 'm4a' || f.type?.includes('audio/mp4');
                        const container = isM4A ? 'M4A' : (f.container?.toUpperCase() || 'WEBM');
                        const quality = f.audioQuality ? f.audioQuality.replace('AUDIO_QUALITY_', '').toLowerCase() : 'standard';
                        opts.push({
                            id: `audio-${idx}`,
                            label: `Audio (${container})`,
                            resolution: quality.toUpperCase(),
                            container: container,
                            type: 'audio',
                            url: f.url,
                            size: f.size || undefined,
                            note: isM4A ? 'Âm thanh chất lượng cao (AAC)' : 'Âm thanh Opus',
                            order: isM4A ? 100 : 50,
                        });
                    }
                });

                // 3. Process video formats (both progressive and adaptive)
                const seenResolutions = new Set<string>();

                // A. Adaptive video streams (1080p, 720p, 480p, etc.) merged with best audio
                // Sort by preference: MP4/H264 first
                const sortedAdaptiveVideos = [...adaptiveFormats.filter((f: any) => {
                    return (f.type && f.type.includes('video')) || (f.mimeType && f.mimeType.includes('video'));
                })].sort((a: any, b: any) => {
                    const aIsMp4 = (a.container === 'mp4' || a.type?.includes('mp4')) ? 1 : 0;
                    const bIsMp4 = (b.container === 'mp4' || b.type?.includes('mp4')) ? 1 : 0;
                    return bIsMp4 - aIsMp4;
                });

                sortedAdaptiveVideos.forEach((f: any, idx: number) => {
                    if (f.url) {
                        const qLabel = f.qualityLabel || f.resolution || `${f.quality || ''}`;
                        const cleanLabel = qLabel.trim();
                        if (!cleanLabel || seenResolutions.has(cleanLabel)) return;
                        seenResolutions.add(cleanLabel);

                        const order = getQualityOrder(cleanLabel);
                        let subNote = 'Video + Âm thanh (HD Remux)';
                        if (order >= 100) subNote = 'Video 4K Siêu nét + Âm thanh';
                        else if (order >= 90) subNote = 'Video 2K Siêu nét + Âm thanh';
                        else if (order >= 80) subNote = 'Video 1080p Full HD + Âm thanh';
                        else if (order >= 70) subNote = 'Video 720p HD + Âm thanh';
                        else if (order >= 60) subNote = 'Video 480p SD + Âm thanh';

                        opts.push({
                            id: `adapt-${idx}`,
                            label: cleanLabel,
                            resolution: f.resolution || cleanLabel,
                            container: 'MP4',
                            type: 'video',
                            videoUrl: f.url,
                            audioUrl: bestAudioUrl,
                            size: f.size || undefined,
                            note: subNote,
                            order: order,
                        });
                    }
                });

                // B. Progressive combined streams as backup if not already covered
                formatStreams.forEach((f: any, idx: number) => {
                    if (f.url) {
                        const qLabel = f.qualityLabel || f.resolution || `${f.quality || '360p'}`;
                        const cleanLabel = qLabel.trim();
                        if (!seenResolutions.has(cleanLabel)) {
                            seenResolutions.add(cleanLabel);
                            opts.push({
                                id: `prog-${idx}`,
                                label: cleanLabel,
                                resolution: f.resolution || cleanLabel,
                                container: (f.container || 'mp4').toUpperCase(),
                                type: 'video',
                                url: f.url,
                                size: f.size || undefined,
                                note: 'Video + Âm thanh',
                                order: getQualityOrder(cleanLabel),
                            });
                        }
                    }
                });

                // Sort all options descending by quality order
                opts.sort((a, b) => b.order - a.order);

                const videoOpts = opts.filter(o => o.type === 'video');
                const audioOpts = opts.filter(o => o.type === 'audio');

                if (videoOpts.length === 0 && audioOpts.length === 0) {
                    setError('Không tìm thấy định dạng tải khả dụng cho video này.');
                } else {
                    setOptions(opts);
                    if (videoOpts.length === 0 && audioOpts.length > 0) {
                        setSelectedTab('audio');
                    }
                }
            } catch (err: any) {
                if (!isCancelled) {
                    console.error('[DownloadSheet] Error fetching formats:', err);
                    setError('Không thể tải danh sách định dạng. Vui lòng thử lại.');
                }
            } finally {
                if (!isCancelled) setLoading(false);
            }
        }

        fetchFormats();
        return () => { isCancelled = true; };
    }, [videoId]);

    const handleDownload = (opt: DownloadOption) => {
        setDownloadingId(opt.id);
        const ext = opt.container.toLowerCase();
        const cleanTitle = (title || 'video').trim();

        let downloadUrl = '';
        if (opt.videoUrl && opt.audioUrl) {
            downloadUrl = `/api/download?videoUrl=${encodeURIComponent(opt.videoUrl)}&audioUrl=${encodeURIComponent(opt.audioUrl)}&title=${encodeURIComponent(cleanTitle)}&ext=mp4`;
        } else if (opt.url) {
            downloadUrl = `/api/download?url=${encodeURIComponent(opt.url)}&title=${encodeURIComponent(cleanTitle)}&ext=${ext}`;
        } else {
            return;
        }

        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `${cleanTitle}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setDownloadSuccess(opt.label);
        setTimeout(() => {
            setDownloadingId(null);
        }, 2500);
    };

    const currentList = options.filter(o => o.type === selectedTab);

    return (
        <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                backgroundColor: 'rgba(0,0,0,0.7)',
                backdropFilter: 'blur(8px)',
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
            }}
        >
            <div
                style={{
                    width: 'min(42rem, 100%)',
                    maxHeight: '85vh',
                    background: '#16181d',
                    borderTopLeftRadius: '20px',
                    borderTopRightRadius: '20px',
                    boxShadow: '0 -10px 40px rgba(0,0,0,0.6)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    animation: 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
            >
                {/* Grab handle */}
                <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 2px' }}>
                    <div style={{ width: '40px', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.2)' }} />
                </div>

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 20px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <IoDownloadOutline size={20} color="#0a6cff" />
                            <p style={{ fontSize: '16px', fontWeight: 700, color: '#fff', margin: 0 }}>Tải Video & Âm thanh</p>
                        </div>
                        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', margin: '4px 0 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {title || 'Loading video...'}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255,255,255,0.08)',
                            border: 'none',
                            color: 'rgba(255,255,255,0.7)',
                            cursor: 'pointer',
                            padding: '8px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginLeft: '12px',
                        }}
                        aria-label="Close"
                    >
                        <IoClose size={18} />
                    </button>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', padding: '12px 20px 6px', gap: '8px' }}>
                    <button
                        onClick={() => setSelectedTab('video')}
                        style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            padding: '10px 14px',
                            borderRadius: '10px',
                            border: selectedTab === 'video' ? '1px solid #0a6cff' : '1px solid rgba(255,255,255,0.08)',
                            background: selectedTab === 'video' ? 'rgba(10, 108, 255, 0.15)' : 'rgba(255,255,255,0.03)',
                            color: selectedTab === 'video' ? '#0a6cff' : 'rgba(255,255,255,0.7)',
                            fontWeight: 600,
                            fontSize: '13px',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                        }}
                    >
                        <IoVideocamOutline size={18} />
                        <span>Video (MP4 Full HD / HD)</span>
                    </button>
                    <button
                        onClick={() => setSelectedTab('audio')}
                        style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            padding: '10px 14px',
                            borderRadius: '10px',
                            border: selectedTab === 'audio' ? '1px solid #0a6cff' : '1px solid rgba(255,255,255,0.08)',
                            background: selectedTab === 'audio' ? 'rgba(10, 108, 255, 0.15)' : 'rgba(255,255,255,0.03)',
                            color: selectedTab === 'audio' ? '#0a6cff' : 'rgba(255,255,255,0.7)',
                            fontWeight: 600,
                            fontSize: '13px',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                        }}
                    >
                        <IoMusicalNotesOutline size={18} />
                        <span>Âm thanh (Audio Only)</span>
                    </button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px 24px' }}>
                    {loading && (
                        <div style={{ textAlign: 'center', padding: '32px 0', color: 'rgba(255,255,255,0.6)' }}>
                            <div className="download-spinner" />
                            <p style={{ fontSize: '13px', marginTop: '12px' }}>Đang tìm các độ phân giải cao nhất...</p>
                        </div>
                    )}

                    {error && !loading && (
                        <div style={{ textAlign: 'center', padding: '24px 0', color: '#ef4444' }}>
                            <IoAlertCircle size={36} />
                            <p style={{ fontSize: '13px', marginTop: '8px', color: 'rgba(255,255,255,0.8)' }}>{error}</p>
                        </div>
                    )}

                    {!loading && !error && currentList.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '24px 0', color: 'rgba(255,255,255,0.5)' }}>
                            <p style={{ fontSize: '13px' }}>Không có định dạng {selectedTab === 'video' ? 'video' : 'âm thanh'} khả dụng.</p>
                        </div>
                    )}

                    {!loading && !error && currentList.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {currentList.map((opt) => (
                                <button
                                    key={opt.id}
                                    onClick={() => handleDownload(opt)}
                                    disabled={downloadingId === opt.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '14px 16px',
                                        borderRadius: '12px',
                                        border: '1px solid rgba(255,255,255,0.06)',
                                        background: downloadingId === opt.id ? 'rgba(10, 108, 255, 0.15)' : 'rgba(255,255,255,0.03)',
                                        cursor: downloadingId === opt.id ? 'default' : 'pointer',
                                        color: '#fff',
                                        textAlign: 'left',
                                        width: '100%',
                                        fontSize: '14px',
                                        transition: 'all 0.15s',
                                    }}
                                    onMouseEnter={(e) => {
                                        if (downloadingId !== opt.id) e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                                    }}
                                    onMouseLeave={(e) => {
                                        if (downloadingId !== opt.id) e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                                    }}
                                >
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                                            <span style={{ fontWeight: 700, fontSize: '15px' }}>{opt.label}</span>
                                            <span style={{
                                                fontSize: '11px',
                                                padding: '2px 6px',
                                                borderRadius: '5px',
                                                background: opt.order >= 70 ? 'rgba(10, 108, 255, 0.2)' : 'rgba(255,255,255,0.1)',
                                                color: opt.order >= 70 ? '#38bdf8' : '#0a6cff',
                                                fontWeight: 700,
                                            }}>
                                                {opt.container}
                                            </span>
                                            {opt.order >= 80 && (
                                                <span style={{
                                                    fontSize: '10px',
                                                    padding: '2px 6px',
                                                    borderRadius: '5px',
                                                    background: 'rgba(34, 197, 94, 0.2)',
                                                    color: '#4ade80',
                                                    fontWeight: 700,
                                                }}>
                                                    HD
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
                                            {opt.note || opt.resolution}
                                            {opt.size ? ` · ${opt.size}` : ''}
                                        </div>
                                    </div>
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        color: '#0a6cff',
                                        fontWeight: 600,
                                        fontSize: '13px',
                                    }}>
                                        {downloadingId === opt.id ? (
                                            <span style={{ color: '#22c55e', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <IoCheckmarkCircle size={18} /> Đang tải...
                                            </span>
                                        ) : (
                                            <>
                                                <span>Tải về</span>
                                                <IoDownloadOutline size={16} />
                                            </>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    {downloadSuccess && (
                        <div style={{
                            marginTop: '16px',
                            padding: '12px 16px',
                            borderRadius: '10px',
                            background: 'rgba(34, 197, 94, 0.12)',
                            border: '1px solid rgba(34, 197, 94, 0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            fontSize: '13px',
                            color: '#4ade80',
                        }}>
                            <IoCheckmarkCircle size={20} style={{ flexShrink: 0 }} />
                            <span>Đã bắt đầu tải video độ phân giải cao kèm âm thanh về thiết bị của bạn.</span>
                        </div>
                    )}
                </div>
            </div>

            <style jsx>{`
                @keyframes slideUp {
                    from { transform: translateY(100%); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                .download-spinner {
                    width: 28px;
                    height: 28px;
                    border: 3px solid rgba(255,255,255,0.1);
                    border-top-color: #0a6cff;
                    border-radius: 50%;
                    margin: 0 auto;
                    animation: spin 0.8s linear infinite;
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}

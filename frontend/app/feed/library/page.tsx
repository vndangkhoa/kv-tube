'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback, useRef } from 'react';
import { getSavedVideos, type SavedVideo } from '../../storage';
import LoadingSpinner from '../../components/LoadingSpinner';

const DEFAULT_THUMBNAIL = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"%3E%3Crect fill="%23222" width="320" height="180"/%3E%3Cpath fill="%23555" d="M140 65v50l40-25z"/%3E%3C/svg%3E';

interface VideoData {
    id: string;
    title: string;
    uploader: string;
    thumbnail: string;
    view_count: number;
    duration: string;
    watched_at?: string;
}

type SectionId = 'history' | 'liked' | 'saved';

interface LibraryItem {
    id: string;
    title: string;
    uploader: string;
    thumbnail: string;
    meta?: string;
}

function relativeTime(dateStr?: string): string {
    if (!dateStr) return '';
    const then = new Date(dateStr.replace(' ', 'T'));
    if (isNaN(then.getTime())) return '';
    const diff = Date.now() - then.getTime();
    if (diff < 0) return 'Just now';
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
    const years = Math.floor(days / 365);
    return `${years} year${years === 1 ? '' : 's'} ago`;
}

function LibraryCard({ item, width }: { item: LibraryItem; width?: string }) {
    const thumbnailSrc = item.thumbnail || DEFAULT_THUMBNAIL;

    const handleImageError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
        const img = e.target as HTMLImageElement;
        if (img.src !== DEFAULT_THUMBNAIL) {
            img.src = DEFAULT_THUMBNAIL;
        }
    }, []);

    return (
        <Link
            href={`/watch?v=${item.id}`}
            className="card-hover-lift"
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                textDecoration: 'none',
                width: width || 'auto',
                flexShrink: width ? 0 : undefined,
            }}
        >
            <div style={{ position: 'relative', aspectRatio: '16/9', borderRadius: '12px', overflow: 'hidden' }}>
                <img
                    src={thumbnailSrc}
                    alt={item.title}
                    loading="lazy"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={handleImageError}
                />
            </div>
            <div style={{ padding: '0 2px' }}>
                <h3 style={{
                    fontSize: '14px',
                    fontWeight: '500',
                    lineHeight: '20px',
                    color: 'var(--yt-text-primary)',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    margin: '0 0 4px',
                }}>
                    {item.title}
                </h3>
                {item.uploader && (
                    <p style={{ fontSize: '12px', color: 'var(--yt-text-secondary)', margin: 0 }}>
                        {item.uploader}
                    </p>
                )}
                {item.meta && (
                    <p style={{ fontSize: '12px', color: 'var(--yt-text-secondary)', margin: 0 }}>
                        {item.meta}
                    </p>
                )}
            </div>
        </Link>
    );
}

const MIN_CARD_WIDTH = 260;
const GRID_GAP = 14;
const ROWS_TO_SHOW = 3;

function useColumnCount(ref: React.RefObject<HTMLDivElement | null>) {
    const [cols, setCols] = useState(4);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const compute = () => {
            const width = el.clientWidth;
            if (width <= 0) return;
            const c = Math.max(1, Math.floor((width + GRID_GAP) / (MIN_CARD_WIDTH + GRID_GAP)));
            setCols(c);
        };
        compute();
        const ro = new ResizeObserver(compute);
        ro.observe(el);
        return () => ro.disconnect();
    }, [ref]);

    return cols;
}

function SectionRow({ title, items, onViewAll }: { title: string; items: LibraryItem[]; onViewAll: () => void }) {
    const gridRef = useRef<HTMLDivElement>(null);
    const cols = useColumnCount(gridRef);

    if (items.length === 0) return null;

    const maxVisible = cols * ROWS_TO_SHOW;
    const visibleItems = items.slice(0, maxVisible);
    const hasMore = items.length > maxVisible;

    return (
        <section style={{ marginBottom: '40px' }}>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '14px',
            }}>
                <h2 style={{ fontSize: '20px', fontWeight: '600', color: 'var(--yt-text-primary)', margin: 0 }}>
                    {title}
                </h2>
                {hasMore && (
                    <button
                        onClick={onViewAll}
                        style={{
                            background: 'transparent',
                            border: '1px solid var(--yt-border)',
                            color: 'var(--yt-text-primary)',
                            fontSize: '13px',
                            fontWeight: '500',
                            padding: '8px 16px',
                            borderRadius: '20px',
                            cursor: 'pointer',
                        }}
                        className="import-btn"
                    >
                        View all
                    </button>
                )}
            </div>

            <div
                ref={gridRef}
                style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                    gap: `18px ${GRID_GAP}px`,
                }}
            >
                {visibleItems.map((item) => (
                    <LibraryCard key={item.id} item={item} />
                ))}
            </div>
        </section>
    );
}

function ExpandedGrid({ title, items, onBack }: { title: string; items: LibraryItem[]; onBack: () => void }) {
    return (
        <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <button
                    onClick={onBack}
                    aria-label="Back"
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--yt-text-primary)',
                        cursor: 'pointer',
                        display: 'flex',
                        padding: '6px',
                        borderRadius: '50%',
                    }}
                    className="import-btn"
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
                </button>
                <h2 style={{ fontSize: '22px', fontWeight: '600', color: 'var(--yt-text-primary)', margin: 0 }}>
                    {title}
                </h2>
            </div>
            {items.length === 0 ? (
                <div style={{ padding: '64px 24px', textAlign: 'center', color: 'var(--yt-text-secondary)' }}>
                    <p style={{ fontSize: '16px' }}>Nothing here yet.</p>
                </div>
            ) : (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                    gap: '16px 14px',
                }}>
                    {items.map((item) => (
                        <LibraryCard key={item.id} item={item} />
                    ))}
                </div>
            )}
        </section>
    );
}

function ImportModal({ onClose }: { onClose: () => void }) {
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importing, setImporting] = useState(false);
    const [importStatus, setImportStatus] = useState<{ success: boolean; history?: number; liked?: number; subscriptions?: number; error?: string } | null>(null);

    async function handleImport() {
        if (!importFile) return;
        setImporting(true);
        setImportStatus(null);
        try {
            const formData = new FormData();
            formData.append('file', importFile);
            const res = await fetch('/api/import/takeout', {
                method: 'POST',
                body: formData,
                signal: AbortSignal.timeout(300000),
            });
            const text = await res.text();
            let data: any;
            try {
                data = JSON.parse(text);
            } catch {
                setImportStatus({ success: false, error: `Server returned non-JSON response (${res.status}). Backend may have crashed.` });
                return;
            }
            if (res.ok) {
                setImportStatus({
                    success: true,
                    history: data.history_count || 0,
                    liked: data.liked_count || 0,
                    subscriptions: data.subscription_count || 0,
                });
            } else {
                setImportStatus({ success: false, error: data.error || 'Unknown error' });
            }
        } catch (err: any) {
            setImportStatus({ success: false, error: err.message || 'Network error' });
        } finally {
            setImporting(false);
        }
    }

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(4px)',
            }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div style={{
                backgroundColor: 'var(--yt-card-bg)',
                borderRadius: '16px',
                padding: '32px',
                maxWidth: '480px',
                width: '90%',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 style={{ fontSize: '20px', fontWeight: '600', color: 'var(--yt-text-primary)' }}>
                        Import from Google Takeout
                    </h2>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--yt-text-secondary)',
                            fontSize: '24px',
                            cursor: 'pointer',
                            padding: '4px 8px',
                            lineHeight: 1,
                        }}
                    >
                        ×
                    </button>
                </div>
                <p style={{ fontSize: '14px', color: 'var(--yt-text-secondary)', marginBottom: '20px' }}>
                    Upload your Google Takeout archive (zip) to import watch history, liked videos, and subscriptions.
                </p>
                <input
                    type="file"
                    accept=".zip"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                            setImportFile(file);
                            setImportStatus(null);
                        }
                    }}
                    style={{
                        display: 'block',
                        width: '100%',
                        padding: '12px',
                        borderRadius: '8px',
                        border: '1px solid var(--yt-border)',
                        backgroundColor: 'var(--yt-hover)',
                        color: 'var(--yt-text-primary)',
                        fontSize: '14px',
                        marginBottom: '16px',
                        boxSizing: 'border-box',
                    }}
                />
                <button
                    onClick={handleImport}
                    disabled={!importFile || importing}
                    style={{
                        width: '100%',
                        padding: '12px',
                        borderRadius: '8px',
                        border: 'none',
                        backgroundColor: importing ? 'var(--yt-text-secondary)' : 'var(--yt-primary)',
                        color: '#fff',
                        fontSize: '14px',
                        fontWeight: '600',
                        cursor: !importFile || importing ? 'not-allowed' : 'pointer',
                        opacity: !importFile ? 0.5 : 1,
                        transition: 'opacity 0.2s',
                    }}
                >
                    {importing ? 'Importing...' : 'Import'}
                </button>
                {importStatus && (
                    <div style={{
                        marginTop: '16px',
                        padding: '12px',
                        borderRadius: '8px',
                        backgroundColor: importStatus.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                        color: importStatus.success ? 'rgb(34,197,94)' : 'rgb(239,68,68)',
                        fontSize: '14px',
                    }}>
                        {importStatus.success
                            ? `Imported ${importStatus.history} history, ${importStatus.liked} liked, ${importStatus.subscriptions} subscriptions. Refresh to see them.`
                            : `Import failed: ${importStatus.error}`}
                    </div>
                )}
            </div>
        </div>
    );
}

export default function LibraryPage() {
    const [history, setHistory] = useState<LibraryItem[]>([]);
    const [liked, setLiked] = useState<LibraryItem[]>([]);
    const [saved, setSaved] = useState<LibraryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [showImport, setShowImport] = useState(false);
    const [expanded, setExpanded] = useState<SectionId | null>(null);

    useEffect(() => {
        async function fetchData() {
            try {
                const apiBase = '/api';
                const [historyRes, likedRes] = await Promise.all([
                    fetch(`${apiBase}/history?limit=100`, { cache: 'no-store' }),
                    fetch(`${apiBase}/liked?limit=100`, { cache: 'no-store' }),
                ]);

                const historyData: VideoData[] = await historyRes.json();
                const likedData: VideoData[] = await likedRes.json();
                const savedData: SavedVideo[] = getSavedVideos(100);

                setHistory((Array.isArray(historyData) ? historyData : []).map((v) => ({
                    id: v.id,
                    title: v.title,
                    uploader: v.uploader || '',
                    thumbnail: v.thumbnail,
                    meta: v.watched_at ? `Watched ${relativeTime(v.watched_at)}` : undefined,
                })));
                setLiked((Array.isArray(likedData) ? likedData : []).map((v) => ({
                    id: v.id,
                    title: v.title,
                    uploader: v.uploader || '',
                    thumbnail: v.thumbnail,
                })));
                setSaved((Array.isArray(savedData) ? savedData : []).map((v) => ({
                    id: v.videoId,
                    title: v.title,
                    uploader: v.channelTitle || '',
                    thumbnail: v.thumbnail,
                })));
            } catch (err) {
                console.error('Failed to fetch library data:', err);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    const sections: { id: SectionId; title: string; items: LibraryItem[] }[] = [
        { id: 'history', title: 'History', items: history },
        { id: 'liked', title: 'Liked videos', items: liked },
        { id: 'saved', title: 'Saved', items: saved },
    ];

    if (loading) {
        return (
            <div style={{ padding: '48px', display: 'flex', justifyContent: 'center' }}>
                <LoadingSpinner />
            </div>
        );
    }

    const isEmpty = history.length === 0 && liked.length === 0 && saved.length === 0;
    const expandedSection = expanded ? sections.find((s) => s.id === expanded) : null;

    return (
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 24px' }}>
            <style>{`
                .import-btn { transition: background-color 0.2s, color 0.2s; }
                .import-btn:hover { background: var(--yt-hover) !important; color: var(--yt-text-primary) !important; }
                .row-arrow {
                    position: absolute; top: 0; bottom: 0; width: 56px; border: none;
                    cursor: pointer; z-index: 2; display: flex; align-items: center; justify-content: center;
                }
            `}</style>

            {/* Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 0 24px',
            }}>
                <h1 style={{ fontSize: '28px', fontWeight: '700', color: 'var(--yt-text-primary)', margin: 0 }}>
                    You
                </h1>
                <button
                    className="import-btn"
                    onClick={() => setShowImport(true)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 16px',
                        borderRadius: '20px',
                        border: '1px solid var(--yt-border)',
                        background: 'transparent',
                        color: 'var(--yt-text-secondary)',
                        fontSize: '14px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                    }}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Import
                </button>
            </div>

            {expandedSection ? (
                <ExpandedGrid
                    title={expandedSection.title}
                    items={expandedSection.items}
                    onBack={() => setExpanded(null)}
                />
            ) : isEmpty ? (
                <div style={{ padding: '64px 24px', textAlign: 'center', color: 'var(--yt-text-secondary)' }}>
                    <h2 style={{ marginBottom: '12px', color: 'var(--yt-text-primary)' }}>Nothing here yet</h2>
                    <p style={{ marginBottom: '20px' }}>Watch videos or import your Google Takeout data to get started.</p>
                    <button
                        onClick={() => setShowImport(true)}
                        style={{
                            padding: '10px 20px',
                            backgroundColor: 'var(--yt-brand-red)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '20px',
                            fontWeight: '500',
                            cursor: 'pointer',
                        }}
                    >
                        Import from Takeout
                    </button>
                </div>
            ) : (
                sections.map((s) => (
                    <SectionRow
                        key={s.id}
                        title={s.title}
                        items={s.items}
                        onViewAll={() => setExpanded(s.id)}
                    />
                ))
            )}

            {showImport && <ImportModal onClose={() => setShowImport(false)} />}
        </div>
    );
}

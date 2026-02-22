export const dynamic = 'force-dynamic';
import { Suspense } from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';

interface VideoData {
    id: string;
    title: string;
    uploader: string;
    channel_id?: string;
    thumbnail: string;
    view_count: number;
    duration: string;
    description: string;
    avatar_url?: string;
    uploaded_date?: string;
}

function formatViews(views: number): string {
    if (views >= 1000000) return (views / 1000000).toFixed(1) + 'M';
    if (views >= 1000) return (views / 1000).toFixed(1) + 'K';
    return views.toString();
}

async function fetchSearchResults(query: string) {
    try {
        const res = await fetch(`http://127.0.0.1:8080/api/search?q=${encodeURIComponent(query)}`, { cache: 'no-store' });
        if (!res.ok) return [];
        return res.json() as Promise<VideoData[]>;
    } catch (e) {
        console.error(e);
        return [];
    }
}

function SearchSkeleton() {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1096px', margin: '0 auto' }}>
            {[1, 2, 3, 4].map(i => (
                <div key={i} style={{ display: 'flex', gap: '16px' }} className={`fade-in-up stagger-${i}`}>
                    <div className="skeleton" style={{ width: '360px', minWidth: '360px', aspectRatio: '16/9', flexShrink: 0 }} />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '4px' }}>
                        <div className="skeleton skeleton-line" style={{ width: '90%', height: '18px' }} />
                        <div className="skeleton skeleton-line" style={{ width: '70%', height: '18px' }} />
                        <div className="skeleton skeleton-line-short" style={{ marginTop: '8px' }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                            <div className="skeleton skeleton-avatar" style={{ width: '24px', height: '24px' }} />
                            <div className="skeleton skeleton-line" style={{ width: '120px' }} />
                        </div>
                        <div className="skeleton skeleton-line" style={{ width: '80%', marginTop: '8px' }} />
                    </div>
                </div>
            ))}
        </div>
    );
}

async function SearchResults({ query }: { query: string }) {
    const videos = await fetchSearchResults(query);

    if (videos.length === 0) {
        return (
            <div className="fade-in" style={{ padding: '48px 24px', color: 'var(--yt-text-secondary)', textAlign: 'center' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔍</div>
                <div style={{ fontSize: '18px', fontWeight: 500, color: 'var(--yt-text-primary)', marginBottom: '8px' }}>
                    No results found
                </div>
                <div>Try different keywords or check your spelling</div>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '1096px', margin: '0 auto' }} className="search-results-container">
            {videos.map((v, i) => {
                const firstLetter = v.uploader ? v.uploader.charAt(0).toUpperCase() : '?';
                const relativeTime = v.uploaded_date || '3 weeks ago';
                const staggerClass = `stagger-${Math.min(i + 1, 6)}`;

                return (
                    <Link href={`/watch?v=${v.id}`} key={v.id} style={{ display: 'flex', gap: '16px', textDecoration: 'none', color: 'inherit', maxWidth: '1096px', borderRadius: '12px', padding: '8px', margin: '-8px', transition: 'background-color 0.2s ease' }} className={`search-result-item search-result-hover fade-in-up ${staggerClass}`}>
                        {/* Thumbnail */}
                        <div style={{ position: 'relative', width: '360px', minWidth: '360px', aspectRatio: '16/9', flexShrink: 0, overflow: 'hidden', borderRadius: '8px' }} className="search-result-thumb-container">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={v.thumbnail}
                                alt={v.title}
                                style={{ width: '100%', height: '100%', objectFit: 'cover', backgroundColor: '#272727' }}
                                className="search-result-thumb"
                            />
                            {v.duration && (
                                <span className="duration-badge" style={{ position: 'absolute', bottom: '8px', right: '8px' }}>
                                    {v.duration}
                                </span>
                            )}
                        </div>

                        {/* Search Result Info */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingTop: '0px' }} className="search-result-info">
                            <h3 style={{ fontSize: '18px', fontWeight: '400', lineHeight: '26px', margin: '0 0 4px 0', color: 'var(--yt-text-primary)' }} className="search-result-title">
                                {v.title}
                            </h3>
                            <div style={{ fontSize: '12px', color: 'var(--yt-text-secondary)', marginBottom: '12px' }}>
                                {formatViews(v.view_count)} views • {relativeTime}
                            </div>

                            {/* Channel block inline */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--yt-avatar-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#fff', overflow: 'hidden', fontWeight: 600 }}>
                                        {v.avatar_url ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={v.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : firstLetter}
                                    </div>
                                    <span style={{ fontSize: '12px', color: 'var(--yt-text-secondary)' }}>{v.uploader}</span>
                                </div>
                            </div>

                            <div className="truncate-2-lines" style={{ fontSize: '12px', color: 'var(--yt-text-secondary)', lineHeight: '18px' }}>
                                {v.description || 'No description provided.'}
                            </div>
                        </div>
                    </Link>
                );
            })}
        </div>
    );
}

const REGION_LABELS: Record<string, string> = {
    VN: 'Vietnam',
    US: 'United States',
    JP: 'Japan',
    KR: 'South Korea',
    IN: 'India',
    GB: 'United Kingdom',
    GLOBAL: '',
};

export default async function SearchPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const awaitParams = await searchParams;
    const q = awaitParams.q as string;

    if (!q) {
        return (
            <div className="fade-in" style={{ padding: '48px 24px', color: 'var(--yt-text-secondary)', textAlign: 'center' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔍</div>
                <div style={{ fontSize: '18px', fontWeight: 500, color: 'var(--yt-text-primary)', marginBottom: '8px' }}>
                    Search KV-Tube
                </div>
                <div>Enter a search term above to find videos</div>
            </div>
        );
    }

    const cookieStore = await cookies();
    const regionCode = cookieStore.get('region')?.value || 'VN';
    const regionLabel = REGION_LABELS[regionCode] || '';
    const biasedQuery = regionLabel ? `${q} ${regionLabel}` : q;

    return (
        <div style={{ padding: '16px 24px 24px 24px' }} className="search-page-container">
            <Suspense fallback={<SearchSkeleton />}>
                <SearchResults query={biasedQuery} />
            </Suspense>
        </div>
    );
}

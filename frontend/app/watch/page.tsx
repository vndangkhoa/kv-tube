import { Suspense } from 'react';
import type { Metadata } from 'next';
import ClientWatchPage from './ClientWatchPage';
import LoadingSpinner from '../components/LoadingSpinner';

type WatchPageProps = {
    searchParams: Promise<{ v?: string }>;
};

// Dynamic Open Graph metadata so that sharing a watch URL to Messenger,
// Facebook, Discord, Slack, etc. shows the video title + thumbnail (and lets
// the platform offer a video card). Uses YouTube's lightweight oEmbed endpoint
// with a strict AbortSignal timeout so SSR metadata never triggers heavy
// uncancelled player extractions against Companion/YouTube.
export async function generateMetadata({ searchParams }: WatchPageProps): Promise<Metadata> {
    const params = await searchParams;
    const videoId = params?.v;

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://ut.khoavo.myds.me').replace(/\/$/, '');
    const pageUrl = videoId ? `${siteUrl}/watch?v=${videoId}` : siteUrl;

    if (!videoId) {
        return {
            title: 'KV-Tube — YouTube KHÔNG QUẢNG CÁO',
            description: 'Xem video không quảng cáo với âm thanh nền trên KV-Tube.',
        };
    }

    let title = 'Watch Video on KV-Tube';
    let description = 'Xem video không quảng cáo với âm thanh nền trên KV-Tube.';
    let uploader = '';

    try {
        const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&format=json`;
        const res = await fetch(oembedUrl, {
            signal: AbortSignal.timeout(1200),
            headers: {
                Accept: 'application/json',
            },
        });
        if (res.ok) {
            const oembed = await res.json();
            if (oembed?.title) title = oembed.title;
            if (oembed?.author_name) uploader = oembed.author_name;
            description = `Xem "${title}" bởi ${uploader || 'kênh YouTube'} không quảng cáo trên KV-Tube.`;
        }
    } catch (_) {
        // Graceful fallback to static title and YouTube thumbnail CDN on timeout/error
    }

    // Use reliable high-resolution HTTPS YouTube thumbnail CDN for social media crawlers
    // (Facebook/Messenger crawler requires secure HTTPS and rejects unreachable internal proxy URLs).
    const maxresImg = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
    const hqImg = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    const mqImg = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;

    return {
        title: `${title} - KV-Tube`,
        description,
        alternates: {
            canonical: pageUrl,
        },
        openGraph: {
            type: 'video.other',
            siteName: 'KV-Tube',
            title,
            description,
            url: pageUrl,
            images: [
                {
                    url: maxresImg,
                    secureUrl: maxresImg,
                    width: 1280,
                    height: 720,
                    type: 'image/jpeg',
                    alt: title,
                },
                {
                    url: hqImg,
                    secureUrl: hqImg,
                    width: 480,
                    height: 360,
                    type: 'image/jpeg',
                    alt: title,
                },
                {
                    url: mqImg,
                    secureUrl: mqImg,
                    width: 320,
                    height: 180,
                    type: 'image/jpeg',
                    alt: title,
                },
            ],
            videos: [
                {
                    url: `https://www.youtube.com/embed/${videoId}`,
                    secureUrl: `https://www.youtube.com/embed/${videoId}`,
                    type: 'text/html',
                    width: 1280,
                    height: 720,
                },
            ],
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description,
            images: [maxresImg, hqImg],
        },
    };
}

export default function WatchPage() {
    return (
        <Suspense fallback={<LoadingSpinner fullScreen text="Resolving video stream..." />}>
            <ClientWatchPage />
        </Suspense>
    );
}
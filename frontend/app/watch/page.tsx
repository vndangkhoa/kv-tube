import { Suspense } from 'react';
import type { Metadata } from 'next';
import ClientWatchPage from './ClientWatchPage';
import LoadingSpinner from '../components/LoadingSpinner';
import { invidious } from '../services/invidious';

type WatchPageProps = {
    searchParams: Promise<{ v?: string }>;
};

// Dynamic Open Graph metadata so that sharing a watch URL to Messenger,
// Facebook, Discord, Slack, etc. shows the video title + thumbnail (and lets
// the platform offer a video card). The crawler fetches this HTML server-side,
// so we hydrate the tags from the backend before returning the page.
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
        const invVideo = await invidious.getVideo(videoId);
        if (invVideo) {
            if (invVideo.title) title = invVideo.title;
            if (invVideo.author) uploader = invVideo.author;
            description = `Xem "${title}" bởi ${uploader || 'kênh YouTube'} không quảng cáo trên KV-Tube.`;
        }
    } catch (_) {}

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
        <Suspense fallback={<LoadingSpinner fullScreen text="Loading video..." />}>
            <ClientWatchPage />
        </Suspense>
    );
}
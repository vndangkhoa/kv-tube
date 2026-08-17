import { Suspense } from 'react';
import type { Metadata } from 'next';
import ClientWatchPage from './ClientWatchPage';
import LoadingSpinner from '../components/LoadingSpinner';

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

    if (!videoId) {
        return {
            title: 'Watch Video - KV-Tube',
            description: 'Watch videos on KV-Tube with background playback.',
        };
    }

    let title = 'Watch Video';
    let description = 'Watch this video on KV-Tube with background playback.';
    let thumbnail = '';
    let uploader = '';

    try {
        // Server-side fetch needs an absolute URL (Node fetch rejects relative
        // URLs). The backend is always reachable on this origin — same default
        // the Next.js rewrite in next.config uses.
        const backendBase = process.env.BACKEND_URL || 'http://localhost:8080';
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(`${backendBase}/api/video/${videoId}`, {
            signal: controller.signal,
            cache: 'no-store',
        });
        clearTimeout(timer);

        if (res.ok) {
            const data = await res.json();
            if (data?.title) title = data.title;
            if (data?.thumbnail) thumbnail = data.thumbnail;
            if (data?.uploader) uploader = data.uploader;
            if (data?.description) description = data.description;
            if (!data?.description && uploader) {
                description = `Watch "${title}" by ${uploader} on KV-Tube.`;
            }
        }
    } catch (error: any) {
        // Metadata is best-effort; never block the page on it.
        if (error?.name !== 'AbortError') {
            console.warn('Failed to fetch video info for link preview:', error?.message || String(error));
        }
    }

    // Prefer the high-res thumbnail; fall back to the standard i.ytimg URL
    // built from the video ID so the preview still has an image.
    const imageUrl =
        thumbnail && thumbnail.startsWith('http')
            ? thumbnail
            : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    return {
        title,
        description,
        openGraph: {
            type: 'video.other',
            siteName: 'KV-Tube',
            title,
            description,
            url: `/watch?v=${videoId}`,
            images: [
                {
                    url: imageUrl,
                    width: 480,
                    height: 360,
                    alt: title,
                },
            ],
            videos: [`https://www.youtube.com/watch?v=${videoId}`],
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description,
            images: [imageUrl],
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
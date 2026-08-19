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
        const invVideo = await invidious.getVideo(videoId);
        if (invVideo) {
            if (invVideo.title) title = invVideo.title;
            if (invVideo.author) uploader = invVideo.author;
            if (invVideo.videoThumbnails?.[0]?.url) thumbnail = invVideo.videoThumbnails[0].url;
            description = `Watch "${title}" by ${uploader || 'creator'} on KV-Tube.`;
        }
    } catch (_) {}

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
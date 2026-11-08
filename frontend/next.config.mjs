import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
    output: "standalone",
    outputFileTracingRoot: rootDir,
    turbopack: {
        root: rootDir,
    },
    reactStrictMode: true,
    devIndicators: false,
    typescript: { ignoreBuildErrors: false },
    images: {
        remotePatterns: [
            { protocol: 'https', hostname: 'i.ytimg.com' },
            { protocol: 'https', hostname: 'yt3.ggpht.com' },
            { protocol: 'https', hostname: '*.ggpht.com' },
            { protocol: 'https', hostname: '*.googleusercontent.com' },
        ],
    },
    async rewrites() {
        return [
            {
                source: '/companion/:path*',
                destination: '/api/invidious/companion/:path*',
            },
            {
                source: '/videoplayback',
                destination: '/api/invidious/videoplayback',
            },
            {
                source: '/videoplayback/:path+',
                destination: '/api/invidious/videoplayback/:path+',
            },
            {
                source: '/latest_version',
                destination: '/api/invidious/latest_version',
            },
            {
                source: '/api/manifest/:path*',
                destination: '/api/invidious/api/manifest/:path*',
            },
        ];
    },
};

export default nextConfig;

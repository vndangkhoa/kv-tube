/** @type {import('next').NextConfig} */
const nextConfig = {
    output: "standalone",
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'i.ytimg.com',
            },
            {
                protocol: 'https',
                hostname: 'yt3.ggpht.com',
            },
        ],
    },
    async rewrites() {
        const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8080';
        return [
            {
                source: '/api/:path*',
                destination: `${apiBase}/api/:path*`,
            },
            {
                source: '/video_proxy',
                destination: `${apiBase}/video_proxy`,
            },
        ];
    },
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
    output: "standalone",
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'i.ytimg.com',
            },
        ],
    },
    async rewrites() {
        return [
            {
                source: '/api/:path*',
                destination: 'http://127.0.0.1:8080/api/:path*',
            },
            {
                source: '/video_proxy',
                destination: 'http://127.0.0.1:8080/video_proxy',
            },
        ];
    },
};

export default nextConfig;

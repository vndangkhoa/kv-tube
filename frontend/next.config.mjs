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
                destination: 'http://kv-tube-backend:8080/api/:path*',
            },
            {
                source: '/video_proxy',
                destination: 'http://kv-tube-backend:8080/video_proxy',
            },
        ];
    },
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
    output: "standalone",
    reactStrictMode: true,
    eslint: { ignoreDuringBuilds: true },
    typescript: { ignoreBuildErrors: false },
    images: {
        remotePatterns: [
            { protocol: 'https', hostname: 'i.ytimg.com' },
            { protocol: 'https', hostname: 'yt3.ggpht.com' },
        ],
    },
    async rewrites() {
        const apiBase = 'http://localhost:8080';
        return [
            { source: '/api/:path*', destination: `${apiBase}/api/:path*` },
        ];
    },
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
    output: "standalone",
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
};

export default nextConfig;

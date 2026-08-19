import type { Metadata } from 'next';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import './globals.css';

import Header from './components/Header';
import Sidebar from './components/Sidebar';
import MobileNav from './components/MobileNav';
import HamburgerMenu from './components/HamburgerMenu';
import MainContent from './components/MainContent';
import OrientationGuard from './components/OrientationGuard';
import PersistentPlayer from './components/PersistentPlayer';
import { PlayerProvider } from './context/PlayerContext';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: 'KV-Tube',
  description: 'Ad-free lightweight video streaming platform with background playback',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: ['/favicon.ico'],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'KV-Tube',
    startupImage: [
      {
        url: '/apple-touch-icon.png',
        media: '(device-width: 1024px)',
      },
    ],
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
    'apple-mobile-web-app-title': 'KV-Tube',
    'application-name': 'KV-Tube',
    'theme-color': '#0f0f0f',
    'msapplication-TileColor': '#ff0033',
  },
};

export const viewport = {
  themeColor: '#0f0f0f',
};

import { ThemeProvider } from './context/ThemeContext';
import { SidebarProvider } from './context/SidebarContext';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('theme') || 'dark';
                  document.documentElement.setAttribute('data-theme', theme);
                } catch (e) {}
              })();
            `,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js');
                });
              }
            `,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          <SidebarProvider>
            <PlayerProvider>
              <Header />
              <Sidebar />
              <HamburgerMenu />
              <MainContent>
                {children}
              </MainContent>
              <div id="mini-player-mount" />
              <PersistentPlayer />
              <MobileNav />
              <OrientationGuard />
            </PlayerProvider>
          </SidebarProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

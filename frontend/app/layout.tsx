import type { Metadata } from 'next';
import { Roboto } from 'next/font/google';
import './globals.css';

import Header from './components/Header';
import Sidebar from './components/Sidebar';
import MobileNav from './components/MobileNav';
import HamburgerMenu from './components/HamburgerMenu';
import MainContent from './components/MainContent';
import OrientationGuard from './components/OrientationGuard';

const roboto = Roboto({
  weight: ['400', '500', '700'],
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'KV-Tube',
  description: 'A modern YouTube-like video streaming platform with background playback',
  manifest: '/manifest.json',
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    shortcut: ['/icon.svg'],
    apple: [{ url: '/apple-touch-icon.png' }],
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
    'theme-color': '#ff0000',
  },
};

export const viewport = {
  themeColor: '#000000',
};

import { ThemeProvider } from './context/ThemeContext';
import { SidebarProvider } from './context/SidebarContext';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={roboto.className} suppressHydrationWarning>
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
            <Header />
            <Sidebar />
            <HamburgerMenu />
            <MainContent>
              {children}
            </MainContent>
            <MobileNav />
            <OrientationGuard />
          </SidebarProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

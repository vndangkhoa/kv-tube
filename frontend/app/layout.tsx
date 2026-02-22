import type { Metadata } from 'next';
import { Roboto } from 'next/font/google';
import './globals.css';

import Header from './components/Header';
import Sidebar from './components/Sidebar';
import MobileNav from './components/MobileNav';

const roboto = Roboto({
  weight: ['400', '500', '700'],
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'KV-Tube',
  description: 'A pixel perfect YouTube clone',
};

import { ThemeProvider } from './context/ThemeContext';

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
      </head>
      <body>
        <ThemeProvider>
          <Header />
          <Sidebar />
          <main className="yt-main-content">
            {children}
          </main>
          <MobileNav />
        </ThemeProvider>
      </body>
    </html>
  );
}

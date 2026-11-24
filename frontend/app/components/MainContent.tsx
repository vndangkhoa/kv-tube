'use client';

import { useSidebar } from '../context/SidebarContext';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';

export default function MainContent({ children }: { children: ReactNode }) {
    const { isSidebarOpen } = useSidebar();
    const pathname = usePathname();
    const isWatchPage = pathname === '/watch';
    const isShortsPage = pathname === '/shorts';
    
    return (
        <main className={`yt-main-content ${isWatchPage ? 'watch-mode' : (isSidebarOpen ? 'sidebar-expanded' : 'sidebar-collapsed')}${isShortsPage ? ' shorts-mode' : ''}`}>
            {children}
        </main>
    );
}
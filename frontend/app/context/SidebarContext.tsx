'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

interface SidebarContextType {
    isSidebarOpen: boolean;
    toggleSidebar: () => void;
    openSidebar: () => void;
    closeSidebar: () => void;
    isWatchDrawerOpen: boolean;
    toggleWatchDrawer: () => void;
    closeWatchDrawer: () => void;
    isMobileMenuOpen: boolean;
    toggleMobileMenu: () => void;
    openMobileMenu: () => void;
    closeMobileMenu: () => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: ReactNode }) {
    // Collapsed (false) = icon-only mini bar (72px)
    // Expanded (true) = full sidebar drawer (240px)
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isWatchDrawerOpen, setIsWatchDrawerOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    useEffect(() => {
        try {
            const saved = localStorage.getItem('kv_sidebar_open_v2');
            if (saved !== null) {
                setIsSidebarOpen(saved === 'true');
            }
        } catch {}
    }, []);

    const toggleSidebar = useCallback(() => {
        setIsSidebarOpen((prev) => {
            const next = !prev;
            try { localStorage.setItem('kv_sidebar_open_v2', String(next)); } catch {}
            return next;
        });
    }, []);

    const openSidebar = useCallback(() => {
        setIsSidebarOpen(true);
        try { localStorage.setItem('kv_sidebar_open_v2', 'true'); } catch {}
    }, []);

    const closeSidebar = useCallback(() => {
        setIsSidebarOpen(false);
        try { localStorage.setItem('kv_sidebar_open_v2', 'false'); } catch {}
    }, []);

    const toggleWatchDrawer = useCallback(() => setIsWatchDrawerOpen((prev) => !prev), []);
    const closeWatchDrawer = useCallback(() => setIsWatchDrawerOpen(false), []);

    const toggleMobileMenu = useCallback(() => setIsMobileMenuOpen(prev => !prev), []);
    const openMobileMenu = useCallback(() => setIsMobileMenuOpen(true), []);
    const closeMobileMenu = useCallback(() => setIsMobileMenuOpen(false), []);

    // Prevent body scroll when mobile menu is open
    useEffect(() => {
        if (isMobileMenuOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isMobileMenuOpen]);

    return (
        <SidebarContext.Provider value={{ 
            isSidebarOpen, toggleSidebar, openSidebar, closeSidebar,
            isWatchDrawerOpen, toggleWatchDrawer, closeWatchDrawer,
            isMobileMenuOpen, toggleMobileMenu, openMobileMenu, closeMobileMenu
        }}>
            {children}
        </SidebarContext.Provider>
    );
}

export function useSidebar() {
    const context = useContext(SidebarContext);
    if (context === undefined) {
        throw new Error('useSidebar must be used within a SidebarProvider');
    }
    return context;
}
'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface SidebarContextType {
    isSidebarOpen: boolean;
    toggleSidebar: () => void;
    openSidebar: () => void;
    closeSidebar: () => void;
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
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    useEffect(() => {
        try {
            const saved = localStorage.getItem('kv_sidebar_open');
            if (saved !== null) {
                setIsSidebarOpen(saved === 'true');
            }
        } catch {}
    }, []);

    const toggleSidebar = () => {
        setIsSidebarOpen((prev) => {
            const next = !prev;
            try { localStorage.setItem('kv_sidebar_open', String(next)); } catch {}
            return next;
        });
    };

    const openSidebar = () => {
        setIsSidebarOpen(true);
        try { localStorage.setItem('kv_sidebar_open', 'true'); } catch {}
    };

    const closeSidebar = () => {
        setIsSidebarOpen(false);
        try { localStorage.setItem('kv_sidebar_open', 'false'); } catch {}
    };

    const toggleMobileMenu = () => setIsMobileMenuOpen(prev => !prev);
    const openMobileMenu = () => setIsMobileMenuOpen(true);
    const closeMobileMenu = () => setIsMobileMenuOpen(false);

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
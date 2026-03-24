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
    // Sidebar is collapsed by default on desktop
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // Load saved preference from localStorage
    useEffect(() => {
        const saved = localStorage.getItem('sidebarOpen');
        if (saved !== null) {
            setIsSidebarOpen(saved === 'true');
        }
    }, []);

    // Save preference to localStorage
    useEffect(() => {
        localStorage.setItem('sidebarOpen', isSidebarOpen.toString());
    }, [isSidebarOpen]);

    const toggleSidebar = () => setIsSidebarOpen(prev => !prev);
    const openSidebar = () => setIsSidebarOpen(true);
    const closeSidebar = () => setIsSidebarOpen(false);

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
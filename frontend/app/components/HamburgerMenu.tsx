'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MdHomeFilled, MdOutlineSubscriptions, MdOutlineVideoLibrary, MdClose } from 'react-icons/md';
import { useSidebar } from '../context/SidebarContext';
import { useEffect } from 'react';

export default function HamburgerMenu() {
    const pathname = usePathname();
    const { isMobileMenuOpen, closeMobileMenu, isSidebarOpen, openSidebar } = useSidebar();

    const navItems = [
        { icon: <MdHomeFilled size={24} />, label: 'Home', path: '/' },
        { icon: <MdOutlineSubscriptions size={24} />, label: 'Sub', path: '/feed/subscriptions' },
        { icon: <MdOutlineVideoLibrary size={24} />, label: 'You', path: '/feed/library' },
    ];

    // Close menu on route change
    useEffect(() => {
        closeMobileMenu();
    }, [pathname, closeMobileMenu]);

    return (
        <>
            {/* Backdrop */}
            <div 
                className={`drawer-backdrop ${isMobileMenuOpen ? 'open' : ''}`}
                onClick={closeMobileMenu}
            />

            {/* Menu Drawer */}
            <div className={`hamburger-drawer ${isMobileMenuOpen ? 'open' : ''}`}>
                <div className="drawer-header">
                    <button className="yt-icon-btn" onClick={closeMobileMenu} title="Close Menu">
                        <MdClose size={24} />
                    </button>
                    <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '12px' }} onClick={closeMobileMenu}>
                        <span style={{ fontSize: '18px', fontWeight: '700', letterSpacing: '-0.5px', fontFamily: 'YouTube Sans, Roboto, Arial, sans-serif' }}>KV-Tube</span>
                    </Link>
                </div>

                <div className="drawer-content">
                    {navItems.map((item) => {
                        const isActive = pathname === item.path;
                        return (
                            <Link
                                key={item.label}
                                href={item.path}
                                className={`drawer-nav-item ${isActive ? 'active' : ''}`}
                                onClick={closeMobileMenu}
                            >
                                <div className="drawer-nav-icon">
                                    {item.icon}
                                </div>
                                <span className="drawer-nav-label">
                                    {item.label}
                                </span>
                            </Link>
                        );
                    })}
                    <div className="drawer-divider" />
                    <div style={{ padding: '16px 24px', fontSize: '13px', color: 'var(--yt-text-secondary)' }}>
                        Made with &#9825; locally
                    </div>
                </div>
            </div>
        </>
    );
}

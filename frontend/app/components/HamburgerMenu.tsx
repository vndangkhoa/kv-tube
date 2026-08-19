'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  IoHomeOutline,
  IoHome,
  IoFlameOutline,
  IoFlame,
  IoFlashOutline,
  IoFlash,
  IoPlayOutline,
  IoPlay,
  IoTimeOutline,
  IoBookmarkOutline,
  IoBookmark,
  IoSettingsOutline,
  IoCloseOutline,
} from 'react-icons/io5';
import { useSidebar } from '../context/SidebarContext';
import { useEffect } from 'react';
import { Logo } from '../icons';

export default function HamburgerMenu() {
  const pathname = usePathname();
  const { isMobileMenuOpen, closeMobileMenu } = useSidebar();

  const navItems = [
    {
      icon: (active: boolean) => (active ? <IoHome size={22} /> : <IoHomeOutline size={22} />),
      label: 'Home',
      path: '/',
    },
    {
      icon: (active: boolean) => (active ? <IoFlame size={22} /> : <IoFlameOutline size={22} />),
      label: 'Trending',
      path: '/feed/trending',
    },
    {
      icon: (active: boolean) => (active ? <IoFlash size={22} /> : <IoFlashOutline size={22} />),
      label: 'Shorts',
      path: '/shorts',
    },
    {
      icon: (active: boolean) => (active ? <IoPlay size={22} /> : <IoPlayOutline size={22} />),
      label: 'Subscriptions',
      path: '/feed/subscriptions',
    },
    {
      icon: (active: boolean) => <IoTimeOutline size={22} />,
      label: 'Watch History',
      path: '/feed/history',
    },
    {
      icon: (active: boolean) => <IoSettingsOutline size={22} />,
      label: 'Settings',
      path: '/settings',
    },
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
      <div
        className={`hamburger-drawer ${isMobileMenuOpen ? 'open' : ''}`}
        style={{
          backgroundColor: 'var(--yt-surface)',
          borderRight: '1px solid var(--yt-border)',
        }}
      >
        <div className="drawer-header" style={{ gap: '12px' }}>
          <button className="yt-icon-btn" onClick={closeMobileMenu} title="Close Menu">
            <IoCloseOutline size={24} />
          </button>
          <Link
            href="/"
            style={{ display: 'flex', alignItems: 'center' }}
            onClick={closeMobileMenu}
          >
            <Logo size={24} showText />
          </Link>
        </div>

        <div className="drawer-content" style={{ padding: '12px 8px' }}>
          {navItems.map((item) => {
            const isActive = pathname === item.path;
            return (
              <Link
                key={item.label}
                href={item.path}
                className={`drawer-nav-item ${isActive ? 'active' : ''}`}
                onClick={closeMobileMenu}
                style={{
                  borderRadius: '24px',
                  marginBottom: '4px',
                  backgroundColor: isActive
                    ? 'var(--md-sys-color-primary-container, var(--yt-hover))'
                    : 'transparent',
                  color: isActive
                    ? 'var(--md-sys-color-on-primary-container, var(--md-sys-color-primary, var(--yt-blue)))'
                    : 'var(--yt-text-primary)',
                  fontWeight: isActive ? 600 : 500,
                }}
              >
                <div className="drawer-nav-icon" style={{ color: 'inherit' }}>
                  {item.icon(isActive)}
                </div>
                <span className="drawer-nav-label">{item.label}</span>
              </Link>
            );
          })}

          <div className="drawer-divider" />

          <div
            style={{
              padding: '16px 20px',
              fontSize: '12px',
              color: 'var(--yt-text-secondary)',
              lineHeight: 1.6,
            }}
          >
            <p style={{ margin: 0, fontWeight: 600, color: 'var(--yt-text-primary)' }}>
              KV-Tube • Materialious
            </p>
            <p style={{ margin: '4px 0 0' }}>Material 3 & Invidious Powered Client</p>
          </div>
        </div>
      </div>
    </>
  );
}

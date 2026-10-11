'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShortsIcon } from '../icons';
import { IoHome, IoHomeOutline, IoPerson, IoPersonOutline } from 'react-icons/io5';
import { triggerHapticSelection } from '../utils/nativeBridge';

export default function MobileNav() {
  const pathname = usePathname();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Strictly desktop mode: do not render bottom nav on desktop screens or watch page
  if (!isMobile || pathname === '/watch') {
    return null;
  }

  const navItems = [
    {
      label: 'Shorts',
      path: '/shorts',
      icon: (active: boolean) => (
        <ShortsIcon
          size={22}
          filled={active}
          color={active ? 'var(--yt-text-primary, #F1F1F1)' : 'var(--yt-text-secondary, #AAAAAA)'}
        />
      ),
    },
    {
      label: 'Home',
      path: '/',
      icon: (active: boolean) =>
        active ? (
          <IoHome size={22} color="var(--yt-text-primary, #F1F1F1)" />
        ) : (
          <IoHomeOutline size={22} color="var(--yt-text-secondary, #AAAAAA)" />
        ),
    },
    {
      label: 'Account',
      path: '/feed/library',
      icon: (active: boolean) =>
        active ? (
          <IoPerson size={22} color="var(--yt-text-primary, #F1F1F1)" />
        ) : (
          <IoPersonOutline size={22} color="var(--yt-text-secondary, #AAAAAA)" />
        ),
    },
  ];

  const handleTabClick = (path: string, isActive: boolean) => {
    triggerHapticSelection();
    if (isActive) {
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  };

  return (
    <nav
      className="mobile-nav"
      style={{
        backgroundColor: 'var(--yt-background, #0F0F0F)',
        borderTop: '0.8px solid var(--yt-border, rgba(255,255,255,0.15))',
        height: 'calc(48px + env(safe-area-inset-bottom, 0px))',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        zIndex: 999,
        alignItems: 'center',
        justifyContent: 'space-around',
      }}
    >
      {navItems.map((item) => {
        const isActive =
          item.path === '/'
            ? pathname === '/'
            : pathname.startsWith(item.path);

        const itemColor = isActive
          ? 'var(--yt-text-primary, #F1F1F1)'
          : 'var(--yt-text-secondary, #AAAAAA)';

        return (
          <Link
            key={item.label}
            href={item.path}
            onClick={() => handleTabClick(item.path, isActive)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              height: '48px',
              padding: '4px 0',
              textDecoration: 'none',
              transition: 'color 0.15s ease',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '24px',
              }}
            >
              {item.icon(isActive)}
            </div>
            <span
              style={{
                marginTop: '2px',
                fontSize: '10px',
                fontWeight: isActive ? 500 : 400,
                color: itemColor,
                lineHeight: 1.2,
                letterSpacing: '0.1px',
              }}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { HomeIcon, SubscriptionsIcon, TrendingIcon, ShortsIcon } from '../icons';
import { IoTimeOutline } from 'react-icons/io5';

export default function MobileNav() {
  const pathname = usePathname();

  const navItems = [
    { icon: <HomeIcon size={20} />, label: 'Home', path: '/' },
    { icon: <TrendingIcon size={20} />, label: 'Trending', path: '/feed/trending' },
    { icon: <ShortsIcon size={20} />, label: 'Shorts', path: '/shorts' },
    { icon: <SubscriptionsIcon size={20} />, label: 'Subs', path: '/feed/subscriptions' },
    { icon: <IoTimeOutline size={20} />, label: 'History', path: '/feed/history' },
  ];

  return (
    <nav
      className="mobile-nav"
      style={{
        backgroundColor: 'var(--yt-surface)',
        backdropFilter: 'blur(16px)',
        borderTop: '1px solid var(--yt-border)',
        height: '64px',
        padding: '0 8px',
        zIndex: 999,
      }}
    >
      {navItems.map((item) => {
        const isActive = pathname === item.path;
        return (
          <Link
            key={item.label}
            href={item.path}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              gap: '4px',
              textDecoration: 'none',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {/* Active Pill Indicator */}
            <div
              style={{
                width: '48px',
                height: '28px',
                borderRadius: '14px',
                backgroundColor: isActive
                  ? 'var(--md-sys-color-primary-container, var(--yt-hover))'
                  : 'transparent',
                color: isActive
                  ? 'var(--md-sys-color-on-primary-container, var(--md-sys-color-primary, var(--yt-blue)))'
                  : 'var(--yt-text-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              {item.icon}
            </div>
            <span
              style={{
                fontSize: '10px',
                fontWeight: isActive ? 600 : 500,
                color: isActive
                  ? 'var(--md-sys-color-primary, var(--yt-text-primary))'
                  : 'var(--yt-text-secondary)',
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

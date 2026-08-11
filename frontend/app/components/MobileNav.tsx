'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { HomeIcon, SubscriptionsIcon, LibraryIcon, SettingsIcon } from '../icons';

export default function MobileNav() {
    const pathname = usePathname();

    const navItems = [
        { icon: <HomeIcon size={24} />, label: 'Home', path: '/' },
        { icon: <SubscriptionsIcon size={24} />, label: 'Sub', path: '/feed/subscriptions' },
        { icon: <LibraryIcon size={24} />, label: 'You', path: '/feed/library' },
        { icon: <SettingsIcon size={24} />, label: 'Settings', path: '/settings' },
    ];

    return (
        <nav className="mobile-nav">
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
                            gap: '2px',
                            color: isActive ? 'var(--yt-text-primary)' : 'var(--yt-text-secondary)',
                            textDecoration: 'none',
                            transition: 'var(--yt-transition)'
                        }}
                    >
                        <div style={{ color: isActive ? 'var(--yt-text-primary)' : 'inherit' }}>
                            {item.icon}
                        </div>
                        <span style={{
                            fontSize: '10px',
                            fontWeight: isActive ? '500' : '400',
                        }}>
                            {item.label}
                        </span>
                    </Link>
                );
            })}
        </nav>
    );
}

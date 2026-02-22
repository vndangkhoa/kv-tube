'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MdHomeFilled, MdOutlineSubscriptions, MdOutlineVideoLibrary } from 'react-icons/md';
import { SiYoutubeshorts } from 'react-icons/si';

export default function Sidebar() {
    const pathname = usePathname();

    const navItems = [
        { icon: <MdHomeFilled size={24} />, label: 'Home', path: '/' },
        { icon: <SiYoutubeshorts size={24} />, label: 'Shorts', path: '/shorts' },
        { icon: <MdOutlineSubscriptions size={24} />, label: 'Subscriptions', path: '/feed/subscriptions' },
        { icon: <MdOutlineVideoLibrary size={24} />, label: 'You', path: '/feed/library' },
    ];

    return (
        <aside className="yt-sidebar-mini">
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
                            padding: '16px 0 14px 0',
                            borderRadius: '10px',
                            backgroundColor: isActive ? 'var(--yt-hover)' : 'transparent',
                            marginBottom: '4px',
                            transition: 'var(--yt-transition)',
                            gap: '4px',
                            position: 'relative',
                        }}
                        className="yt-sidebar-item"
                    >
                        {isActive && <div className="sidebar-active-indicator" />}
                        <div style={{ color: 'var(--yt-text-primary)', transition: 'transform 0.15s ease' }}>
                            {item.icon}
                        </div>
                        <span style={{
                            fontSize: '10px',
                            fontWeight: isActive ? '600' : '400',
                            color: 'var(--yt-text-primary)',
                            letterSpacing: '0.3px'
                        }}>
                            {item.label}
                        </span>
                    </Link>
                );
            })}
        </aside>
    );
}

'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ShortsIcon } from '../icons';
import { IoHome, IoHomeOutline, IoPerson, IoPersonOutline } from 'react-icons/io5';
import { triggerHapticSelection } from '../utils/nativeBridge';
import { usePlayer } from '../context/PlayerContext';

export default function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { isMiniPlayerOpen } = usePlayer();
  const trackRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Strictly mobile browse mode: hide on desktop, /watch, or whenever floating mini-player is open
  if (!isMobile || pathname === '/watch' || isMiniPlayerOpen) {
    return null;
  }

  const navItems = [
    {
      label: 'Shorts',
      path: '/shorts',
      icon: (active: boolean) => (
        <ShortsIcon
          size={21}
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
          <IoHome size={21} color="var(--yt-text-primary, #F1F1F1)" />
        ) : (
          <IoHomeOutline size={21} color="var(--yt-text-secondary, #AAAAAA)" />
        ),
    },
    {
      label: 'Account',
      path: '/feed/library',
      icon: (active: boolean) =>
        active ? (
          <IoPerson size={21} color="var(--yt-text-primary, #F1F1F1)" />
        ) : (
          <IoPersonOutline size={21} color="var(--yt-text-secondary, #AAAAAA)" />
        ),
    },
  ];

  const activeIndex = pathname.startsWith('/shorts')
    ? 0
    : pathname.startsWith('/feed') ||
        pathname.startsWith('/settings') ||
        pathname.startsWith('/downloads')
      ? 2
      : 1;

  const displayIndex = dragIndex ?? hoveredIndex ?? activeIndex;

  const indexFromClientX = (clientX: number): number | null => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return null;
    const raw = Math.floor(((clientX - rect.left) / rect.width) * navItems.length);
    return Math.max(0, Math.min(navItems.length - 1, raw));
  };

  const handleTabClick = (path: string, isActive: boolean) => {
    triggerHapticSelection();
    if (isActive && typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <nav
      className="mobile-nav lg-floating lg-capsule"
      style={{ zIndex: 999 }}
      onPointerLeave={() => {
        setHoveredIndex(null);
        setDragIndex(null);
      }}
      onTouchStart={(e) => {
        if (e.touches.length === 1) {
          const idx = indexFromClientX(e.touches[0].clientX);
          if (idx !== null) setDragIndex(idx);
        }
      }}
      onTouchMove={(e) => {
        if (e.touches.length === 1) {
          const idx = indexFromClientX(e.touches[0].clientX);
          if (idx !== null) setDragIndex(idx);
        }
      }}
      onTouchEnd={() => {
        if (dragIndex !== null && dragIndex !== activeIndex) {
          triggerHapticSelection();
          router.push(navItems[dragIndex].path);
        }
        setDragIndex(null);
      }}
      onTouchCancel={() => setDragIndex(null)}
    >
      <div className="mobile-nav-track" ref={trackRef}>
        <div
          className={`mobile-nav-slider ${hoveredIndex !== null || dragIndex !== null ? 'is-interactive' : ''}`}
          style={{ transform: `translate3d(${displayIndex * 100}%, 0, 0)` }}
          aria-hidden="true"
        />
        {navItems.map((item, idx) => {
          const isActive = idx === activeIndex;
          const isHighlighted = idx === displayIndex;
          const itemColor = isHighlighted
            ? 'var(--yt-text-primary, #F1F1F1)'
            : 'var(--yt-text-secondary, #AAAAAA)';

          return (
            <Link
              key={item.label}
              href={item.path}
              onPointerEnter={() => setHoveredIndex(idx)}
              onClick={() => handleTabClick(item.path, isActive)}
              className={`mobile-nav-item ${isActive ? 'active' : ''}`}
              style={{
                position: 'relative',
                zIndex: 2,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                padding: '4px 0',
                textDecoration: 'none',
                transition: 'color 0.15s ease',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <div
                className="mobile-nav-pill"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '24px',
                }}
              >
                {item.icon(isHighlighted)}
              </div>
              <span
                style={{
                  marginTop: '2px',
                  fontSize: '10px',
                  fontWeight: isHighlighted ? 600 : 400,
                  color: itemColor,
                  lineHeight: 1.15,
                  letterSpacing: '0.1px',
                }}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useSidebar } from '../context/SidebarContext';
import { HomeIcon, SubscriptionsIcon, SettingsIcon, TrendingIcon, ShortsIcon } from '../icons';
import { getSubscriptions, Subscription } from '../storage';
import {
  IoTimeOutline,
  IoSettingsOutline,
  IoFlameOutline,
  IoChevronForwardOutline,
} from 'react-icons/io5';

export default function Sidebar() {
  const pathname = usePathname();
  const { isSidebarOpen } = useSidebar();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);

  useEffect(() => {
    try {
      setSubscriptions(getSubscriptions());
    } catch {}
  }, [pathname]);

  const mainNavItems = [
    { icon: <HomeIcon size={22} />, label: 'Home', path: '/' },
    { icon: <TrendingIcon size={22} />, label: 'Trending', path: '/feed/trending' },
    { icon: <ShortsIcon size={22} />, label: 'Shorts', path: '/shorts' },
    { icon: <SubscriptionsIcon size={22} />, label: 'Subscriptions', shortLabel: 'Subs', path: '/feed/subscriptions' },
  ];

  const secondaryNavItems = [
    { icon: <IoTimeOutline size={22} />, label: 'History', shortLabel: 'History', path: '/feed/history' },
    { icon: <SettingsIcon size={22} />, label: 'Settings', shortLabel: 'Settings', path: '/settings' },
  ];

  return (
    <aside
      className={`yt-sidebar-container ${isSidebarOpen ? 'expanded' : 'collapsed'}`}
      style={{
        position: 'fixed',
        top: 'var(--yt-header-height)',
        bottom: 0,
        left: 0,
        width: isSidebarOpen ? 'var(--yt-sidebar-width-full, 240px)' : 'var(--yt-sidebar-width-mini, 72px)',
        backgroundColor: 'var(--yt-background)',
        borderRight: '1px solid var(--yt-border)',
        zIndex: 600,
        transition: 'width 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s ease',
        overflowX: 'hidden',
        overflowY: isSidebarOpen ? 'hidden' : 'auto',
        scrollbarWidth: 'thin',
        padding: isSidebarOpen ? '12px 12px 24px' : '12px 4px 24px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* 1. Main Navigation Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: isSidebarOpen ? '4px' : '6px' }}>
        {mainNavItems.map((item) => {
          const isActive = pathname === item.path;
          return (
            <Link
              key={item.label}
              href={item.path}
              title={!isSidebarOpen ? item.label : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                flexDirection: isSidebarOpen ? 'row' : 'column',
                justifyContent: isSidebarOpen ? 'flex-start' : 'center',
                gap: isSidebarOpen ? '16px' : '4px',
                padding: isSidebarOpen ? '10px 16px' : '8px 0',
                borderRadius: isSidebarOpen ? '12px' : '16px',
                backgroundColor: isActive
                  ? 'var(--md-sys-color-primary-container, var(--yt-hover))'
                  : 'transparent',
                color: isActive
                  ? 'var(--md-sys-color-on-primary-container, var(--md-sys-color-primary, var(--yt-blue)))'
                  : 'var(--yt-text-primary)',
                textDecoration: 'none',
                transition: 'all 0.18s ease',
                width: '100%',
                fontWeight: isActive ? 600 : 500,
              }}
              className="yt-sidebar-nav-item"
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: isSidebarOpen ? '24px' : '48px',
                  height: isSidebarOpen ? '24px' : '28px',
                  flexShrink: 0,
                }}
              >
                {item.icon}
              </div>
              <span
                style={{
                  fontSize: isSidebarOpen ? '14px' : '10px',
                  fontWeight: isActive ? 600 : 500,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  letterSpacing: isSidebarOpen ? '0.1px' : '0.2px',
                }}
              >
                {isSidebarOpen ? item.label : (item.shortLabel || item.label)}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Divider */}
      <div
        style={{
          height: '1px',
          backgroundColor: 'var(--yt-border)',
          margin: isSidebarOpen ? '12px 8px' : '8px 4px',
        }}
      />

      {/* 2. Secondary Navigation Section (History & Settings) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: isSidebarOpen ? '4px' : '6px' }}>
        {secondaryNavItems.map((item) => {
          const isActive = pathname === item.path;
          return (
            <Link
              key={item.label}
              href={item.path}
              title={!isSidebarOpen ? item.label : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                flexDirection: isSidebarOpen ? 'row' : 'column',
                justifyContent: isSidebarOpen ? 'flex-start' : 'center',
                gap: isSidebarOpen ? '16px' : '4px',
                padding: isSidebarOpen ? '10px 16px' : '8px 0',
                borderRadius: isSidebarOpen ? '12px' : '16px',
                backgroundColor: isActive
                  ? 'var(--md-sys-color-primary-container, var(--yt-hover))'
                  : 'transparent',
                color: isActive
                  ? 'var(--md-sys-color-on-primary-container, var(--md-sys-color-primary, var(--yt-blue)))'
                  : 'var(--yt-text-primary)',
                textDecoration: 'none',
                transition: 'all 0.18s ease',
                width: '100%',
                fontWeight: isActive ? 600 : 500,
              }}
              className="yt-sidebar-nav-item"
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: isSidebarOpen ? '24px' : '48px',
                  height: isSidebarOpen ? '24px' : '28px',
                  flexShrink: 0,
                }}
              >
                {item.icon}
              </div>
              <span
                style={{
                  fontSize: isSidebarOpen ? '14px' : '10px',
                  fontWeight: isActive ? 600 : 500,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  letterSpacing: isSidebarOpen ? '0.1px' : '0.2px',
                }}
              >
                {isSidebarOpen ? item.label : (item.shortLabel || item.label)}
              </span>
            </Link>
          );
        })}
      </div>

      {/* 3. Subscribed Channels List (Only shown when Expanded) */}
      {isSidebarOpen && subscriptions.length > 0 && (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              height: '1px',
              backgroundColor: 'var(--yt-border)',
              margin: '12px 8px',
            }}
          />
          <div style={{ padding: '0 8px 8px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
            <span
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--yt-text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.6px',
                display: 'block',
                marginBottom: '8px',
                position: 'sticky',
                top: 0,
                backgroundColor: 'var(--yt-background)',
                padding: '4px 0',
                zIndex: 1,
              }}
            >
              Subscriptions
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {subscriptions.map((sub) => {
                const isSubActive = pathname === `/channel/${sub.channelId}`;
                return (
                  <Link
                    key={sub.channelId}
                    href={`/channel/${sub.channelId}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '8px 10px',
                      borderRadius: '10px',
                      backgroundColor: isSubActive ? 'var(--yt-hover)' : 'transparent',
                      color: isSubActive ? 'var(--md-sys-color-primary, var(--yt-blue))' : 'var(--yt-text-primary)',
                      textDecoration: 'none',
                      fontSize: '13px',
                      fontWeight: isSubActive ? 600 : 400,
                      transition: 'background-color 0.15s ease',
                    }}
                    className="yt-sidebar-nav-item"
                  >
                    <div
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--yt-hover)',
                        overflow: 'hidden',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '11px',
                        fontWeight: 700,
                        position: 'relative',
                      }}
                    >
                      {sub.channelName?.[0]?.toUpperCase() || 'C'}
                      <img
                        src={sub.channelAvatar || `/api/channel-avatar?id=${encodeURIComponent(sub.channelId)}`}
                        alt={sub.channelName}
                        loading="lazy"
                        style={{
                          position: 'absolute',
                          inset: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          borderRadius: '50%',
                        }}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sub.channelName}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

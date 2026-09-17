'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useSidebar } from '../context/SidebarContext';
import { HomeIcon, SubscriptionsIcon, ShortsIcon, Logo } from '../icons';
import { getSubscriptions, Subscription } from '../storage';
import { useNotifications } from '../hooks/useNotifications';
import {
  IoChevronDownOutline,
  IoChevronForwardOutline,
  IoMenuOutline,
  IoTvOutline,
  IoPhonePortraitOutline,
  IoSettingsOutline,
} from 'react-icons/io5';

/* Pixel-exact YouTube SVG Icons */
const UserChannelIcon = () => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <circle cx="12" cy="10" r="3" />
    <path d="M7 21v-1a5 5 0 0 1 10 0v1" />
  </svg>
);

const HistoryIcon = () => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l4 2" />
  </svg>
);

const PlaylistsIcon = () => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18" />
    <path d="M3 12h11" />
    <path d="M3 18h11" />
    <polygon points="17 14 22 17 17 20 17 14" fill="currentColor" stroke="none" />
  </svg>
);

const WatchLaterIcon = () => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

const LikedVideosIcon = () => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 10v12" />
    <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h3" />
    <path d="M7 10a4 4 0 0 1 4-4h1a2 2 0 0 1 2 2v2" />
  </svg>
);

const YourVideosIcon = () => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="15" rx="3" />
    <polygon points="10 8.5 15.5 11.5 10 14.5 10 8.5" fill="currentColor" stroke="none" />
  </svg>
);

const DownloadsIcon = () => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v11" />
    <path d="m8 10 4 4 4-4" />
    <path d="M4 19h16" />
  </svg>
);

const PremiumRedIcon = () => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <rect x="2" y="4.5" width="20" height="15" rx="4.5" fill="#ff0000" />
    <polygon points="10 8.5 15.5 12 10 15.5 10 8.5" fill="#ffffff" />
  </svg>
);

const MusicRedIcon = () => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" fill="#ff0000" />
    <circle cx="12" cy="12" r="5.5" stroke="#ffffff" strokeWidth="1.5" fill="none" />
    <polygon points="10.5 9.5 14.5 12 10.5 14.5 10.5 9.5" fill="#ffffff" />
  </svg>
);

const KidsRedIcon = () => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <path d="M21.5 8.2c-.2-1.3-.9-2.3-2.1-2.7C17.5 5 12 5 12 5s-5.5 0-7.4.5c-1.2.4-1.9 1.4-2.1 2.7C2 10.1 2 12 2 12s0 1.9.5 3.8c.2 1.3.9 2.3 2.1 2.7 1.9.5 7.4.5 7.4.5s5.5 0 7.4-.5c1.2-.4 1.9-1.4 2.1-2.7.5-1.9.5-3.8.5-3.8s0-1.9-.5-3.8z" fill="#ff0000"/>
    <polygon points="10 8.5 15.5 12 10 15.5 10 8.5" fill="#ffffff"/>
  </svg>
);

const ExploreMusicIcon = () => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

const ExploreGamingIcon = () => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="6" width="20" height="12" rx="4" />
    <path d="M6 12h4m-2-2v4" />
    <circle cx="15" cy="11" r="1" fill="currentColor" stroke="none" />
    <circle cx="17" cy="13" r="1" fill="currentColor" stroke="none" />
  </svg>
);

const ExploreNewsIcon = () => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4z" />
    <path d="M8 8h8M8 12h8M8 16h4" />
  </svg>
);

const ExploreTrendingIcon = () => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
);

const ExplorePodcastsIcon = () => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" x2="12" y1="19" y2="22" />
  </svg>
);

export default function Sidebar() {
  const pathname = usePathname();
  const { isSidebarOpen, closeSidebar } = useSidebar();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [showAllSubs, setShowAllSubs] = useState(false);
  const [showAllExplore, setShowAllExplore] = useState(false);
  const isWatchPage = pathname === '/watch';
  const { notifications, readIds } = useNotifications();

  const unreadChannelIds = new Set(
    notifications.filter((n) => !readIds.has(n.id)).map((n) => n.channelId)
  );

  useEffect(() => {
    try {
      setSubscriptions(getSubscriptions());
    } catch {}
  }, [pathname]);

  // Mini sidebar items (when collapsed)
  const miniNavItems = [
    { icon: <HomeIcon size={24} />, label: 'Home', path: '/' },
    { icon: <ShortsIcon size={24} />, label: 'Shorts', path: '/shorts' },
    { icon: <SubscriptionsIcon size={24} />, label: 'Subs', path: '/feed/subscriptions' },
    { icon: <UserChannelIcon />, label: 'You', path: '/feed/library' },
  ];

  // Section 1: Main
  const mainNavItems = [
    { icon: <HomeIcon size={24} />, label: 'Home', path: '/' },
    { icon: <ShortsIcon size={24} />, label: 'Shorts', path: '/shorts' },
  ];

  // Section 3: You (Personal Library)
  const youNavItems = [
    { icon: <HistoryIcon />, label: 'History', path: '/feed/history' },
    { icon: <PlaylistsIcon />, label: 'Playlists', path: '/playlists' },
    { icon: <WatchLaterIcon />, label: 'Watch later', path: '/feed/watch-later' },
    { icon: <LikedVideosIcon />, label: 'Liked videos', path: '/feed/liked' },
    { icon: <DownloadsIcon />, label: 'Downloads', path: '/downloads' },
  ];

  // Section 4: More from KV-Tube (Apps & Tools)
  const moreNavItems = [
    { icon: <IoTvOutline size={20} color="#3ea6ff" />, label: 'Android TV App', path: '/settings?tab=devices' },
    { icon: <IoPhonePortraitOutline size={20} color="#10b981" />, label: 'Mobile App / PWA', path: '/settings' },
    { icon: <MusicRedIcon />, label: 'Music Mode', path: '/?category=Music' },
    { icon: <IoSettingsOutline size={20} color="#a855f7" />, label: 'Settings', path: '/settings' },
  ];

  // Section 5: Explore
  const baseExploreItems = [
    { icon: <ExploreMusicIcon />, label: 'Music', path: '/?category=Music' },
    { icon: <ExploreGamingIcon />, label: 'Gaming', path: '/?category=Gaming' },
    { icon: <ExploreNewsIcon />, label: 'News', path: '/?category=News' },
  ];

  const extraExploreItems = [
    { icon: <ExploreTrendingIcon />, label: 'Trending', path: '/feed/trending' },
    { icon: <ExplorePodcastsIcon />, label: 'Podcasts', path: '/?category=Podcasts' },
  ];

  const exploreNavItems = showAllExplore ? [...baseExploreItems, ...extraExploreItems] : baseExploreItems;

  // Subscriptions display logic: up to 7 initially, then Show more
  const displayedSubs = showAllSubs ? subscriptions : subscriptions.slice(0, 7);

  // Helper to render expanded full sidebar content
  const renderFullContent = (onItemClick?: () => void) => (
    <div className="yt-sidebar-scrollable">
      {/* Section 1: Main */}
      <div className="yt-sidebar-section">
        {mainNavItems.map((item) => {
          const isActive = pathname === item.path;
          return (
            <Link
              key={item.label}
              href={item.path}
              onClick={onItemClick}
              className={`yt-sidebar-item ${isActive ? 'active' : ''}`}
            >
              <div className="yt-sidebar-item-icon">{item.icon}</div>
              <span className="yt-sidebar-item-text">{item.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="yt-sidebar-divider" />

      {/* Section 2: Subscriptions */}
      <div className="yt-sidebar-section">
        <Link href="/feed/subscriptions" onClick={onItemClick} className="yt-sidebar-section-header">
          <span>Subscriptions</span>
          <IoChevronForwardOutline size={14} className="yt-header-chevron" />
        </Link>

        {subscriptions.length === 0 ? (
          <div className="yt-sidebar-empty-subs">
            <span>No subscriptions yet</span>
          </div>
        ) : (
          <div className="yt-sidebar-subs-list">
            {displayedSubs.map((sub) => {
              const isSubActive = pathname === `/channel/${sub.channelId}`;
              const hasNewUpload = unreadChannelIds.has(sub.channelId);
              return (
                <Link
                  key={sub.channelId}
                  href={`/channel/${sub.channelId}`}
                  onClick={onItemClick}
                  className={`yt-sidebar-sub-item ${isSubActive ? 'active' : ''}`}
                  title={sub.channelName}
                >
                  <div className="yt-sidebar-sub-avatar">
                    <img
                      src={sub.channelAvatar || `/api/channel-avatar?id=${encodeURIComponent(sub.channelId)}`}
                      alt={sub.channelName}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    <span>{sub.channelName?.[0]?.toUpperCase() || 'C'}</span>
                  </div>
                  <span className="yt-sidebar-sub-name">{sub.channelName}</span>
                  {hasNewUpload && <div className="yt-sub-active-dot" />}
                </Link>
              );
            })}

            {subscriptions.length > 7 && (
              <button
                type="button"
                className="yt-sidebar-item yt-show-more-btn"
                onClick={() => setShowAllSubs(!showAllSubs)}
              >
                <div className="yt-sidebar-item-icon">
                  <IoChevronDownOutline
                    size={18}
                    style={{ transform: showAllSubs ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                  />
                </div>
                <span className="yt-sidebar-item-text">
                  {showAllSubs ? 'Show fewer' : 'Show more'}
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      <div className="yt-sidebar-divider" />

      {/* Section 3: You */}
      <div className="yt-sidebar-section">
        <Link href="/feed/library" onClick={onItemClick} className="yt-sidebar-section-header">
          <span>You</span>
          <IoChevronForwardOutline size={14} className="yt-header-chevron" />
        </Link>

        {youNavItems.map((item) => {
          const isActive = pathname === item.path;
          return (
            <Link
              key={item.label}
              href={item.path}
              onClick={onItemClick}
              className={`yt-sidebar-item ${isActive ? 'active' : ''}`}
            >
              <div className="yt-sidebar-item-icon">{item.icon}</div>
              <span className="yt-sidebar-item-text">{item.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="yt-sidebar-divider" />

      {/* Section 4: More from KV-Tube */}
      <div className="yt-sidebar-section">
        <div className="yt-sidebar-section-header plain">
          <span>More from KV-Tube</span>
        </div>

        {moreNavItems.map((item) => (
          <Link key={item.label} href={item.path} onClick={onItemClick} className="yt-sidebar-item">
            <div className="yt-sidebar-item-icon">{item.icon}</div>
            <span className="yt-sidebar-item-text">{item.label}</span>
          </Link>
        ))}
      </div>

      <div className="yt-sidebar-divider" />

      {/* Section 5: Explore */}
      <div className="yt-sidebar-section">
        <div className="yt-sidebar-section-header plain">
          <span>Explore</span>
        </div>

        {exploreNavItems.map((item) => {
          const isActive = pathname === item.path;
          return (
            <Link
              key={item.label}
              href={item.path}
              onClick={onItemClick}
              className={`yt-sidebar-item ${isActive ? 'active' : ''}`}
            >
              <div className="yt-sidebar-item-icon">{item.icon}</div>
              <span className="yt-sidebar-item-text">{item.label}</span>
            </Link>
          );
        })}

        <button
          type="button"
          className="yt-sidebar-item yt-show-more-btn"
          onClick={() => setShowAllExplore(!showAllExplore)}
        >
          <div className="yt-sidebar-item-icon">
            <IoChevronDownOutline
              size={18}
              style={{ transform: showAllExplore ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
            />
          </div>
          <span className="yt-sidebar-item-text">
            {showAllExplore ? 'Show fewer' : 'Show more'}
          </span>
        </button>
      </div>

      <div className="yt-sidebar-divider" />

      {/* Sidebar Footer Copyright */}
      <div className="yt-sidebar-footer">
        <div className="yt-footer-links">
          <Link href="/feed/library" onClick={onItemClick} style={{ color: 'inherit', textDecoration: 'none' }}>About</Link>
          <a href="https://github.com/vndangkhoa/kv-tube" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>GitHub</a>
          <Link href="/settings" onClick={onItemClick} style={{ color: 'inherit', textDecoration: 'none' }}>Settings</Link>
          <Link href="/feed/trending" onClick={onItemClick} style={{ color: 'inherit', textDecoration: 'none' }}>Trending</Link>
        </div>
        <div className="yt-footer-links" style={{ marginTop: '8px' }}>
          <span>100% Ad-Free</span>
          <span>SponsorBlock</span>
          <span>Zero Telemetry</span>
          <span>NAS Ready</span>
        </div>
        <div className="yt-footer-copy">© 2026 KV-Tube · Open Source MIT</div>
      </div>
    </div>
  );

  // On /watch: Completely hide sidebar in normal view; render as a slide-out overlay drawer if opened
  if (isWatchPage) {
    if (!isSidebarOpen) return null;
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex' }}>
        {/* Backdrop */}
        <div
          onClick={closeSidebar}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 9999,
          }}
        />
        {/* Drawer Sidebar */}
        <aside
          style={{
            position: 'relative',
            zIndex: 10000,
            width: '240px',
            height: '100%',
            backgroundColor: 'var(--yt-background)',
            boxShadow: '4px 0 24px rgba(0, 0, 0, 0.3)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header row with hamburger & logo */}
          <div style={{
            height: 'var(--yt-header-height, 56px)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 16px',
            gap: '16px',
            flexShrink: 0,
          }}>
            <button
              onClick={closeSidebar}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--yt-text-primary)',
                cursor: 'pointer',
                display: 'flex',
                padding: '6px',
                borderRadius: '50%',
              }}
              title="Close guide"
            >
              <IoMenuOutline size={22} />
            </button>
            <Logo />
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {renderFullContent(closeSidebar)}
          </div>
        </aside>
      </div>
    );
  }

  // Normal pages (Home, Subscriptions, History, etc.)
  return (
    <aside className={`yt-sidebar-container ${isSidebarOpen ? 'expanded' : 'collapsed'}`}>
      {renderFullContent()}
    </aside>
  );
}

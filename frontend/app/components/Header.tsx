'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import {
  IoMenuOutline,
  IoMicOutline,
  IoCloseOutline,
  IoArrowBack,
  IoAddOutline,
  IoNotificationsOutline,
  IoNotifications,
  IoCheckmarkDoneOutline,
  IoMoonOutline,
  IoSunnyOutline,
  IoFlashOutline,
  IoGlobeOutline,
  IoSettingsOutline,
  IoVideocamOutline,
  IoChevronForward,
  IoCheckmark,
  IoKeypadOutline,
  IoHelpCircleOutline,
  IoColorPaletteOutline,
} from 'react-icons/io5';
import { REGIONS, getRegionCookie, setRegionCookie } from './RegionSelector';
import ThemeModal from './ThemeModal';
import { useTheme } from '../context/ThemeContext';
import { useSidebar } from '../context/SidebarContext';
import { Logo, SearchIcon } from '../icons';
import { invidious } from '../services/invidious';
import { useNotifications } from '../hooks/useNotifications';
import { getThumbnailCascade } from '../utils';

export default function Header() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobileSearchActive, setIsMobileSearchActive] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [accountMenuView, setAccountMenuView] = useState<'main' | 'appearance' | 'location'>('main');
  const [selectedRegion, setSelectedRegion] = useState('VN');
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);

  const { themeMode, setThemeMode } = useTheme();

  const inputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const notifMenuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { toggleMobileMenu, toggleSidebar } = useSidebar();

  const {
    notifications,
    unreadCount,
    readIds,
    isLoading: isLoadingNotifs,
    markAsRead,
    markAllAsRead,
  } = useNotifications();

  const handleHamburgerClick = () => {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      toggleMobileMenu();
    } else {
      toggleSidebar();
    }
  };

  // Close menus on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setShowAccountMenu(false);
        setAccountMenuView('main');
      }
      if (notifMenuRef.current && !notifMenuRef.current.contains(e.target as Node)) {
        setShowNotifMenu(false);
      }
    }
    if (showAccountMenu || showNotifMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAccountMenu, showNotifMenu]);

  // Sync region on mount and upon regionchange event
  useEffect(() => {
    setSelectedRegion(getRegionCookie());
    const handleRegionEvent = (e: any) => {
      if (e.detail?.region) {
        setSelectedRegion(e.detail.region);
      }
    };
    window.addEventListener('regionchange', handleRegionEvent);
    return () => window.removeEventListener('regionchange', handleRegionEvent);
  }, []);

  const handleSelectRegion = (code: string) => {
    setSelectedRegion(code);
    setRegionCookie(code);
    try {
      localStorage.setItem('kv_region', code);
    } catch {}
    window.dispatchEvent(new CustomEvent('regionchange', { detail: { region: code } }));
    router.refresh();
    setAccountMenuView('main');
  };

  const currentRegion = REGIONS.find((r) => r.code === selectedRegion) || REGIONS[0];

  // Fetch search autocomplete suggestions
  useEffect(() => {
    if (!searchQuery.trim() || !isFocused) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await invidious.getSuggestions(searchQuery);
        setSuggestions(res.slice(0, 8));
        setShowSuggestions(res.length > 0);
      } catch {
        setSuggestions([]);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery, isFocused]);

  const handleSearch = (e?: React.FormEvent, customQuery?: string) => {
    if (e) e.preventDefault();
    const q = (customQuery !== undefined ? customQuery : searchQuery).trim();
    if (q) {
      router.push(`/search?q=${encodeURIComponent(q)}`);
      setIsMobileSearchActive(false);
      setIsFocused(false);
      setShowSuggestions(false);
    }
  };

  // Voice Search integration using Web Speech API
  const handleVoiceSearch = () => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Voice search is not supported in your browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setSearchQuery(transcript);
      setIsListening(false);
      handleSearch(undefined, transcript);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  useEffect(() => {
    if (isMobileSearchActive && mobileInputRef.current) {
      mobileInputRef.current.focus();
    }
  }, [isMobileSearchActive]);

  return (
    <>
      <header className="yt-header">
        {!isMobileSearchActive ? (
          <>
            {/* Left: Hamburger & KV-Tube Logo */}
            <div className="yt-header-left">
              <button
                className="yt-icon-btn hamburger-btn"
                onClick={handleHamburgerClick}
                title="Guide"
                aria-label="Guide"
              >
                <IoMenuOutline size={24} />
              </button>
              <Link href="/" className="yt-logo-link" title="KV-Tube Home">
                <Logo size={22} showText={true} />
              </Link>
            </div>

            {/* Center: Split Compound Search & Voice Button */}
            <div className="yt-header-center hidden-mobile">
              <form className="yt-compound-search-form" onSubmit={(e) => handleSearch(e)}>
                <div className={`yt-search-input-box ${isFocused ? 'focused' : ''}`}>
                  {isFocused && (
                    <div className="yt-search-leading-icon">
                      <SearchIcon size={16} />
                    </div>
                  )}
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder="Search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => {
                      setIsFocused(true);
                      if (suggestions.length > 0) setShowSuggestions(true);
                    }}
                    onBlur={() => {
                      setTimeout(() => {
                        setIsFocused(false);
                        setShowSuggestions(false);
                      }, 250);
                    }}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      className="yt-search-clear-btn"
                      onClick={() => {
                        setSearchQuery('');
                        inputRef.current?.focus();
                      }}
                      title="Clear search query"
                    >
                      <IoCloseOutline size={18} />
                    </button>
                  )}
                </div>

                {/* Attached Search Button with rounded-right border */}
                <button type="submit" className="yt-search-submit-btn" title="Search">
                  <SearchIcon size={20} />
                </button>
              </form>

              {/* Standalone Voice Search Button */}
              <button
                type="button"
                onClick={handleVoiceSearch}
                className={`yt-voice-btn ${isListening ? 'listening' : ''}`}
                title="Search with your voice"
              >
                <IoMicOutline size={20} />
              </button>

              {/* Autocomplete Suggestions Dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <div ref={suggestionsRef} className="yt-search-suggestions">
                  {suggestions.map((item, idx) => (
                    <div
                      key={idx}
                      className="yt-suggestion-item"
                      onClick={() => handleSearch(undefined, item)}
                    >
                      <SearchIcon size={16} className="yt-suggestion-icon" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right: + Create, Notifications, User Profile */}
            <div className="yt-header-right">
              <button
                className="yt-icon-btn visible-mobile"
                onClick={() => setIsMobileSearchActive(true)}
                title="Search"
              >
                <SearchIcon size={22} />
              </button>

              {/* + Create Button */}
              <button
                className="yt-create-pill-btn hidden-mobile"
                onClick={() => router.push('/shorts')}
                title="Create"
              >
                <IoAddOutline size={20} />
                <span>Create</span>
              </button>

              {/* Notifications with Red Count Badge & Dropdown */}
              <div className="yt-notif-container" ref={notifMenuRef}>
                <button
                  className="yt-icon-btn yt-notif-btn"
                  title="Notifications"
                  onClick={() => {
                    setShowNotifMenu(!showNotifMenu);
                    setShowAccountMenu(false);
                  }}
                >
                  {unreadCount > 0 ? (
                    <IoNotifications size={22} />
                  ) : (
                    <IoNotificationsOutline size={22} />
                  )}
                  {unreadCount > 0 && (
                    <span className="yt-notif-badge">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {/* Notifications Dropdown Panel */}
                {showNotifMenu && (
                  <div className="yt-notif-dropdown">
                    <div className="yt-notif-dropdown-header">
                      <span className="yt-notif-dropdown-title">Notifications</span>
                      {unreadCount > 0 && (
                        <button
                          className="yt-notif-mark-all-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            markAllAsRead();
                          }}
                          title="Mark all as read"
                        >
                          <IoCheckmarkDoneOutline size={18} />
                          <span>Mark all as read</span>
                        </button>
                      )}
                    </div>

                    {isLoadingNotifs && notifications.length === 0 ? (
                      <div className="yt-notif-loading">
                        <div className="yt-notif-spinner" />
                        <span>Loading notifications...</span>
                      </div>
                    ) : notifications.length === 0 ? (
                      <div className="yt-notif-empty">
                        <div className="yt-notif-empty-icon">
                          <IoNotificationsOutline size={48} />
                        </div>
                        <p className="yt-notif-empty-title">Your notifications live here</p>
                        <p className="yt-notif-empty-desc">
                          Subscribe to your favorite channels to get notifications about their latest videos.
                        </p>
                      </div>
                    ) : (
                      <div className="yt-notif-list">
                        {notifications.map((notif) => {
                          const isUnread = !readIds.has(notif.id);
                          return (
                            <div
                              key={notif.id}
                              className={`yt-notif-item ${isUnread ? 'unread' : ''}`}
                              onClick={() => {
                                markAsRead(notif.id);
                                setShowNotifMenu(false);
                                router.push(`/watch?v=${notif.videoId}`);
                              }}
                            >
                              {isUnread && <div className="yt-notif-unread-dot" />}
                              <div className="yt-notif-avatar">
                                <img
                                  src={
                                    notif.channelAvatar ||
                                    (notif.channelId ? `/api/channel-avatar?id=${encodeURIComponent(notif.channelId)}` : '')
                                  }
                                  alt={notif.channelTitle}
                                  loading="lazy"
                                  onError={(e) => {
                                    const el = e.currentTarget;
                                    if (el.dataset.fallback !== '1' && notif.channelId) {
                                      el.dataset.fallback = '1';
                                      el.src = `/api/channel-avatar?id=${encodeURIComponent(notif.channelId)}`;
                                    } else {
                                      el.style.display = 'none';
                                    }
                                  }}
                                />
                                <span>{notif.channelTitle?.[0]?.toUpperCase() || 'C'}</span>
                              </div>
                              <div className="yt-notif-content">
                                <div className="yt-notif-text">
                                  <span className="yt-notif-author">{notif.channelTitle}</span> uploaded: {notif.title}
                                </div>
                                <div className="yt-notif-time">{notif.publishedText}</div>
                              </div>
                              {(notif.thumbnail || notif.videoId) && (
                                <div className="yt-notif-thumb">
                                  <img
                                    src={notif.thumbnail || (notif.videoId ? getThumbnailCascade(notif.videoId, 0) : '')}
                                    alt=""
                                    loading="lazy"
                                    onError={(e) => {
                                      const el = e.currentTarget;
                                      const stage = parseInt(el.dataset.stage || '0', 10);
                                      const nextStage = stage + 1;
                                      el.dataset.stage = String(nextStage);
                                      if (notif.videoId) {
                                        const nextSrc = getThumbnailCascade(notif.videoId, nextStage);
                                        if (nextSrc) {
                                          el.src = nextSrc;
                                          return;
                                        }
                                      }
                                      el.style.display = 'none';
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* User Avatar Circle Button */}
              <div className="yt-account-menu-container" ref={accountMenuRef}>
                <button
                  className="yt-avatar-btn"
                  onClick={() => {
                    if (showAccountMenu) {
                      setShowAccountMenu(false);
                      setAccountMenuView('main');
                    } else {
                      setShowAccountMenu(true);
                      setAccountMenuView('main');
                      setShowNotifMenu(false);
                    }
                  }}
                  title="Account"
                >
                  <div className="yt-avatar-circle">
                    <span>K</span>
                  </div>
                </button>

                {/* YouTube Account Dropdown Menu */}
                {showAccountMenu && (
                  <div className="yt-account-dropdown">
                    {accountMenuView === 'main' && (
                      <>
                        <div className="yt-account-user-row">
                          <div className="yt-avatar-circle large">
                            <span>K</span>
                          </div>
                          <div className="yt-account-user-meta">
                            <div className="yt-account-name">Khoa Vo</div>
                            <div className="yt-account-handle">@khoavo</div>
                            <Link
                              href="/channel/mine"
                              className="yt-account-link"
                              onClick={() => setShowAccountMenu(false)}
                            >
                              View your channel
                            </Link>
                          </div>
                        </div>

                        <div className="yt-account-divider" />

                        {/* Appearance / Theme Item */}
                        <button
                          type="button"
                          className="yt-account-item"
                          onClick={() => setAccountMenuView('appearance')}
                        >
                          <div className="yt-account-item-icon">
                            {themeMode === 'light' ? (
                              <IoSunnyOutline size={20} color="#ff9800" />
                            ) : themeMode === 'amoled' ? (
                              <IoFlashOutline size={20} color="#00ffff" />
                            ) : (
                              <IoMoonOutline size={20} />
                            )}
                          </div>
                          <span className="yt-account-item-label">
                            Appearance: {themeMode === 'amoled' ? 'AMOLED' : themeMode === 'light' ? 'Light' : 'Dark'}
                          </span>
                          <IoChevronForward size={18} className="yt-account-item-arrow" />
                        </button>

                        {/* Location / Region Item */}
                        <button
                          type="button"
                          className="yt-account-item"
                          onClick={() => setAccountMenuView('location')}
                        >
                          <div className="yt-account-item-icon" style={{ fontSize: '18px' }}>
                            {currentRegion.flag === '🌐' ? <IoGlobeOutline size={20} /> : currentRegion.flag}
                          </div>
                          <span className="yt-account-item-label">
                            Location: {currentRegion.label}
                          </span>
                          <IoChevronForward size={18} className="yt-account-item-arrow" />
                        </button>

                        <div className="yt-account-divider" />

                        {/* Settings */}
                        <Link
                          href="/settings"
                          className="yt-account-item"
                          onClick={() => setShowAccountMenu(false)}
                        >
                          <div className="yt-account-item-icon">
                            <IoSettingsOutline size={20} />
                          </div>
                          <span className="yt-account-item-label">Settings</span>
                        </Link>

                        {/* Keyboard Shortcuts */}
                        <button
                          type="button"
                          className="yt-account-item"
                          onClick={() => {
                            setShowAccountMenu(false);
                            setShowShortcutsModal(true);
                          }}
                        >
                          <div className="yt-account-item-icon">
                            <IoKeypadOutline size={20} />
                          </div>
                          <span className="yt-account-item-label">Keyboard shortcuts</span>
                        </button>

                        {/* Help & Diagnostics */}
                        <Link
                          href="/settings?tab=instance"
                          className="yt-account-item"
                          onClick={() => setShowAccountMenu(false)}
                        >
                          <div className="yt-account-item-icon">
                            <IoHelpCircleOutline size={20} />
                          </div>
                          <span className="yt-account-item-label">Help & diagnostics</span>
                        </Link>
                      </>
                    )}

                    {/* Submenu: Appearance */}
                    {accountMenuView === 'appearance' && (
                      <div className="yt-account-submenu">
                        <div className="yt-account-submenu-header">
                          <button
                            type="button"
                            className="yt-account-back-btn"
                            onClick={() => setAccountMenuView('main')}
                            title="Back"
                          >
                            <IoArrowBack size={20} />
                          </button>
                          <span className="yt-account-submenu-title">Appearance</span>
                        </div>
                        <div className="yt-account-divider" />
                        <div className="yt-account-submenu-desc">
                          Setting applies to this browser only
                        </div>
                        {[
                          { id: 'dark', label: 'Dark theme' },
                          { id: 'amoled', label: 'AMOLED (Pure Black)' },
                          { id: 'light', label: 'Light theme' },
                        ].map((mode) => (
                          <button
                            key={mode.id}
                            type="button"
                            className="yt-account-item"
                            onClick={() => setThemeMode(mode.id as any)}
                          >
                            <div className="yt-account-check-icon">
                              {themeMode === mode.id && <IoCheckmark size={20} />}
                            </div>
                            <span className="yt-account-item-label">{mode.label}</span>
                          </button>
                        ))}
                        <div className="yt-account-divider" />
                        <button
                          type="button"
                          className="yt-account-item"
                          onClick={() => {
                            setShowAccountMenu(false);
                            setIsThemeModalOpen(true);
                          }}
                        >
                          <div className="yt-account-item-icon">
                            <IoColorPaletteOutline size={20} />
                          </div>
                          <span className="yt-account-item-label">Custom theme & colors...</span>
                        </button>
                      </div>
                    )}

                    {/* Submenu: Location */}
                    {accountMenuView === 'location' && (
                      <div className="yt-account-submenu">
                        <div className="yt-account-submenu-header">
                          <button
                            type="button"
                            className="yt-account-back-btn"
                            onClick={() => setAccountMenuView('main')}
                            title="Back"
                          >
                            <IoArrowBack size={20} />
                          </button>
                          <span className="yt-account-submenu-title">Choose your location</span>
                        </div>
                        <div className="yt-account-divider" />
                        <div className="yt-account-submenu-scroll">
                          {REGIONS.map((r) => (
                            <button
                              key={r.code}
                              type="button"
                              className="yt-account-item"
                              onClick={() => handleSelectRegion(r.code)}
                            >
                              <div className="yt-account-check-icon">
                                {selectedRegion === r.code && <IoCheckmark size={20} />}
                              </div>
                              <span style={{ fontSize: '18px', marginRight: '6px' }}>{r.flag}</span>
                              <span className="yt-account-item-label">{r.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          /* Mobile Search Overlay */
          <div className="mobile-search-bar">
            <button className="mobile-search-back" onClick={() => setIsMobileSearchActive(false)}>
              <IoArrowBack size={22} />
            </button>
            <form className="search-container" onSubmit={(e) => handleSearch(e)} style={{ flex: 1 }}>
              <div className="search-input-wrapper">
                <SearchIcon size={16} className="search-input-icon" />
                <input
                  ref={mobileInputRef}
                  type="text"
                  placeholder="Search KV-Tube"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="search-btn"
                    onClick={() => {
                      setSearchQuery('');
                      mobileInputRef.current?.focus();
                    }}
                    title="Clear"
                  >
                    <IoCloseOutline size={16} />
                  </button>
                )}
              </div>
            </form>
          </div>
        )}
      </header>

      {/* Theme Customizer Modal */}
      <ThemeModal isOpen={isThemeModalOpen} onClose={() => setIsThemeModalOpen(false)} />

      {/* Keyboard Shortcuts Modal */}
      {showShortcutsModal && (
        <div
          className="drawer-backdrop open"
          onClick={() => setShowShortcutsModal(false)}
          style={{ zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div
            className="yt-shortcuts-modal dropdown-animated"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="yt-shortcuts-header">
              <h3 className="yt-shortcuts-title">Keyboard shortcuts</h3>
              <button
                type="button"
                className="yt-icon-btn"
                onClick={() => setShowShortcutsModal(false)}
                title="Close"
                style={{ width: '32px', height: '32px' }}
              >
                <IoCloseOutline size={20} />
              </button>
            </div>
            <div className="yt-shortcuts-grid">
              <div className="yt-shortcut-row">
                <span className="yt-shortcut-desc">Play / Pause</span>
                <span className="yt-shortcut-key">k / Space</span>
              </div>
              <div className="yt-shortcut-row">
                <span className="yt-shortcut-desc">Fullscreen</span>
                <span className="yt-shortcut-key">f</span>
              </div>
              <div className="yt-shortcut-row">
                <span className="yt-shortcut-desc">Mute / Unmute</span>
                <span className="yt-shortcut-key">m</span>
              </div>
              <div className="yt-shortcut-row">
                <span className="yt-shortcut-desc">Theater mode</span>
                <span className="yt-shortcut-key">t</span>
              </div>
              <div className="yt-shortcut-row">
                <span className="yt-shortcut-desc">Seek backward 10s</span>
                <span className="yt-shortcut-key">j</span>
              </div>
              <div className="yt-shortcut-row">
                <span className="yt-shortcut-desc">Seek forward 10s</span>
                <span className="yt-shortcut-key">l</span>
              </div>
              <div className="yt-shortcut-row">
                <span className="yt-shortcut-desc">Seek 5s</span>
                <span className="yt-shortcut-key">← / →</span>
              </div>
              <div className="yt-shortcut-row">
                <span className="yt-shortcut-desc">Volume up / down</span>
                <span className="yt-shortcut-key">↑ / ↓</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

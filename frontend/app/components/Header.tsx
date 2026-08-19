'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { IoColorPaletteOutline, IoArrowBack, IoMenuOutline, IoMicOutline, IoCloseOutline } from 'react-icons/io5';
import RegionSelector from './RegionSelector';
import ThemeModal from './ThemeModal';
import { useSidebar } from '../context/SidebarContext';
import { Logo, SearchIcon } from '../icons';
import { invidious } from '../services/invidious';

export default function Header() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobileSearchActive, setIsMobileSearchActive] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { toggleMobileMenu, toggleSidebar } = useSidebar();

  const handleHamburgerClick = () => {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      toggleMobileMenu();
    } else {
      toggleSidebar();
    }
  };

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
      <header className="yt-header" style={{ backdropFilter: 'blur(16px)', backgroundColor: 'var(--yt-background)' }}>
        {!isMobileSearchActive ? (
          <>
            {/* Left */}
            <div className="yt-header-left">
              <button 
                className="yt-icon-btn hamburger-btn" 
                onClick={handleHamburgerClick} 
                title="Menu"
                style={{ borderRadius: '50%' }}
              >
                <IoMenuOutline size={22} />
              </button>
              <Link href="/" style={{ display: 'flex', alignItems: 'center', marginLeft: '10px', textDecoration: 'none' }}>
                <Logo size={24} showText={true} />
              </Link>
            </div>

            {/* Center Search Pill - Desktop */}
            <div className="yt-header-center hidden-mobile" style={{ position: 'relative' }}>
              <form className="search-container" onSubmit={(e) => handleSearch(e)}>
                <div 
                  className="search-input-wrapper"
                  style={{
                    backgroundColor: 'var(--yt-surface)',
                    borderRadius: '28px',
                    borderColor: isFocused ? 'var(--md-sys-color-primary, var(--yt-blue))' : 'var(--yt-border)',
                  }}
                >
                  <SearchIcon size={18} className="search-input-icon" />
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder="Search videos, channels, and playlists..."
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
                      className="search-btn"
                      onClick={() => {
                        setSearchQuery('');
                        inputRef.current?.focus();
                      }}
                      title="Clear"
                      style={{ color: 'var(--yt-text-secondary)' }}
                    >
                      <IoCloseOutline size={18} />
                    </button>
                  )}
                  <button type="submit" className="search-btn" title="Search">
                    <SearchIcon size={18} />
                  </button>
                </div>
              </form>

              {/* Voice search button */}
              <button
                type="button"
                onClick={handleVoiceSearch}
                className="yt-icon-btn"
                title="Search with your voice"
                style={{
                  marginLeft: '8px',
                  backgroundColor: isListening ? 'var(--yt-brand-red)' : 'var(--yt-surface)',
                  color: isListening ? '#ffffff' : 'var(--yt-text-primary)',
                  borderRadius: '50%',
                  flexShrink: 0,
                }}
              >
                <IoMicOutline size={20} />
              </button>

              {/* Search Suggestions Dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <div
                  ref={suggestionsRef}
                  className="dropdown-animated"
                  style={{
                    position: 'absolute',
                    top: '52px',
                    left: 0,
                    right: '48px',
                    backgroundColor: 'var(--yt-surface)',
                    border: '1px solid var(--yt-border)',
                    borderRadius: '20px',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
                    zIndex: 900,
                    overflow: 'hidden',
                    padding: '8px 0',
                  }}
                >
                  {suggestions.map((item, idx) => (
                    <div
                      key={idx}
                      onClick={() => handleSearch(undefined, item)}
                      style={{
                        padding: '10px 20px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        cursor: 'pointer',
                        color: 'var(--yt-text-primary)',
                        fontSize: '14px',
                        transition: 'background-color 0.15s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--yt-hover)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <SearchIcon size={16} style={{ color: 'var(--yt-text-secondary)' }} />
                      <span style={{ fontWeight: 500 }}>{item}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right - Theme Modal & Region */}
            <div className="yt-header-right">
              <button 
                className="yt-icon-btn visible-mobile" 
                onClick={() => setIsMobileSearchActive(true)} 
                title="Search"
              >
                <SearchIcon size={22} />
              </button>

              {/* Material 3 Palette Trigger */}
              <button 
                className="yt-icon-btn" 
                onClick={() => setIsThemeModalOpen(true)} 
                title="Material You Themes"
                style={{
                  backgroundColor: 'var(--yt-surface)',
                  color: 'var(--md-sys-color-primary, var(--yt-blue))',
                  border: '1px solid var(--yt-border)',
                }}
              >
                <IoColorPaletteOutline size={20} />
              </button>

              <RegionSelector />
            </div>
          </>
        ) : (
          /* Mobile Search Overlay */
          <div className="mobile-search-bar">
            <button className="mobile-search-back" onClick={() => setIsMobileSearchActive(false)}>
              <IoArrowBack size={22} />
            </button>
            <form className="search-container" onSubmit={(e) => handleSearch(e)} style={{ flex: 1 }}>
              <div 
                className="search-input-wrapper"
                style={{
                  backgroundColor: 'var(--yt-surface)',
                  borderRadius: '24px',
                }}
              >
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

      {/* Material 3 Theme Customizer Modal */}
      <ThemeModal isOpen={isThemeModalOpen} onClose={() => setIsThemeModalOpen(false)} />
    </>
  );
}

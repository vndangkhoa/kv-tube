'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { IoMoonOutline, IoSunnyOutline, IoArrowBack, IoMenuOutline } from 'react-icons/io5';
import RegionSelector from './RegionSelector';
import { useTheme } from '../context/ThemeContext';
import { useSidebar } from '../context/SidebarContext';
import { Logo, SearchIcon } from '../icons';

export default function Header() {
    const [searchQuery, setSearchQuery] = useState('');
    const [isMobileSearchActive, setIsMobileSearchActive] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const mobileInputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();
    const { theme, toggleTheme } = useTheme();
    const { toggleSidebar, toggleMobileMenu } = useSidebar();

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            router.push(`/search?q=${encodeURIComponent(searchQuery)}`);
            setIsMobileSearchActive(false);
            setIsFocused(false);
        }
    };

    useEffect(() => {
        if (isMobileSearchActive && mobileInputRef.current) {
            mobileInputRef.current.focus();
        }
    }, [isMobileSearchActive]);

    return (
        <header className="yt-header">
            {!isMobileSearchActive ? (
                <>
                    {/* Left */}
                    <div className="yt-header-left">
                        <button className="yt-icon-btn hamburger-btn" onClick={() => {
                            toggleMobileMenu();
                        }} title="Menu">
                            <IoMenuOutline size={22} />
                        </button>
                        <Link href="/" style={{ display: 'flex', alignItems: 'center', marginLeft: '12px' }}>
                            <Logo size={24} showText className="hidden-mobile" />
                        </Link>
                    </div>

                    {/* Center Search Pill - Desktop */}
                    <div className="yt-header-center hidden-mobile">
                        <form className="search-container" onSubmit={handleSearch}>
                            <div className="search-input-wrapper">
                                <SearchIcon size={18} className="search-input-icon" />
                                <input
                                    ref={inputRef}
                                    type="text"
                                    placeholder="Search videos, channels, and more..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onFocus={() => setIsFocused(true)}
                                    onBlur={() => setIsFocused(false)}
                                />
                                {searchQuery && (
                                    <button
                                        type="button"
                                        className="search-btn"
                                        onClick={() => { setSearchQuery(''); inputRef.current?.focus(); }}
                                        title="Clear"
                                        style={{ color: 'var(--yt-text-secondary)' }}
                                    >
                                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                                        </svg>
                                    </button>
                                )}
                                <button type="submit" className="search-btn" title="Search">
                                    <SearchIcon size={18} />
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* Right - Region and Theme */}
                    <div className="yt-header-right">
                        <button className="yt-icon-btn visible-mobile" onClick={() => setIsMobileSearchActive(true)} title="Search">
                            <SearchIcon size={22} />
                        </button>
                        <button className="yt-icon-btn" onClick={toggleTheme} title="Toggle Theme">
                            {theme === 'dark' ? <IoSunnyOutline size={22} /> : <IoMoonOutline size={22} />}
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
                    <form className="search-container" onSubmit={handleSearch} style={{ flex: 1 }}>
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
                                    onClick={() => { setSearchQuery(''); mobileInputRef.current?.focus(); }}
                                    title="Clear"
                                >
                                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    </form>
                </div>
            )}
        </header>
    );
}

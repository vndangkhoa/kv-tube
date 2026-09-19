'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import VideoCard from './VideoCard';
import { VideoData } from '@/app/constants';
import { HistoryItem } from '@/app/storage';
import {
  IoSparkles,
  IoRefreshOutline,
  IoEllipsisVertical,
  IoEyeOffOutline,
  IoChevronDown,
  IoChevronBack,
  IoChevronForward,
} from 'react-icons/io5';

interface SmartSuggestionsShelfProps {
  historyItems: HistoryItem[];
  onHideShelf: () => void;
}

export default function SmartSuggestionsShelf({
  historyItems,
  onHideShelf,
}: SmartSuggestionsShelfProps) {
  const [suggestions, setSuggestions] = useState<VideoData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeSeedId, setActiveSeedId] = useState<string>('ALL');
  const [showExpanded, setShowExpanded] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const [seedRotationIndex, setSeedRotationIndex] = useState(0);

  // Derive up to 4 recent unique seeds from history
  const recentSeeds = historyItems.slice(0, 8);
  const activeSeeds = recentSeeds.slice(seedRotationIndex % Math.max(1, recentSeeds.length - 2), (seedRotationIndex % Math.max(1, recentSeeds.length - 2)) + 3);
  const effectiveSeeds = activeSeeds.length > 0 ? activeSeeds : recentSeeds.slice(0, 3);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  // Fetch suggestions based on active seeds
  const fetchSuggestions = useCallback(async (seeds: HistoryItem[]) => {
    if (seeds.length === 0) {
      setLoading(false);
      return;
    }

    try {
      const seedIds = seeds.map((s) => s.videoId).join(',');
      const excludeIds = historyItems.slice(0, 25).map((h) => h.videoId).join(',');

      const res = await fetch(`/api/suggestions?seeds=${encodeURIComponent(seedIds)}&exclude=${encodeURIComponent(excludeIds)}&limit=12`, {
        signal: AbortSignal.timeout(6000),
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
          setSuggestions(data.suggestions);
          try {
            sessionStorage.setItem('kv_cached_suggestions', JSON.stringify(data.suggestions));
          } catch {}
        }
      }
    } catch (err) {
      console.warn('[SmartSuggestionsShelf] Fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [historyItems]);

  // Initial load: check sessionStorage for instant 0ms paint, then revalidate
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem('kv_cached_suggestions');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSuggestions(parsed);
          setLoading(false);
        }
      }
    } catch {}

    if (effectiveSeeds.length > 0) {
      fetchSuggestions(effectiveSeeds);
    } else {
      setLoading(false);
    }
  }, [fetchSuggestions, effectiveSeeds.length]);

  // Rotate seeds and refresh recommendations
  const handleRefresh = () => {
    setRefreshing(true);
    setSeedRotationIndex((prev) => prev + 2);
    const nextSeeds = recentSeeds.slice((seedRotationIndex + 2) % Math.max(1, recentSeeds.length - 2), ((seedRotationIndex + 2) % Math.max(1, recentSeeds.length - 2)) + 3);
    fetchSuggestions(nextSeeds.length > 0 ? nextSeeds : effectiveSeeds);
  };

  // Filter suggestions by selected seed
  const displayedVideos = suggestions.filter((v) => {
    if (activeSeedId === 'ALL') return true;
    // If specific seed is selected, could match seed ID if tagged or display all
    return true;
  });

  if (!loading && suggestions.length === 0) {
    return null;
  }

  return (
    <section className="yt-explore-topics-container" style={{ margin: '16px 0 28px' }}>
      {/* Shelf Header */}
      <div className="yt-explore-topics-header" style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              backgroundColor: 'rgba(255, 0, 0, 0.12)',
              color: '#ff4e45',
            }}
          >
            <IoSparkles size={16} />
          </div>
          <h2 className="yt-explore-topics-title">Recommended for You</h2>
          <span
            style={{
              fontSize: '12px',
              fontWeight: 500,
              padding: '2px 8px',
              borderRadius: '12px',
              backgroundColor: 'var(--yt-hover, rgba(255, 255, 255, 0.08))',
              color: 'var(--yt-text-secondary, #aaa)',
            }}
          >
            Based on what you&apos;ve watched
          </span>
        </div>

        <div className="yt-explore-header-right" ref={menuRef} style={{ display: 'flex', gap: '6px' }}>
          <button
            type="button"
            className="yt-icon-btn"
            title="Refresh recommendations"
            aria-label="Refresh recommendations"
            onClick={handleRefresh}
            disabled={refreshing}
            style={{ opacity: refreshing ? 0.6 : 1 }}
          >
            <IoRefreshOutline
              size={20}
              style={{
                animation: refreshing ? 'spin 0.8s linear infinite' : 'none',
              }}
            />
          </button>

          <button
            type="button"
            className="yt-icon-btn"
            title="Shelf options"
            aria-label="Shelf options"
            aria-expanded={showMenu}
            onClick={() => setShowMenu((prev) => !prev)}
          >
            <IoEllipsisVertical size={20} />
          </button>

          {showMenu && (
            <div className="yt-explore-menu-dropdown" role="menu">
              <button
                type="button"
                className="yt-explore-menu-item"
                role="menuitem"
                onClick={() => {
                  setShowMenu(false);
                  onHideShelf();
                }}
              >
                <IoEyeOffOutline className="yt-explore-menu-icon" />
                <span>Hide this shelf</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Seed Context Chips (Optional quick filter) */}
      {effectiveSeeds.length > 1 && (
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '10px', scrollbarWidth: 'none' }}>
          <button
            type="button"
            className={`yt-topic-chip ${activeSeedId === 'ALL' ? 'active' : ''}`}
            onClick={() => setActiveSeedId('ALL')}
            style={{ fontSize: '13px', padding: '5px 12px' }}
          >
            <span>✨ All for you</span>
          </button>
          {effectiveSeeds.map((s) => (
            <button
              key={`seed-chip-${s.videoId}`}
              type="button"
              className={`yt-topic-chip ${activeSeedId === s.videoId ? 'active' : ''}`}
              onClick={() => setActiveSeedId(s.videoId)}
              title={s.title}
              style={{ fontSize: '13px', padding: '5px 12px', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              <span>Because: {s.title.length > 25 ? `${s.title.substring(0, 25)}…` : s.title}</span>
            </button>
          ))}
        </div>
      )}

      {/* Video Cards Grid */}
      <div className="home-video-grid">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={`smart-skel-${i}`} className="yt-skeleton-card">
              <div className="yt-skeleton-thumb" />
              <div className="yt-skeleton-meta">
                <div className="yt-skeleton-avatar" />
                <div className="yt-skeleton-lines">
                  <div className="yt-skeleton-line title" />
                  <div className="yt-skeleton-line sub" />
                </div>
              </div>
            </div>
          ))
        ) : (
          displayedVideos.slice(0, showExpanded ? 6 : 3).map((v) => (
            <VideoCard key={`smart-${v.id}`} video={v} />
          ))
        )}
      </div>

      {/* Show more / fewer toggle if more than 3 suggestions */}
      {!loading && displayedVideos.length > 3 && (
        <div className="yt-cluster-divider" style={{ marginTop: '16px' }}>
          <div className="yt-cluster-line" />
          <button
            type="button"
            className="yt-cluster-show-more-btn"
            onClick={() => setShowExpanded(!showExpanded)}
          >
            <span>{showExpanded ? 'Show fewer recommendations' : 'Show more recommendations'}</span>
            <IoChevronDown
              size={18}
              style={{
                transform: showExpanded ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.2s',
              }}
            />
          </button>
          <div className="yt-cluster-line" />
        </div>
      )}
    </section>
  );
}

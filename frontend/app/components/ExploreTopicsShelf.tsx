'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import {
  IoEllipsisVertical,
  IoChevronForward,
  IoChevronBack,
  IoEyeOffOutline,
  IoCloseCircleOutline,
} from 'react-icons/io5';

export const DEFAULT_EXPLORE_TOPICS = [
  'Graphics processing units',
  'Immersive K-Pop audio',
  'AI image editing',
  'Electronic vibes only',
  'AI video generation',
  'Windows 11 troubleshooting',
  'Raspberry Pi projects',
  'Smart eyewear',
  'PC build benchmarks',
  'Cyberpunk aesthetics',
  'Retro gaming walkthroughs',
  'Deep learning tools',
];

interface ExploreTopicsShelfProps {
  topics?: string[];
  activeTopic?: string;
  onSelectTopic?: (topic: string) => void;
  onHideShelf?: () => void;
  onDismissTopic?: (topic: string) => void;
}

export default function ExploreTopicsShelf({
  topics = DEFAULT_EXPLORE_TOPICS,
  activeTopic = '',
  onSelectTopic,
  onHideShelf,
  onDismissTopic,
}: ExploreTopicsShelfProps) {
  const currentActive = activeTopic || (topics.length > 0 ? topics[0] : '');
  const scrollRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [showMenu, setShowMenu] = useState(false);

  // Drag-to-scroll refs
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);
  const dragDistanceRef = useRef(0);

  const checkScroll = useCallback(() => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 10);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
    }
  }, []);

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [checkScroll, topics]);

  // Handle clicking outside the 3-dots dropdown menu
  useEffect(() => {
    if (!showMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showMenu]);

  const handleScroll = (dir: 'left' | 'right') => {
    if (scrollRef.current) {
      const amount = dir === 'left' ? -260 : 260;
      scrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
      setTimeout(checkScroll, 250);
    }
  };

  // Mouse drag-to-scroll handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    isDraggingRef.current = true;
    dragDistanceRef.current = 0;
    startXRef.current = e.pageX - scrollRef.current.offsetLeft;
    scrollLeftRef.current = scrollRef.current.scrollLeft;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current || !scrollRef.current) return;
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startXRef.current) * 1.2;
    dragDistanceRef.current = Math.abs(x - startXRef.current);
    scrollRef.current.scrollLeft = scrollLeftRef.current - walk;
    checkScroll();
  };

  const handleMouseUpOrLeave = () => {
    isDraggingRef.current = false;
  };

  const handleChipClick = (topic: string) => {
    // If the user was dragging, don't trigger selection
    if (dragDistanceRef.current > 6) return;
    onSelectTopic?.(topic);
  };

  return (
    <div className="yt-explore-topics-container">
      {/* Header */}
      <div className="yt-explore-topics-header">
        <h2 className="yt-explore-topics-title">Explore more topics</h2>
        <div className="yt-explore-header-right" ref={menuRef}>
          <button
            type="button"
            className="yt-icon-btn"
            title="Explore options"
            aria-label="Explore options"
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
                  onHideShelf?.();
                }}
              >
                <IoEyeOffOutline className="yt-explore-menu-icon" />
                <span>Hide this shelf</span>
              </button>

              {currentActive && (
                <button
                  type="button"
                  className="yt-explore-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setShowMenu(false);
                    onDismissTopic?.(currentActive);
                  }}
                >
                  <IoCloseCircleOutline className="yt-explore-menu-icon" />
                  <span>Don&apos;t recommend &quot;{currentActive}&quot;</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Chips Carousel */}
      <div className="yt-explore-chips-wrapper">
        {canScrollLeft && (
          <div className="yt-explore-arrow left">
            <button
              type="button"
              className="yt-explore-arrow-btn"
              onClick={() => handleScroll('left')}
              title="Previous"
              aria-label="Previous topics"
            >
              <IoChevronBack size={18} />
            </button>
          </div>
        )}

        <div
          ref={scrollRef}
          onScroll={checkScroll}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUpOrLeave}
          onMouseLeave={handleMouseUpOrLeave}
          className="yt-explore-chips-scroll"
          style={{ cursor: isDraggingRef.current ? 'grabbing' : 'default' }}
        >
          {topics.map((topic) => {
            const isActive = currentActive === topic;
            return (
              <button
                key={topic}
                type="button"
                className={`yt-topic-chip ${isActive ? 'active' : ''}`}
                onClick={() => handleChipClick(topic)}
              >
                <span>{topic}</span>
              </button>
            );
          })}
        </div>

        {canScrollRight && (
          <div className="yt-explore-arrow right">
            <button
              type="button"
              className="yt-explore-arrow-btn"
              onClick={() => handleScroll('right')}
              title="Next"
              aria-label="Next topics"
            >
              <IoChevronForward size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

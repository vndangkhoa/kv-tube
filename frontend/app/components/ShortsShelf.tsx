'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ShortsIcon } from '../icons';
import { IoEllipsisVertical, IoChevronDown } from 'react-icons/io5';

export interface ShortItem {
  id: string;
  title: string;
  uploader?: string;
  thumbnail: string;
  view_count?: number;
  isNew?: boolean;
}

function formatViews(views?: number): string {
  if (!views) return '100K views';
  if (views >= 1000000) return (views / 1000000).toFixed(1) + 'M views';
  if (views >= 1000) return Math.round(views / 1000) + 'K views';
  return views + ' views';
}

interface ShortsShelfProps {
  shorts?: ShortItem[];
}

export default function ShortsShelf({ shorts }: ShortsShelfProps) {
  const [expanded, setExpanded] = useState(false);

  // Default mock/fallback shorts matching user screenshot if empty
  const defaultShorts: ShortItem[] = [
    {
      id: 'short1',
      title: 'SaWaDiKa...',
      uploader: 'Creator 1',
      thumbnail: 'https://picsum.photos/seed/short1/450/800',
      view_count: 195000,
      isNew: true,
    },
    {
      id: 'short2',
      title: 'This AMD FPGA is $10,000',
      uploader: 'Tech Builder',
      thumbnail: 'https://picsum.photos/seed/short2/450/800',
      view_count: 211000,
      isNew: false,
    },
    {
      id: 'short3',
      title: 'Qwen 3.6 vs Qwen 3.8',
      uploader: 'AI News',
      thumbnail: 'https://picsum.photos/seed/short3/450/800',
      view_count: 465000,
      isNew: false,
    },
    {
      id: 'short4',
      title: 'Cài File IPA iOS 26...',
      uploader: 'Apple Tips',
      thumbnail: 'https://picsum.photos/seed/short4/450/800',
      view_count: 42000,
      isNew: false,
    },
    {
      id: 'short5',
      title: 'Anyone want to see the soles of my feet? 🐾',
      uploader: 'Cosplay Daily',
      thumbnail: 'https://picsum.photos/seed/short5/450/800',
      view_count: 117000,
      isNew: true,
    },
    {
      id: 'short6',
      title: 'Suno AI đã bị cấm! Chuyện gì tiếp theo?',
      uploader: 'AI News Daily',
      thumbnail: 'https://picsum.photos/seed/short6/450/800',
      view_count: 22000,
      isNew: true,
    },
    {
      id: 'short7',
      title: 'The Console Every PC Gamer Wants?..',
      uploader: 'Hardware Unboxed',
      thumbnail: 'https://picsum.photos/seed/short7/450/800',
      view_count: 143000,
      isNew: false,
    },
    {
      id: 'short8',
      title: 'Top 10 Mẹo Lập Trình Next.js 15',
      uploader: 'Dev Tips VN',
      thumbnail: 'https://picsum.photos/seed/short8/450/800',
      view_count: 89000,
      isNew: false,
    },
    {
      id: 'short9',
      title: 'Robotics Breakthrough in 2026',
      uploader: 'Future Tech',
      thumbnail: 'https://picsum.photos/seed/short9/450/800',
      view_count: 310000,
      isNew: false,
    },
    {
      id: 'short10',
      title: 'Speedrun Mario 64 in 5 Minutes',
      uploader: 'Retro Runner',
      thumbnail: 'https://picsum.photos/seed/short10/450/800',
      view_count: 520000,
      isNew: true,
    },
  ];

  const allItems = shorts && shorts.length > 0 ? shorts : defaultShorts;
  const items = allItems.slice(0, expanded ? 10 : 5);
  const canExpand = allItems.length > 5;

  return (
    <div className="yt-shorts-shelf-container">
      {/* Header */}
      <div className="yt-shorts-shelf-header">
        <div className="yt-shorts-shelf-title-group">
          <ShortsIcon size={24} className="yt-shorts-shelf-icon" filled={true} />
          <h2 className="yt-shorts-shelf-title">Shorts</h2>
        </div>
        <button className="yt-icon-btn yt-shorts-menu-btn" title="Shorts options">
          <IoEllipsisVertical size={20} />
        </button>
      </div>

      {/* Grid of 9:16 vertical cards */}
      <div className="yt-shorts-grid">
        {items.map((short, idx) => (
          <div key={short.id || idx} className="yt-short-card">
            {/* Thumbnail */}
            <div className="yt-short-thumb-wrapper">
              <Link href={`/shorts?id=${encodeURIComponent(short.id)}`} className="yt-short-thumb-link">
                <img
                  src={short.thumbnail || (short.id ? `https://i.ytimg.com/vi_webp/${short.id}/hqdefault.webp` : '')}
                  alt={short.title}
                  loading="lazy"
                  onError={(e) => {
                    const target = e.currentTarget as HTMLImageElement;
                    if (!target.src.endsWith('.jpg')) {
                      target.src = `https://i.ytimg.com/vi/${short.id}/hqdefault.jpg`;
                    }
                  }}
                />
                {short.isNew && <span className="yt-short-new-badge">New</span>}
              </Link>
            </div>

            {/* Info */}
            <div className="yt-short-info-row">
              <div className="yt-short-text-col">
                <Link href={`/shorts?id=${encodeURIComponent(short.id)}`} className="yt-short-title-link">
                  <h3 className="yt-short-title">{short.title}</h3>
                </Link>
                <div className="yt-short-views">{formatViews(short.view_count)}</div>
              </div>
              <button className="yt-short-action-btn" title="Action menu">
                <IoEllipsisVertical size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Show more / Show fewer Divider Button (YouTube style) */}
      {canExpand && (
        <div className="yt-cluster-divider" style={{ marginTop: '24px', marginBottom: '8px' }}>
          <div className="yt-cluster-line" />
          <button
            type="button"
            className="yt-cluster-show-more-btn"
            onClick={() => setExpanded(!expanded)}
          >
            <span>{expanded ? 'Show fewer' : 'Show more'}</span>
            <IoChevronDown
              size={18}
              style={{
                transform: expanded ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.2s',
              }}
            />
          </button>
          <div className="yt-cluster-line" />
        </div>
      )}
    </div>
  );
}

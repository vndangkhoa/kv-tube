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
  fallbackThumbnail?: string;
  view_count?: number;
  isNew?: boolean;
}

function formatViews(views?: number): string {
  if (!views) return '';
  if (views >= 1000000) return (views / 1000000).toFixed(1) + 'M views';
  if (views >= 1000) return Math.round(views / 1000) + 'K views';
  return views + ' views';
}

interface ShortsShelfProps {
  shorts?: ShortItem[];
  loading?: boolean;
}

export default function ShortsShelf({ shorts, loading = false }: ShortsShelfProps) {
  const [expanded, setExpanded] = useState(false);

  if (loading && (!shorts || shorts.length === 0)) {
    return (
      <div className="yt-shorts-shelf-container">
        <div className="yt-shorts-shelf-header">
          <div className="yt-shorts-shelf-title-group">
            <ShortsIcon size={24} className="yt-shorts-shelf-icon" filled={true} />
            <h2 className="yt-shorts-shelf-title">Shorts</h2>
          </div>
        </div>
        <div className="yt-shorts-grid">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="yt-short-card">
              <div className="yt-short-thumb-wrapper skeleton" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!shorts || shorts.length === 0) {
    return null;
  }

  const allItems = shorts;
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
        {items.map((short, idx) => {
          const advanceThumbFallback = (target: HTMLImageElement) => {
            const candidates = [
              short.fallbackThumbnail,
              short.id ? `https://i.ytimg.com/vi/${short.id}/hq720.jpg` : undefined,
              short.id ? `https://i.ytimg.com/vi/${short.id}/hqdefault.jpg` : undefined,
            ].filter((u): u is string => Boolean(u && u !== target.src));
            const step = Number(target.dataset.fbStep || '0');
            if (step < candidates.length) {
              target.dataset.fbStep = String(step + 1);
              target.src = candidates[step];
            }
          };

          return (
          <div key={short.id || idx} className="yt-short-card">
            {/* Thumbnail */}
            <div className="yt-short-thumb-wrapper">
              <Link href={`/shorts?id=${encodeURIComponent(short.id)}`} className="yt-short-thumb-link">
                <img
                  src={short.thumbnail || short.fallbackThumbnail || (short.id ? `https://i.ytimg.com/vi/${short.id}/hq720.jpg` : '')}
                  alt={short.title}
                  loading="lazy"
                  onLoad={(e) => {
                    const target = e.currentTarget as HTMLImageElement;
                    // YouTube serves a 120x90 grey 3-dot JPEG with HTTP 200 for missing Shorts variants
                    if (target.naturalWidth > 0 && target.naturalWidth <= 120) {
                      advanceThumbFallback(target);
                    }
                  }}
                  onError={(e) => advanceThumbFallback(e.currentTarget as HTMLImageElement)}
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
                <div className="yt-short-views">{formatViews(short.view_count) || short.uploader || ''}</div>
              </div>
              <button className="yt-short-action-btn" title="Action menu">
                <IoEllipsisVertical size={16} />
              </button>
            </div>
          </div>
          );
        })}
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

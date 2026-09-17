'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import LoadingSpinner from '../components/LoadingSpinner';
import { getDownloads, removeDownload, clearDownloads, DownloadItem } from '../storage';
import {
  IoDownloadOutline,
  IoTrashOutline,
  IoPlayOutline,
  IoCloudDownloadOutline,
  IoVideocamOutline,
  IoMusicalNotesOutline,
} from 'react-icons/io5';

function formatDownloadDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function DownloadsPage() {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDownloads = () => {
    setLoading(true);
    try {
      setDownloads(getDownloads(100));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDownloads();
  }, []);

  const handleRemove = (id: string) => {
    removeDownload(id);
    setDownloads((prev) => prev.filter((d) => d.id !== id));
  };

  const handleClearAll = () => {
    if (window.confirm('Clear all recorded downloads history?')) {
      clearDownloads();
      setDownloads([]);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '80px 0', display: 'flex', justifyContent: 'center' }}>
        <LoadingSpinner text="Scanning downloaded videos..." />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px 24px 60px' }}>
      {/* Header Banner */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '20px',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '28px',
          paddingBottom: '20px',
          borderBottom: '1px solid var(--yt-border, rgba(255,255,255,0.1))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: 'rgba(56, 189, 248, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#38bdf8',
            }}
          >
            <IoDownloadOutline size={26} />
          </div>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 4px', color: 'var(--yt-text-primary)' }}>
              Downloads
            </h1>
            <p style={{ fontSize: '14px', color: 'var(--yt-text-secondary)', margin: 0 }}>
              {downloads.length} {downloads.length === 1 ? 'file' : 'files'} downloaded for offline playback
            </p>
          </div>
        </div>

        {downloads.length > 0 && (
          <button
            type="button"
            onClick={handleClearAll}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 16px',
              borderRadius: '24px',
              border: '1px solid var(--yt-border, rgba(255,255,255,0.15))',
              backgroundColor: 'transparent',
              color: 'var(--yt-text-secondary)',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            <IoTrashOutline size={16} />
            <span>Clear History</span>
          </button>
        )}
      </div>

      {downloads.length === 0 ? (
        <div
          style={{
            padding: '80px 24px',
            textAlign: 'center',
            color: 'var(--yt-text-secondary)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <IoCloudDownloadOutline size={52} style={{ opacity: 0.5, marginBottom: '8px' }} />
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--yt-text-primary)', margin: 0 }}>
            No downloads yet
          </h2>
          <p style={{ fontSize: '14px', maxWidth: '440px', margin: 0 }}>
            You can download high-definition MP4 videos or audio-only streams directly to your device from the watch page.
          </p>
          <Link
            href="/"
            style={{
              marginTop: '16px',
              display: 'inline-block',
              padding: '10px 20px',
              borderRadius: '20px',
              backgroundColor: 'var(--md-sys-color-primary, #3ea6ff)',
              color: '#fff',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '14px',
            }}
          >
            Find Videos to Download
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {downloads.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                gap: '16px',
                alignItems: 'center',
                padding: '12px 16px',
                borderRadius: '12px',
                backgroundColor: 'var(--yt-hover-bg, rgba(255,255,255,0.04))',
                border: '1px solid var(--yt-border, rgba(255,255,255,0.06))',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flex: 1, minWidth: '260px' }}>
                <Link href={`/watch?v=${item.videoId}`} style={{ flexShrink: 0, position: 'relative' }}>
                  <img
                    src={item.thumbnail || `https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`}
                    alt={item.title}
                    style={{
                      width: '120px',
                      height: '68px',
                      objectFit: 'cover',
                      borderRadius: '8px',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '4px',
                      right: '4px',
                      backgroundColor: 'rgba(0,0,0,0.8)',
                      padding: '2px 4px',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px',
                      fontSize: '11px',
                      color: '#fff',
                    }}
                  >
                    {item.type === 'audio' ? <IoMusicalNotesOutline size={12} /> : <IoVideocamOutline size={12} />}
                    <span>{item.container.toUpperCase()}</span>
                  </div>
                </Link>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link
                    href={`/watch?v=${item.videoId}`}
                    style={{
                      textDecoration: 'none',
                      color: 'var(--yt-text-primary)',
                      fontSize: '15px',
                      fontWeight: 600,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      marginBottom: '4px',
                    }}
                  >
                    {item.title}
                  </Link>
                  <div style={{ fontSize: '13px', color: 'var(--yt-text-secondary)', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span>{item.channelTitle || 'Creator'}</span>
                    <span>•</span>
                    <span
                      style={{
                        padding: '1px 6px',
                        borderRadius: '4px',
                        backgroundColor: 'rgba(56, 189, 248, 0.15)',
                        color: '#38bdf8',
                        fontWeight: 600,
                        fontSize: '11px',
                      }}
                    >
                      {item.quality}
                    </span>
                    <span>•</span>
                    <span>{formatDownloadDate(item.timestamp)}</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Link
                  href={`/watch?v=${item.videoId}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    borderRadius: '18px',
                    backgroundColor: 'var(--md-sys-color-primary, #3ea6ff)',
                    color: '#fff',
                    textDecoration: 'none',
                    fontSize: '13px',
                    fontWeight: 600,
                  }}
                >
                  <IoPlayOutline size={16} />
                  <span>Watch</span>
                </Link>

                <button
                  type="button"
                  onClick={() => handleRemove(item.id)}
                  title="Remove from download history"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--yt-text-secondary)',
                    cursor: 'pointer',
                    padding: '8px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <IoTrashOutline size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import LoadingSpinner from '../components/LoadingSpinner';
import { invidious } from '../services/invidious';
import {
  getLocalPlaylists,
  createLocalPlaylist,
  deleteLocalPlaylist,
  LocalPlaylist,
} from '../storage';
import {
  IoListOutline,
  IoAddOutline,
  IoTrashOutline,
  IoPlayOutline,
  IoFolderOutline,
  IoCloudDoneOutline,
  IoPhonePortraitOutline,
  IoCloseOutline,
} from 'react-icons/io5';

interface CombinedPlaylist {
  id: string;
  title: string;
  videoCount: number;
  thumbnail?: string;
  author: string;
  isOnline: boolean;
  updatedAt?: number;
}

export default function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<CombinedPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [hasToken, setHasToken] = useState(false);

  const loadAllPlaylists = useCallback(async () => {
    setLoading(true);
    const token = invidious.getToken();
    setHasToken(!!token);

    const combined: CombinedPlaylist[] = [];

    // 1. Fetch Invidious Authenticated Playlists if token exists
    if (token) {
      try {
        const invPlaylists = await invidious.getAuthPlaylists();
        if (Array.isArray(invPlaylists)) {
          invPlaylists.forEach((p: any) => {
            combined.push({
              id: p.playlistId || p.id,
              title: p.title || 'Untitled Playlist',
              videoCount: p.videoCount ?? p.videos?.length ?? 0,
              thumbnail: p.videos?.[0]?.videoThumbnails?.[0]?.url,
              author: 'Invidious Account',
              isOnline: true,
              updatedAt: p.updated ? p.updated * 1000 : undefined,
            });
          });
        }
      } catch (err) {
        console.warn('[Playlists] Error loading Invidious playlists:', err);
      }
    }

    // 2. Load Local Browser Playlists
    const local = getLocalPlaylists();
    local.forEach((lp) => {
      combined.push({
        id: lp.id,
        title: lp.title,
        videoCount: lp.videos.length,
        thumbnail: lp.videos[0]?.thumbnail,
        author: 'Local Device',
        isOnline: false,
        updatedAt: lp.updatedAt,
      });
    });

    setPlaylists(combined);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAllPlaylists();
  }, [loadAllPlaylists]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setCreating(true);
    try {
      if (hasToken) {
        try {
          await invidious.createAuthPlaylist(newTitle.trim(), 'private');
        } catch {
          createLocalPlaylist(newTitle.trim(), newDesc.trim());
        }
      } else {
        createLocalPlaylist(newTitle.trim(), newDesc.trim());
      }
      setNewTitle('');
      setNewDesc('');
      setShowCreateModal(false);
      await loadAllPlaylists();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (p: CombinedPlaylist) => {
    if (!window.confirm(`Delete playlist "${p.title}"?`)) return;

    if (p.isOnline) {
      try {
        await invidious.deleteAuthPlaylist(p.id);
      } catch (e) {
        console.error('Failed to delete online playlist:', e);
      }
    } else {
      deleteLocalPlaylist(p.id);
    }
    setPlaylists((prev) => prev.filter((item) => item.id !== p.id));
  };

  if (loading) {
    return (
      <div style={{ padding: '80px 0', display: 'flex', justifyContent: 'center' }}>
        <LoadingSpinner text="Loading your saved playlists..." />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1750px', margin: '0 auto', padding: '24px 24px 60px' }}>
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
              backgroundColor: 'rgba(168, 85, 247, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#a855f7',
            }}
          >
            <IoListOutline size={26} />
          </div>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 4px', color: 'var(--yt-text-primary)' }}>
              Playlists
            </h1>
            <p style={{ fontSize: '14px', color: 'var(--yt-text-secondary)', margin: 0 }}>
              {playlists.length} {playlists.length === 1 ? 'playlist' : 'playlists'} available
              {hasToken ? ' · Invidious synced' : ' · Local storage'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            borderRadius: '24px',
            backgroundColor: 'var(--md-sys-color-primary, #3ea6ff)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '14px',
          }}
        >
          <IoAddOutline size={20} />
          <span>New Playlist</span>
        </button>
      </div>

      {/* Playlist Grid */}
      {playlists.length === 0 ? (
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
          <IoFolderOutline size={52} style={{ opacity: 0.5, marginBottom: '8px' }} />
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--yt-text-primary)', margin: 0 }}>
            No playlists found
          </h2>
          <p style={{ fontSize: '14px', maxWidth: '420px', margin: 0 }}>
            Organize your favorite videos, songs, and shows into custom playlists.
          </p>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            style={{
              marginTop: '16px',
              padding: '10px 20px',
              borderRadius: '20px',
              backgroundColor: 'var(--md-sys-color-primary, #3ea6ff)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '14px',
            }}
          >
            Create Your First Playlist
          </button>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '24px',
          }}
        >
          {playlists.map((p) => (
            <div
              key={p.id}
              style={{
                borderRadius: '12px',
                overflow: 'hidden',
                backgroundColor: 'var(--yt-hover-bg, rgba(255,255,255,0.04))',
                border: '1px solid var(--yt-border, rgba(255,255,255,0.08))',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Thumbnail header */}
              <Link
                href={`/playlist?list=${p.id}`}
                style={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: '16/9',
                  backgroundColor: '#1f242c',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  textDecoration: 'none',
                }}
              >
                {p.thumbnail ? (
                  <img
                    src={p.thumbnail}
                    alt={p.title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <IoListOutline size={48} color="rgba(255,255,255,0.3)" />
                )}

                {/* Right overlay banner showing video count */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    bottom: 0,
                    width: '38%',
                    backgroundColor: 'rgba(0, 0, 0, 0.75)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    gap: '4px',
                  }}
                >
                  <span style={{ fontSize: '16px', fontWeight: 700 }}>{p.videoCount}</span>
                  <IoListOutline size={20} />
                </div>
              </Link>

              {/* Info & Actions */}
              <div style={{ padding: '14px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <Link
                    href={`/playlist?list=${p.id}`}
                    style={{
                      fontSize: '16px',
                      fontWeight: 600,
                      color: 'var(--yt-text-primary)',
                      textDecoration: 'none',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      marginBottom: '6px',
                    }}
                  >
                    {p.title}
                  </Link>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '12px',
                      color: 'var(--yt-text-secondary)',
                    }}
                  >
                    {p.isOnline ? (
                      <>
                        <IoCloudDoneOutline size={14} color="#3ea6ff" />
                        <span>Invidious Cloud</span>
                      </>
                    ) : (
                      <>
                        <IoPhonePortraitOutline size={14} color="#a855f7" />
                        <span>Local Playlist</span>
                      </>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: '16px',
                    paddingTop: '12px',
                    borderTop: '1px solid var(--yt-border, rgba(255,255,255,0.06))',
                  }}
                >
                  <Link
                    href={`/playlist?list=${p.id}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--md-sys-color-primary, #3ea6ff)',
                      textDecoration: 'none',
                    }}
                  >
                    <IoPlayOutline size={16} />
                    <span>View All</span>
                  </Link>

                  <button
                    type="button"
                    onClick={() => handleDelete(p)}
                    title="Delete playlist"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--yt-text-secondary)',
                      cursor: 'pointer',
                      padding: '4px',
                    }}
                  >
                    <IoTrashOutline size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCreateModal(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            style={{
              width: 'min(420px, 100%)',
              backgroundColor: 'var(--yt-background, #16181d)',
              borderRadius: '16px',
              padding: '24px',
              border: '1px solid var(--yt-border, rgba(255,255,255,0.1))',
              boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--yt-text-primary)' }}>
                New Playlist
              </h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--yt-text-secondary)', cursor: 'pointer' }}
              >
                <IoCloseOutline size={22} />
              </button>
            </div>

            <form onSubmit={handleCreate}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', color: 'var(--yt-text-secondary)', marginBottom: '6px' }}>
                  Title
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Enter playlist title"
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--yt-border, rgba(255,255,255,0.15))',
                    backgroundColor: 'var(--yt-search-bg, rgba(255,255,255,0.06))',
                    color: 'var(--yt-text-primary)',
                    fontSize: '14px',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '13px', color: 'var(--yt-text-secondary)', marginBottom: '6px' }}>
                  Description (optional)
                </label>
                <textarea
                  rows={3}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Describe your playlist"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--yt-border, rgba(255,255,255,0.15))',
                    backgroundColor: 'var(--yt-search-bg, rgba(255,255,255,0.06))',
                    color: 'var(--yt-text-primary)',
                    fontSize: '14px',
                    outline: 'none',
                    resize: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '18px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: 'var(--yt-text-secondary)',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newTitle.trim()}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '18px',
                    border: 'none',
                    backgroundColor: 'var(--md-sys-color-primary, #3ea6ff)',
                    color: '#fff',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '14px',
                    opacity: creating || !newTitle.trim() ? 0.6 : 1,
                  }}
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

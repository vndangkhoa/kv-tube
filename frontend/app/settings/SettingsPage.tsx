'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { invidious } from '../services/invidious';
import { useTheme } from '../context/ThemeContext';
import { THEME_PRESETS, ThemeMode } from '../utils/materialTheme';
import {
  IoColorPaletteOutline,
  IoGlobeOutline,
  IoShieldCheckmarkOutline,
  IoCheckmarkCircle,
  IoMoonOutline,
  IoSunnyOutline,
  IoFlashOutline,
  IoThumbsUpOutline,
  IoCloudDownloadOutline,
  IoServerOutline,
  IoRefreshOutline,
  IoTvOutline,
} from 'react-icons/io5';

const API_BASE = '/api';

interface CookiesStatus {
  configured: boolean;
  source: 'env' | 'persisted' | 'browser' | 'anonymous' | 'none';
  path?: string;
  exists?: boolean;
  valid?: boolean;
  entries?: number;
  blacklisted?: boolean;
}

interface SettingsStatus {
  ytdlp: {
    version: string;
    auto_update: boolean;
    last_check_at?: string;
  };
  cookies: CookiesStatus;
  ipv6?: {
    force: 'auto' | 'ipv6' | 'ipv4';
    available: boolean;
    probed: boolean;
    targets?: Record<string, string>;
  };
}

interface NetworkDiag {
  family: 'ipv4' | 'ipv6';
  ipv6_routable: boolean;
  youtube_v4: string;
  youtube_v6: string;
  ytdlp_version: string;
  impersonate?: boolean;
  extraction_test?: {
    ok: boolean;
    video_id: string;
    title?: string;
    format_count?: number;
    error?: string;
  };
}

export default function SettingsPage() {
  const [status, setStatus] = useState<SettingsStatus | null>(null);
  const [loadingBackend, setLoadingBackend] = useState(true);
  const [invidiousUrl, setInvidiousUrl] = useState('https://yt.khoavo.myds.me');
  const [instanceStatus, setInstanceStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [instanceMessage, setInstanceMessage] = useState<string | null>(null);
  const [defaultQuality, setDefaultQuality] = useState('auto');
  const [sponsorblockEnabled, setSponsorblockEnabled] = useState(true);
  const [rydEnabled, setRydEnabled] = useState(true);

  const { themeMode, setThemeMode, currentPreset, setPreset, seedColor, setCustomSeedColor } = useTheme();

  const [updating, setUpdating] = useState(false);
  const [updateResult, setUpdateResult] = useState<{ before?: string; after?: string; error?: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [browser, setBrowser] = useState('chrome');
  const [diag, setDiag] = useState<NetworkDiag | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  const fetchBrowsers = ['chrome', 'chromium', 'firefox', 'edge', 'brave', 'opera', 'vivaldi', 'whale'];

  const [invidiousToken, setInvidiousToken] = useState('');
  const [tokenStatus, setTokenStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [tokenMessage, setTokenMessage] = useState<string | null>(null);

  // Android TV pairing
  const [tvPairCode, setTvPairCode] = useState('');
  const [pairTvStatus, setPairTvStatus] = useState<'idle' | 'sending' | 'ok' | 'fail'>('idle');
  const [pairTvMessage, setPairTvMessage] = useState<string | null>(null);

  // Initialize Client Preferences
  useEffect(() => {
    setInvidiousUrl(invidious.getInstanceUrl());
    setInvidiousToken(invidious.getToken() || '');
    try {
      const q = localStorage.getItem('kv_default_quality');
      if (q) setDefaultQuality(q);
      const sb = localStorage.getItem('kv_sponsorblock_enabled');
      if (sb !== null) setSponsorblockEnabled(sb === 'true');
      const ryd = localStorage.getItem('kv_ryd_enabled');
      if (ryd !== null) setRydEnabled(ryd === 'true');
    } catch {}
  }, []);

  const handleSaveInstance = async () => {
    setInstanceStatus('testing');
    setInstanceMessage(null);
    try {
      const url = invidiousUrl.trim();
      invidious.setInstanceUrl(url);
      const test = await invidious.testInstance(url);
      if (test.success) {
        setInstanceStatus('ok');
        setInstanceMessage(test.message);
      } else {
        setInstanceStatus('fail');
        setInstanceMessage(test.message);
      }
      setTimeout(() => setInstanceStatus('idle'), 5000);
    } catch (e: any) {
      setInstanceStatus('fail');
      setInstanceMessage(e?.message || 'Could not connect to instance');
    }
  };

  const handleSaveToken = async () => {
    setTokenStatus('testing');
    setTokenMessage(null);
    try {
      invidious.setToken(invidiousToken.trim());
      const test = await invidious.testAuthToken(invidiousToken.trim());
      if (test.success) {
        setTokenStatus('ok');
        setTokenMessage(test.message);
      } else {
        setTokenStatus('fail');
        setTokenMessage(test.message);
      }
      setTimeout(() => setTokenStatus('idle'), 6000);
    } catch (e: any) {
      setTokenStatus('fail');
      setTokenMessage(e?.message || 'Authentication error');
    }
  };

  const handlePairTv = async () => {
    setPairTvStatus('sending');
    setPairTvMessage(null);
    try {
      const code = tvPairCode.trim().toUpperCase();
      if (code.length < 4) throw new Error('Enter the 6-character code shown on your TV');
      const res = await fetch('/api/tv-pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'link',
          code,
          instanceUrl: invidious.getInstanceUrl(),
          token: invidious.getToken() || '',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setPairTvStatus('ok');
      setPairTvMessage('✓ Sent! Your TV is now signed in.');
      setTvPairCode('');
    } catch (e: any) {
      setPairTvStatus('fail');
      setPairTvMessage(e?.message || 'Failed to send to TV');
    } finally {
      setTimeout(() => setPairTvStatus('idle'), 6000);
    }
  };

  const handleQualityChange = (q: string) => {
    setDefaultQuality(q);
    try {
      localStorage.setItem('kv_default_quality', q);
    } catch {}
  };

  const handleToggleSponsorblock = () => {
    const next = !sponsorblockEnabled;
    setSponsorblockEnabled(next);
    try {
      localStorage.setItem('kv_sponsorblock_enabled', String(next));
    } catch {}
  };

  const handleToggleRyd = () => {
    const next = !rydEnabled;
    setRydEnabled(next);
    try {
      localStorage.setItem('kv_ryd_enabled', String(next));
    } catch {}
  };

  const safeJson = async (res: Response): Promise<any | null> => {
    try {
      const type = res.headers.get('content-type') || '';
      if (type.includes('application/json')) {
        return await res.json();
      }
    } catch {}
    return null;
  };

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/settings/status`);
      if (res.ok) {
        const d = await safeJson(res);
        if (d) setStatus(d);
      }
    } catch (_) {
      // Backend may be offline or standalone client mode
    } finally {
      setLoadingBackend(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  async function handleUpdateYtDlp() {
    setUpdating(true);
    setUpdateResult(null);
    try {
      const res = await fetch(`${API_BASE}/settings/ytdlp/update`, { method: 'POST' });
      const data = await safeJson(res);
      if (res.ok && data) {
        setUpdateResult({ before: data.before, after: data.after });
      } else {
        setUpdateResult({ before: data?.before, after: data?.after, error: data?.error || 'Update failed' });
      }
      await fetchStatus();
    } catch (e: any) {
      setUpdateResult({ error: e?.message || 'Update failed' });
    } finally {
      setUpdating(false);
    }
  }

  async function handleCookiesUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API_BASE}/settings/cookies`, { method: 'POST', body: form });
      const data = await safeJson(res);
      if (!res.ok) {
        setFileError(data?.error || 'Upload failed');
      }
      await fetchStatus();
    } catch (err: any) {
      setFileError(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleCookiesDelete() {
    setFileError(null);
    try {
      await fetch(`${API_BASE}/settings/cookies`, { method: 'DELETE' });
      await fetchStatus();
    } catch (err: any) {
      setFileError(err?.message || 'Delete failed');
    }
  }

  async function handleCookiesFetch() {
    setFileError(null);
    setFetching(true);
    try {
      const res = await fetch(`${API_BASE}/settings/cookies/fetch?browser=${encodeURIComponent(browser)}`, { method: 'POST' });
      const data = await safeJson(res);
      if (!res.ok) {
        setFileError(data?.error || 'Fetch failed');
      }
      await fetchStatus();
    } catch (err: any) {
      setFileError(err?.message || 'Fetch failed');
    } finally {
      setFetching(false);
    }
  }

  async function handleDiagnose() {
    setDiagLoading(true);
    setDiag(null);
    try {
      const res = await fetch(`${API_BASE}/settings/diagnose`);
      if (res.ok) {
        const d = await safeJson(res);
        if (d) setDiag(d);
      }
    } catch (err: any) {
      setDiag({ family: 'ipv4', ipv6_routable: false, youtube_v4: 'ERR', youtube_v6: 'ERR', ytdlp_version: '' });
    } finally {
      setDiagLoading(false);
    }
  }

  async function handleExtractionTest() {
    setDiagLoading(true);
    setDiag(null);
    try {
      const res = await fetch(`${API_BASE}/settings/diagnose?test=1`, { signal: AbortSignal.timeout(90000) });
      if (res.ok) {
        const d = await safeJson(res);
        if (d) setDiag(d);
      }
    } catch (err: any) {
      setDiag({ family: 'ipv4', ipv6_routable: false, youtube_v4: 'ERR', youtube_v6: 'ERR', ytdlp_version: '' });
    } finally {
      setDiagLoading(false);
    }
  }

  const cookieLabel = (s?: CookiesStatus): string => {
    if (!s) return 'Not configured';
    switch (s.source) {
      case 'env': return 'From environment (YTDLP_COOKIES)';
      case 'browser': return 'From browser (YTDLP_COOKIES_FROM_BROWSER)';
      case 'persisted': return 'Uploaded file';
      case 'anonymous': return 'Anonymous session (auto-refreshed)';
      default: return 'Not configured';
    }
  };

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '24px 16px', width: '100%' }}>
      <h1 style={{ fontSize: '26px', fontWeight: 700, color: 'var(--yt-text-primary)', marginBottom: '24px' }}>
        Settings & Preferences
      </h1>

      {/* 1. Invidious Backend Instance Configuration */}
      <section
        style={{
          background: 'var(--yt-surface)',
          border: '1px solid var(--yt-border)',
          borderRadius: '20px',
          padding: '22px',
          marginBottom: '20px',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              backgroundColor: 'var(--md-sys-color-primary-container, var(--yt-hover))',
              color: 'var(--md-sys-color-primary, var(--yt-blue))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IoGlobeOutline size={22} />
          </div>
          <div>
            <h2 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--yt-text-primary)', margin: 0 }}>
              Invidious Backend Instance
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--yt-text-secondary)', margin: 0 }}>
              De-Googled YouTube API & video stream provider
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--yt-text-secondary)', display: 'block', marginBottom: '6px' }}>
              INSTANCE URL:
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="url"
                value={invidiousUrl}
                onChange={(e) => setInvidiousUrl(e.target.value)}
                placeholder="https://yt.khoavo.myds.me"
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '14px',
                  border: '1.5px solid var(--yt-border)',
                  backgroundColor: 'var(--yt-background)',
                  color: 'var(--yt-text-primary)',
                  fontSize: '14px',
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={handleSaveInstance}
                disabled={instanceStatus === 'testing'}
                style={{
                  padding: '10px 20px',
                  borderRadius: '14px',
                  border: 'none',
                  backgroundColor:
                    instanceStatus === 'ok'
                      ? '#00c853'
                      : instanceStatus === 'fail'
                      ? '#ff334b'
                      : 'var(--md-sys-color-primary, var(--yt-blue))',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: instanceStatus === 'testing' ? 'wait' : 'pointer',
                  transition: 'background-color 0.2s ease',
                  whiteSpace: 'nowrap',
                }}
              >
                {instanceStatus === 'testing'
                  ? 'Testing...'
                  : instanceStatus === 'ok'
                  ? '✓ Connected'
                  : instanceStatus === 'fail'
                  ? '✗ Failed'
                  : 'Save & Test'}
              </button>
            </div>
            {instanceMessage && (
              <div
                style={{
                  marginTop: '8px',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: instanceStatus === 'ok' ? '#00c853' : '#ff334b',
                }}
              >
                {instanceMessage}
              </div>
            )}
          </div>

          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--yt-text-secondary)', display: 'block', marginBottom: '6px' }}>
              INVIDIOUS AUTH / SESSION TOKEN:
            </label>
            <p style={{ fontSize: '12px', color: 'var(--yt-text-secondary)', margin: '0 0 8px' }}>
              Enter your Invidious token or session string (e.g. <code>v1:...</code> or JSON token) to sync subscriptions, history, and playlists.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="password"
                value={invidiousToken}
                onChange={(e) => setInvidiousToken(e.target.value)}
                placeholder="v1:DyRHmmLjL30lxhEVgXpOEAB5M_CeyBiYeOUiuEff_rs="
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '14px',
                  border: '1.5px solid var(--yt-border)',
                  backgroundColor: 'var(--yt-background)',
                  color: 'var(--yt-text-primary)',
                  fontSize: '14px',
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={handleSaveToken}
                disabled={tokenStatus === 'testing'}
                style={{
                  padding: '10px 20px',
                  borderRadius: '14px',
                  border: 'none',
                  backgroundColor:
                    tokenStatus === 'ok'
                      ? '#00c853'
                      : tokenStatus === 'fail'
                      ? '#ff334b'
                      : 'var(--md-sys-color-primary, var(--yt-blue))',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: tokenStatus === 'testing' ? 'wait' : 'pointer',
                  transition: 'background-color 0.2s ease',
                  whiteSpace: 'nowrap',
                }}
              >
                {tokenStatus === 'testing'
                  ? 'Testing...'
                  : tokenStatus === 'ok'
                  ? '✓ Valid Token'
                  : tokenStatus === 'fail'
                  ? '✗ Auth Error'
                  : 'Save & Test'}
              </button>
            </div>
            {tokenMessage && (
              <div
                style={{
                  marginTop: '8px',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: tokenStatus === 'ok' ? '#00c853' : '#ff334b',
                }}
              >
                {tokenMessage}
              </div>
            )}
          </div>

          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--yt-text-secondary)', display: 'block', marginBottom: '6px' }}>
              PAIR ANDROID TV DEVICE:
            </label>
            <p style={{ fontSize: '12px', color: 'var(--yt-text-secondary)', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <IoTvOutline size={14} />
              No token typing on the remote — open KV-Tube on your TV → Settings → Connection → “Pair device”, then enter the code it shows:
            </p>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="text"
                value={tvPairCode}
                onChange={(e) => setTvPairCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === 'Enter') handlePairTv(); }}
                placeholder="e.g. K7M2XQ"
                maxLength={8}
                autoComplete="off"
                style={{
                  width: '160px',
                  padding: '10px 14px',
                  borderRadius: '14px',
                  border: '1.5px solid var(--yt-border)',
                  backgroundColor: 'var(--yt-background)',
                  color: 'var(--yt-text-primary)',
                  fontSize: '16px',
                  fontFamily: 'monospace',
                  letterSpacing: '4px',
                  textTransform: 'uppercase',
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={handlePairTv}
                disabled={pairTvStatus === 'sending'}
                style={{
                  padding: '10px 20px',
                  borderRadius: '14px',
                  border: 'none',
                  backgroundColor:
                    pairTvStatus === 'ok'
                      ? '#00c853'
                      : pairTvStatus === 'fail'
                      ? '#ff334b'
                      : 'var(--md-sys-color-primary, var(--yt-blue))',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: pairTvStatus === 'sending' ? 'wait' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {pairTvStatus === 'sending' ? 'Sending…' : pairTvStatus === 'ok' ? '✓ Sent to TV' : 'Send to TV'}
              </button>
            </div>
            {pairTvMessage && (
              <div
                style={{
                  marginTop: '8px',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: pairTvStatus === 'ok' ? '#00c853' : '#ff334b',
                }}
              >
                {pairTvMessage}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 2. Material 3 Appearance & Theme */}
      <section
        style={{
          background: 'var(--yt-surface)',
          border: '1px solid var(--yt-border)',
          borderRadius: '20px',
          padding: '22px',
          marginBottom: '20px',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              backgroundColor: 'var(--md-sys-color-primary-container, var(--yt-hover))',
              color: 'var(--md-sys-color-primary, var(--yt-blue))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IoColorPaletteOutline size={22} />
          </div>
          <div>
            <h2 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--yt-text-primary)', margin: 0 }}>
              Appearance & Theming (Material You)
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--yt-text-secondary)', margin: 0 }}>
              Dynamic colors, AMOLED black, and preset tonal palettes
            </p>
          </div>
        </div>

        {/* Mode Selector */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--yt-text-secondary)', display: 'block', marginBottom: '8px' }}>
            THEME MODE:
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setThemeMode('dark')}
              style={{
                padding: '10px',
                borderRadius: '14px',
                border: themeMode === 'dark' ? '2px solid var(--md-sys-color-primary, var(--yt-blue))' : '1px solid var(--yt-border)',
                backgroundColor: themeMode === 'dark' ? 'var(--yt-hover)' : 'transparent',
                color: 'var(--yt-text-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              <IoMoonOutline size={16} /> Dark
            </button>
            <button
              type="button"
              onClick={() => setThemeMode('amoled')}
              style={{
                padding: '10px',
                borderRadius: '14px',
                border: themeMode === 'amoled' ? '2px solid #00ffff' : '1px solid var(--yt-border)',
                backgroundColor: themeMode === 'amoled' ? '#000000' : 'transparent',
                color: 'var(--yt-text-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              <IoFlashOutline size={16} color="#00ffff" /> AMOLED
            </button>
            <button
              type="button"
              onClick={() => setThemeMode('light')}
              style={{
                padding: '10px',
                borderRadius: '14px',
                border: themeMode === 'light' ? '2px solid #ff9800' : '1px solid var(--yt-border)',
                backgroundColor: themeMode === 'light' ? 'var(--yt-hover)' : 'transparent',
                color: 'var(--yt-text-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              <IoSunnyOutline size={16} color="#ff9800" /> Light
            </button>
          </div>
        </div>

        {/* Preset Palettes */}
        <div>
          <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--yt-text-secondary)', display: 'block', marginBottom: '8px' }}>
            COLOR PALETTES:
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            {THEME_PRESETS.map((preset) => {
              const isActive = currentPreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setPreset(preset.id)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '12px',
                    border: isActive ? `2px solid ${preset.seedColor}` : '1px solid var(--yt-border)',
                    backgroundColor: isActive ? 'var(--yt-hover)' : 'transparent',
                    color: 'var(--yt-text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 500,
                  }}
                >
                  <span
                    style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      backgroundColor: preset.seedColor,
                      boxShadow: isActive ? `0 0 6px ${preset.seedColor}` : 'none',
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {preset.name.split(' ')[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* 3. Player & Privacy Features */}
      <section
        style={{
          background: 'var(--yt-surface)',
          border: '1px solid var(--yt-border)',
          borderRadius: '20px',
          padding: '22px',
          marginBottom: '20px',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              backgroundColor: 'var(--md-sys-color-primary-container, var(--yt-hover))',
              color: 'var(--md-sys-color-primary, var(--yt-blue))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IoShieldCheckmarkOutline size={22} />
          </div>
          <div>
            <h2 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--yt-text-primary)', margin: 0 }}>
              Playback & Community Integrations
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--yt-text-secondary)', margin: 0 }}>
              Ad-free streaming, SponsorBlock, and Return YouTube Dislike
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* SponsorBlock Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--yt-text-primary)' }}>
                SponsorBlock Auto-Skip
              </div>
              <div style={{ fontSize: '12px', color: 'var(--yt-text-secondary)' }}>
                Skip sponsored segments, intro animations, and reminders
              </div>
            </div>
            <button
              type="button"
              onClick={handleToggleSponsorblock}
              style={{
                padding: '6px 14px',
                borderRadius: '16px',
                border: 'none',
                backgroundColor: sponsorblockEnabled ? '#00d66c' : 'var(--yt-border)',
                color: sponsorblockEnabled ? '#000000' : 'var(--yt-text-secondary)',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              {sponsorblockEnabled ? 'ENABLED' : 'DISABLED'}
            </button>
          </div>

          <div style={{ borderTop: '1px solid var(--yt-border)' }} />

          {/* Return YouTube Dislike Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--yt-text-primary)' }}>
                Return YouTube Dislike (RYD)
              </div>
              <div style={{ fontSize: '12px', color: 'var(--yt-text-secondary)' }}>
                Show accurate like and dislike counts with ratio gauge
              </div>
            </div>
            <button
              type="button"
              onClick={handleToggleRyd}
              style={{
                padding: '6px 14px',
                borderRadius: '16px',
                border: 'none',
                backgroundColor: rydEnabled ? 'var(--md-sys-color-primary, var(--yt-blue))' : 'var(--yt-border)',
                color: rydEnabled ? '#ffffff' : 'var(--yt-text-secondary)',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              {rydEnabled ? 'ENABLED' : 'DISABLED'}
            </button>
          </div>

          <div style={{ borderTop: '1px solid var(--yt-border)' }} />

          {/* Default Quality */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--yt-text-primary)' }}>
                Default Streaming Resolution
              </div>
              <div style={{ fontSize: '12px', color: 'var(--yt-text-secondary)' }}>
                Auto adaptive or preferred format
              </div>
            </div>
            <select
              value={defaultQuality}
              onChange={(e) => handleQualityChange(e.target.value)}
              style={{
                padding: '6px 12px',
                borderRadius: '10px',
                border: '1px solid var(--yt-border)',
                backgroundColor: 'var(--yt-background)',
                color: 'var(--yt-text-primary)',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <option value="auto">Auto (Adaptive)</option>
              <option value="1080">1080p Full HD</option>
              <option value="720">720p HD</option>
              <option value="480">480p SD</option>
              <option value="360">360p Data Saver</option>
            </select>
          </div>
        </div>
      </section>

      {/* 4. Subscriptions & Data Management (Invidious Sync) */}
      <section
        style={{
          background: 'var(--yt-surface)',
          border: '1px solid var(--yt-border)',
          borderRadius: '20px',
          padding: '22px',
          marginBottom: '20px',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              backgroundColor: 'var(--md-sys-color-primary-container, var(--yt-hover))',
              color: 'var(--md-sys-color-primary, var(--yt-blue))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IoCloudDownloadOutline size={22} />
          </div>
          <div>
            <h2 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--yt-text-primary)', margin: 0 }}>
              Subscriptions & Data Sync
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--yt-text-secondary)', margin: 0 }}>
              Import from Google Takeout, Invidious JSON, or OPML
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <Link
              href="/feed/subscriptions"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 18px',
                borderRadius: '14px',
                backgroundColor: 'var(--md-sys-color-primary, var(--yt-blue))',
                color: '#ffffff',
                textDecoration: 'none',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              Manage & Import Subscriptions →
            </Link>
          </div>
        </div>
      </section>

      {/* 5. Local Go / yt-dlp Backend (Optional) */}
      <section
        style={{
          background: 'var(--yt-surface)',
          border: '1px solid var(--yt-border)',
          borderRadius: '20px',
          padding: '22px',
          marginBottom: '20px',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              backgroundColor: 'var(--md-sys-color-primary-container, var(--yt-hover))',
              color: 'var(--md-sys-color-primary, var(--yt-blue))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IoServerOutline size={22} />
          </div>
          <div>
            <h2 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--yt-text-primary)', margin: 0 }}>
              Local Extraction & yt-dlp Engine
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--yt-text-secondary)', margin: 0 }}>
              Status of local background extraction service
            </p>
          </div>
        </div>

        {status ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontSize: '13px', color: 'var(--yt-text-primary)' }}>
              yt-dlp version: <span style={{ fontWeight: 600 }}>{status.ytdlp?.version || 'unknown'}</span>
            </div>
            <div style={{ fontSize: '13px', color: 'var(--yt-text-secondary)' }}>
              Cookie state: {cookieLabel(status.cookies)}
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
              <button
                onClick={handleUpdateYtDlp}
                disabled={updating}
                style={{
                  padding: '8px 16px',
                  borderRadius: '12px',
                  border: 'none',
                  backgroundColor: 'var(--md-sys-color-primary, var(--yt-blue))',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {updating ? 'Updating...' : 'Update yt-dlp'}
              </button>
              <button
                onClick={handleDiagnose}
                disabled={diagLoading}
                style={{
                  padding: '8px 16px',
                  borderRadius: '12px',
                  border: '1px solid var(--yt-border)',
                  backgroundColor: 'transparent',
                  color: 'var(--yt-text-primary)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {diagLoading ? 'Diagnosing...' : 'Run Diagnostics'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '13px', color: 'var(--yt-text-secondary)' }}>
            Status: <span style={{ color: '#22c55e', fontWeight: 600 }}>Standalone Invidious Mode Active</span>
            <p style={{ margin: '6px 0 0', fontSize: '12px' }}>
              Streams, search, and metadata are served directly from Invidious (<code>{invidiousUrl}</code>).
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

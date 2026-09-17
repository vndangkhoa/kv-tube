'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { invidious } from '../services/invidious';
import { useTheme } from '../context/ThemeContext';
import { THEME_PRESETS, ThemeMode } from '../utils/materialTheme';
import {
  IoColorPaletteOutline,
  IoCheckmarkCircle,
  IoMoonOutline,
  IoSunnyOutline,
  IoFlashOutline,
  IoPlayCircleOutline,
  IoPersonCircleOutline,
  IoTvOutline,
  IoServerOutline,
  IoRefreshOutline,
  IoCopyOutline,
  IoShieldCheckmarkOutline,
  IoCloudUploadOutline,
  IoTrashOutline,
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

function ToggleSwitch({
  checked,
  onChange,
  id,
}: {
  checked: boolean;
  onChange: () => void;
  id?: string;
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`yt-toggle-track ${checked ? 'active' : ''}`}
    >
      <span className={`yt-toggle-thumb ${checked ? 'active' : ''}`} />
    </button>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'playback' | 'appearance' | 'account' | 'devices' | 'instance'>('playback');

  const [status, setStatus] = useState<SettingsStatus | null>(null);
  const [loadingBackend, setLoadingBackend] = useState(true);
  const [invidiousUrl, setInvidiousUrl] = useState('https://yt.khoavo.myds.me');
  const [instanceStatus, setInstanceStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [instanceMessage, setInstanceMessage] = useState<string | null>(null);
  const [defaultQuality, setDefaultQuality] = useState('auto');
  const [sponsorblockEnabled, setSponsorblockEnabled] = useState(true);
  const [rydEnabled, setRydEnabled] = useState(true);

  const { themeMode, setThemeMode, currentPreset, setPreset } = useTheme();

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

  // Device pairing — send credentials to a TV / phone / other browser
  const [tvPairCode, setTvPairCode] = useState('');
  const [pairTvStatus, setPairTvStatus] = useState<'idle' | 'sending' | 'ok' | 'fail'>('idle');
  const [pairTvMessage, setPairTvMessage] = useState<string | null>(null);

  // Pair this browser — receive credentials from an already-signed-in device
  const [pairingActive, setPairingActive] = useState(false);
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [pairStatus, setPairStatus] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [pairMessage, setPairMessage] = useState<string | null>(null);

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
      if (code.length < 4) throw new Error('Enter the code shown on your device');
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
      setPairTvMessage('✓ Sent! Device is now connected.');
      setTvPairCode('');
    } catch (e: any) {
      setPairTvStatus('fail');
      setPairTvMessage(e?.message || 'Failed to send pairing');
    } finally {
      setTimeout(() => setPairTvStatus('idle'), 6000);
    }
  };

  useEffect(() => {
    if (!pairingActive) return;
    let cancelled = false;
    let code: string | null = null;
    const deadline = Date.now() + 10 * 60 * 1000;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const applyCredentials = (instanceUrl: string, token: string) => {
      invidious.setInstanceUrl(instanceUrl);
      invidious.setToken(token || null);
      setInvidiousUrl(instanceUrl);
      setInvidiousToken(token);
    };

    (async () => {
      while (!cancelled && Date.now() < deadline) {
        try {
          if (!code) {
            const res = await fetch('/api/tv-pair', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'create' }),
            });
            const d = await res.json().catch(() => ({}));
            if (d.code) {
              code = d.code;
              if (!cancelled) setPairCode(d.code);
            }
          } else {
            const res = await fetch(`/api/tv-pair?code=${encodeURIComponent(code)}`);
            const d = await res.json().catch(() => ({}));
            if (d.status === 'linked' && !cancelled) {
              applyCredentials(d.instanceUrl || '', d.token || '');
              setPairStatus('ok');
              setPairMessage('✓ Paired! This browser is now signed in.');
              setTimeout(() => window.location.reload(), 2500);
              return;
            }
            if (d.status === 'expired' || d.status === 'consumed') code = null;
          }
        } catch {}
        await sleep(3000);
      }
      if (!cancelled) {
        setPairStatus('fail');
        setPairMessage('Pairing timed out — click “Show pairing code” to try again.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pairingActive]);

  const stopPairing = () => {
    setPairingActive(false);
    setPairCode(null);
    setPairStatus('idle');
    setPairMessage(null);
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

  const TABS = [
    { id: 'playback' as const, label: 'Playback & performance', icon: <IoPlayCircleOutline size={20} /> },
    { id: 'appearance' as const, label: 'Appearance & theme', icon: <IoColorPaletteOutline size={20} /> },
    { id: 'account' as const, label: 'Account & sync', icon: <IoPersonCircleOutline size={20} /> },
    { id: 'devices' as const, label: 'Connected devices', icon: <IoTvOutline size={20} /> },
    { id: 'instance' as const, label: 'Backend & diagnostics', icon: <IoServerOutline size={20} /> },
  ];

  return (
    <div className="yt-settings-page-wrapper">
      {/* 1. Left Sub-Navigation */}
      <aside className="yt-settings-subnav">
        <div className="yt-settings-subnav-title">Settings</div>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`yt-settings-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </aside>

      {/* 2. Right Content Pane */}
      <main className="yt-settings-main-pane">
        {/* TAB 1: PLAYBACK AND PERFORMANCE */}
        {activeTab === 'playback' && (
          <div>
            <div className="yt-settings-pane-header">
              <h1 className="yt-settings-pane-title">Playback and performance</h1>
              <p className="yt-settings-pane-desc">Control your video playback quality and community streaming extensions</p>
            </div>

            {/* Video Quality Preference */}
            <div className="yt-settings-section-card">
              <h2 className="yt-settings-section-heading">Video quality</h2>
              <p className="yt-settings-section-subtext">Choose your default video streaming resolution</p>

              <div className="yt-settings-item-row">
                <div className="yt-settings-item-info">
                  <div className="yt-settings-item-label">Default streaming quality</div>
                  <div className="yt-settings-item-desc">Sets default resolution when starting new videos</div>
                </div>
                <select
                  value={defaultQuality}
                  onChange={(e) => handleQualityChange(e.target.value)}
                  className="yt-select-dropdown"
                >
                  <option value="auto">Auto (Adaptive)</option>
                  <option value="1080p">1080p Full HD</option>
                  <option value="720p">720p HD</option>
                  <option value="480p">480p SD</option>
                  <option value="360p">360p</option>
                  <option value="audio_only">Audio Only</option>
                </select>
              </div>
            </div>

            {/* Community Extensions */}
            <div className="yt-settings-section-card">
              <h2 className="yt-settings-section-heading">Community extensions</h2>
              <p className="yt-settings-section-subtext">Built-in open source enhancements</p>

              {/* SponsorBlock */}
              <div className="yt-settings-item-row">
                <div className="yt-settings-item-info">
                  <div className="yt-settings-item-label">SponsorBlock auto-skip</div>
                  <div className="yt-settings-item-desc">Automatically skip sponsored segments, intros, and reminders</div>
                </div>
                <ToggleSwitch
                  checked={sponsorblockEnabled}
                  onChange={handleToggleSponsorblock}
                  id="sponsorblock-toggle"
                />
              </div>

              {/* Return YouTube Dislike */}
              <div className="yt-settings-item-row">
                <div className="yt-settings-item-info">
                  <div className="yt-settings-item-label">Return YouTube Dislike (RYD)</div>
                  <div className="yt-settings-item-desc">Display accurate like and dislike counts and ratio bar on videos</div>
                </div>
                <ToggleSwitch
                  checked={rydEnabled}
                  onChange={handleToggleRyd}
                  id="ryd-toggle"
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: APPEARANCE & THEME */}
        {activeTab === 'appearance' && (
          <div>
            <div className="yt-settings-pane-header">
              <h1 className="yt-settings-pane-title">Appearance & theme</h1>
              <p className="yt-settings-pane-desc">Customize interface color scheme, true black AMOLED, and tonal palettes</p>
            </div>

            {/* Theme Mode */}
            <div className="yt-settings-section-card">
              <h2 className="yt-settings-section-heading">Theme mode</h2>
              <p className="yt-settings-section-subtext">Choose your visual appearance preference</p>

              <div className="yt-settings-item-row">
                <div className="yt-settings-item-info">
                  <div className="yt-settings-item-label">Display theme</div>
                  <div className="yt-settings-item-desc">Switch between light, standard YouTube dark, and deep AMOLED black</div>
                </div>
                <div className="yt-segmented-control">
                  <button
                    type="button"
                    onClick={() => setThemeMode('dark')}
                    className={`yt-segmented-btn ${themeMode === 'dark' ? 'active' : ''}`}
                  >
                    <IoMoonOutline size={16} />
                    <span>Dark</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setThemeMode('amoled')}
                    className={`yt-segmented-btn ${themeMode === 'amoled' ? 'active' : ''}`}
                  >
                    <IoFlashOutline size={16} />
                    <span>AMOLED</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setThemeMode('light')}
                    className={`yt-segmented-btn ${themeMode === 'light' ? 'active' : ''}`}
                  >
                    <IoSunnyOutline size={16} />
                    <span>Light</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Accent Color Palette */}
            <div className="yt-settings-section-card">
              <h2 className="yt-settings-section-heading">Accent color palette</h2>
              <p className="yt-settings-section-subtext">Material You dynamic accent tones applied across buttons and sliders</p>

              <div className="yt-settings-item-row" style={{ alignItems: 'flex-start' }}>
                <div className="yt-settings-item-info">
                  <div className="yt-settings-item-label">Tonal palette</div>
                  <div className="yt-settings-item-desc">Selected preset: <strong style={{ color: 'var(--yt-text-primary)' }}>{currentPreset.toUpperCase()}</strong></div>
                </div>
                <div className="yt-swatches-row">
                  {THEME_PRESETS.map((p) => {
                    const isSelected = currentPreset === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPreset(p.id)}
                        className={`yt-swatch-btn ${isSelected ? 'active' : ''}`}
                        style={{ backgroundColor: p.seedColor }}
                        title={p.name}
                      >
                        {isSelected && <IoCheckmarkCircle size={18} style={{ color: '#ffffff' }} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: ACCOUNT & SYNC */}
        {activeTab === 'account' && (
          <div>
            <div className="yt-settings-pane-header">
              <h1 className="yt-settings-pane-title">Account & sync</h1>
              <p className="yt-settings-pane-desc">Manage your Invidious account session token to sync subscriptions, history, and playlists</p>
            </div>

            <div className="yt-settings-section-card">
              <h2 className="yt-settings-section-heading">Session credentials</h2>
              <p className="yt-settings-section-subtext">Connect your existing Invidious account without entering Google passwords</p>

              <div style={{ marginTop: '16px' }}>
                <label className="yt-settings-item-label" style={{ display: 'block', marginBottom: '8px' }}>
                  Invidious session / auth token
                </label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    type="password"
                    value={invidiousToken}
                    onChange={(e) => setInvidiousToken(e.target.value)}
                    placeholder="e.g. v1:DyRHmmLjL30lxhEV..."
                    className="yt-input-field"
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={handleSaveToken}
                    disabled={tokenStatus === 'testing'}
                    className="yt-btn-pill-primary"
                  >
                    {tokenStatus === 'testing' ? 'Verifying...' : 'Save & Verify'}
                  </button>
                </div>

                {tokenMessage && (
                  <div
                    style={{
                      marginTop: '10px',
                      fontSize: '13px',
                      color: tokenStatus === 'ok' ? '#00c853' : '#ff334b',
                      fontWeight: 500,
                    }}
                  >
                    {tokenMessage}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: CONNECTED DEVICES */}
        {activeTab === 'devices' && (
          <div>
            <div className="yt-settings-pane-header">
              <h1 className="yt-settings-pane-title">Connected devices</h1>
              <p className="yt-settings-pane-desc">Sync credentials with your TV app, phone, or another browser without typing tokens</p>
            </div>

            {/* Send to device */}
            <div className="yt-settings-section-card">
              <h2 className="yt-settings-section-heading">Send sign-in to a device</h2>
              <p className="yt-settings-section-subtext">Open KV-Tube on your TV or phone (Settings → “Pair this device”), then enter the 6-character code below:</p>

              <div style={{ display: 'flex', gap: '10px', marginTop: '16px', maxWidth: '420px' }}>
                <input
                  type="text"
                  maxLength={8}
                  value={tvPairCode}
                  onChange={(e) => setTvPairCode(e.target.value.toUpperCase())}
                  placeholder="e.g. K7M2XQ"
                  className="yt-input-field"
                  style={{ flex: 1, letterSpacing: '4px', textTransform: 'uppercase', fontWeight: 600 }}
                />
                <button
                  type="button"
                  onClick={handlePairTv}
                  disabled={pairTvStatus === 'sending'}
                  className="yt-btn-pill-primary"
                >
                  {pairTvStatus === 'sending' ? 'Linking...' : 'Link Device'}
                </button>
              </div>

              {pairTvMessage && (
                <div
                  style={{
                    marginTop: '10px',
                    fontSize: '13px',
                    color: pairTvStatus === 'ok' ? '#00c853' : '#ff334b',
                    fontWeight: 500,
                  }}
                >
                  {pairTvMessage}
                </div>
              )}
            </div>

            {/* Pair this browser */}
            <div className="yt-settings-section-card">
              <h2 className="yt-settings-section-heading">Pair this browser</h2>
              <p className="yt-settings-section-subtext">Receive credentials from an already signed-in device to sign into this browser automatically.</p>

              <div style={{ marginTop: '16px' }}>
                {!pairingActive ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPairingActive(true);
                      setPairStatus('idle');
                      setPairMessage(null);
                    }}
                    className="yt-btn-pill-secondary"
                  >
                    Show pairing code
                  </button>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div className="yt-pairing-display-box">
                        {pairCode || '......'}
                      </div>
                      <button
                        type="button"
                        onClick={stopPairing}
                        className="yt-btn-pill-secondary"
                      >
                        Cancel
                      </button>
                    </div>

                    <div style={{ fontSize: '13px', color: 'var(--yt-text-secondary)' }}>
                      Enter this code into any signed-in KV-Tube app under <strong>Settings → Send sign-in to a device</strong>.
                    </div>

                    {pairMessage && (
                      <div
                        style={{
                          fontSize: '13px',
                          color: pairStatus === 'ok' ? '#00c853' : '#ff334b',
                          fontWeight: 500,
                        }}
                      >
                        {pairMessage}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: BACKEND & DIAGNOSTICS */}
        {activeTab === 'instance' && (
          <div>
            <div className="yt-settings-pane-header">
              <h1 className="yt-settings-pane-title">Backend & diagnostics</h1>
              <p className="yt-settings-pane-desc">Invidious instance endpoints, yt-dlp binary status, and network connectivity tests</p>
            </div>

            {/* Invidious Instance */}
            <div className="yt-settings-section-card">
              <h2 className="yt-settings-section-heading">Invidious instance URL</h2>
              <p className="yt-settings-section-subtext">API server providing search, channel feeds, and video metadata</p>

              <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                <input
                  type="url"
                  value={invidiousUrl}
                  onChange={(e) => setInvidiousUrl(e.target.value)}
                  placeholder="https://yt.khoavo.myds.me"
                  className="yt-input-field"
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  onClick={handleSaveInstance}
                  disabled={instanceStatus === 'testing'}
                  className="yt-btn-pill-primary"
                >
                  {instanceStatus === 'testing' ? 'Testing...' : 'Test & Save'}
                </button>
              </div>

              {instanceMessage && (
                <div
                  style={{
                    marginTop: '10px',
                    fontSize: '13px',
                    color: instanceStatus === 'ok' ? '#00c853' : '#ff334b',
                    fontWeight: 500,
                  }}
                >
                  {instanceMessage}
                </div>
              )}
            </div>

            {/* Backend yt-dlp & Health */}
            {!loadingBackend && (
              <div className="yt-settings-section-card">
                <h2 className="yt-settings-section-heading">yt-dlp stream engine</h2>
                <p className="yt-settings-section-subtext">Extraction backend powering YouTube video stream decryptor</p>

                <div className="yt-settings-item-row">
                  <div className="yt-settings-item-info">
                    <div className="yt-settings-item-label">Installed version</div>
                    <div className="yt-settings-item-desc">{status?.ytdlp.version || 'Bundled version'}</div>
                  </div>
                  <button
                    type="button"
                    onClick={handleUpdateYtDlp}
                    disabled={updating}
                    className="yt-btn-pill-secondary"
                  >
                    <IoRefreshOutline size={16} />
                    <span>{updating ? 'Updating...' : 'Update yt-dlp'}</span>
                  </button>
                </div>

                {updateResult && (
                  <div style={{ marginTop: '10px', fontSize: '13px', color: updateResult.error ? '#ff334b' : '#00c853' }}>
                    {updateResult.error || `Updated successfully: ${updateResult.before} → ${updateResult.after}`}
                  </div>
                )}

                {/* Cookies Configuration */}
                <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--yt-border)' }}>
                  <div className="yt-settings-item-label">YouTube cookies</div>
                  <div className="yt-settings-item-desc" style={{ marginBottom: '14px' }}>
                    Status: <strong>{cookieLabel(status?.cookies)}</strong>
                  </div>

                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <label className="yt-btn-pill-secondary" style={{ cursor: 'pointer' }}>
                      <IoCloudUploadOutline size={16} />
                      <span>{uploading ? 'Uploading...' : 'Upload cookies.txt'}</span>
                      <input
                        type="file"
                        accept=".txt"
                        onChange={handleCookiesUpload}
                        disabled={uploading}
                        style={{ display: 'none' }}
                      />
                    </label>

                    {status?.cookies?.configured && (
                      <button
                        type="button"
                        onClick={handleCookiesDelete}
                        className="yt-btn-pill-secondary"
                        style={{ color: '#ff334b' }}
                      >
                        <IoTrashOutline size={16} />
                        <span>Delete cookies</span>
                      </button>
                    )}
                  </div>

                  {fileError && (
                    <div style={{ marginTop: '8px', fontSize: '13px', color: '#ff334b' }}>
                      {fileError}
                    </div>
                  )}
                </div>

                {/* Network Diagnostics */}
                <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--yt-border)' }}>
                  <div className="yt-settings-item-label">Network diagnostics</div>
                  <div className="yt-settings-item-desc" style={{ marginBottom: '14px' }}>
                    Test IPv4/IPv6 reachability and video extraction against YouTube servers
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={handleDiagnose}
                      disabled={diagLoading}
                      className="yt-btn-pill-secondary"
                    >
                      {diagLoading ? 'Testing...' : 'Run Quick Diagnostic'}
                    </button>
                    <button
                      type="button"
                      onClick={handleExtractionTest}
                      disabled={diagLoading}
                      className="yt-btn-pill-secondary"
                    >
                      Extraction Test
                    </button>
                  </div>

                  {diag && (
                    <div
                      style={{
                        marginTop: '16px',
                        padding: '12px 16px',
                        borderRadius: '8px',
                        backgroundColor: 'var(--yt-hover)',
                        fontSize: '13px',
                        fontFamily: 'monospace',
                        color: 'var(--yt-text-primary)',
                      }}
                    >
                      <div>IPv4 Ping: {diag.youtube_v4}</div>
                      <div>IPv6 Ping: {diag.youtube_v6}</div>
                      <div>IPv6 Routable: {diag.ipv6_routable ? 'YES' : 'NO'}</div>
                      {diag.extraction_test && (
                        <div>
                          Stream Test: {diag.extraction_test.ok ? '✓ OK' : `✗ Failed (${diag.extraction_test.error})`}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

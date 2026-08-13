'use client';

import { useState, useEffect, useCallback } from 'react';

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
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);
    const [updateResult, setUpdateResult] = useState<{ before?: string; after?: string; error?: string } | null>(null);
    const [uploading, setUploading] = useState(false);
    const [fileError, setFileError] = useState<string | null>(null);
    const [fetching, setFetching] = useState(false);
    const [browser, setBrowser] = useState('chrome');
    const [diag, setDiag] = useState<NetworkDiag | null>(null);
    const [diagLoading, setDiagLoading] = useState(false);

    const fetchBrowsers = ['chrome', 'chromium', 'firefox', 'edge', 'brave', 'opera', 'vivaldi', 'whale'];

    const fetchStatus = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/settings/status`);
            if (res.ok) {
                setStatus(await res.json());
            }
        } catch (_) {
        } finally {
            setLoading(false);
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
            const data = await res.json();
            if (res.ok) {
                setUpdateResult({ before: data.before, after: data.after });
            } else {
                setUpdateResult({ before: data.before, after: data.after, error: data.error || 'Update failed' });
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
            const data = await res.json();
            if (!res.ok) {
                setFileError(data.error || 'Upload failed');
            }
            await fetchStatus();
        } catch (err: any) {
            setFileError(err?.message || 'Upload failed');
        } finally {
            setUploading(false);
            e.target.value = '';
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
            const data = await res.json();
            if (!res.ok) {
                setFileError(data.error || 'Fetch failed');
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
                setDiag(await res.json());
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
            // Runs the full yt-dlp retry chain (may take 20-60s)
            const res = await fetch(`${API_BASE}/settings/diagnose?test=1`, { signal: AbortSignal.timeout(90000) });
            if (res.ok) {
                setDiag(await res.json());
            }
        } catch (err: any) {
            setDiag({ family: 'ipv4', ipv6_routable: false, youtube_v4: 'ERR', youtube_v6: 'ERR', ytdlp_version: '' });
        } finally {
            setDiagLoading(false);
        }
    }

    const cookieLabel = (s: CookiesStatus): string => {
        switch (s.source) {
            case 'env': return 'From environment (YTDLP_COOKIES)';
            case 'browser': return 'From browser (YTDLP_COOKIES_FROM_BROWSER)';
            case 'persisted': return 'Uploaded file';
            case 'anonymous': return 'Anonymous session (auto-refreshed)';
            default: return 'Not configured';
        }
    };

    return (
        <div style={{ maxWidth: '640px', margin: '0 auto', padding: '24px 16px', width: '100%' }}>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--yt-text-primary)', marginBottom: '20px' }}>
                Settings
            </h1>

            {loading ? (
                <p style={{ color: 'var(--yt-text-secondary)' }}>Loading...</p>
            ) : (
                <>
                    {/* yt-dlp section */}
                    <section style={{
                        background: 'var(--yt-surface-1, #1a1a1a)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '12px',
                        padding: '16px',
                        marginBottom: '16px',
                    }}>
                        <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--yt-text-primary)', margin: '0 0 12px' }}>
                            yt-dlp (Nightly)
                        </h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                            <div style={{ fontSize: '13px', color: 'var(--yt-text-primary)' }}>
                                Version: <span style={{ fontWeight: 600 }}>{status?.ytdlp.version || 'unknown'}</span>
                            </div>
                            <div style={{ fontSize: '13px', color: 'var(--yt-text-secondary)' }}>
                                Auto-update: {status?.ytdlp.auto_update ? 'Enabled (every 24h)' : 'Disabled'}
                            </div>
                            {status?.ytdlp.last_check_at && (
                                <div style={{ fontSize: '12px', color: 'var(--yt-text-secondary)' }}>
                                    Last updated: {new Date(status.ytdlp.last_check_at).toLocaleString()}
                                </div>
                            )}
                        </div>
                        <button
                            onClick={handleUpdateYtDlp}
                            disabled={updating}
                            style={{
                                padding: '9px 16px',
                                borderRadius: '8px',
                                border: 'none',
                                background: '#3b82f6',
                                color: '#fff',
                                cursor: updating ? 'wait' : 'pointer',
                                fontSize: '13px',
                                fontWeight: 600,
                                opacity: updating ? 0.7 : 1,
                            }}
                        >
                            {updating ? 'Checking for update...' : 'Check & Update now'}
                        </button>
                        {updateResult && (
                            <div style={{ marginTop: '10px', fontSize: '13px' }}>
                                {updateResult.error ? (
                                    <div style={{ color: '#ef4444' }}>
                                        Update failed: {updateResult.error}
                                        {updateResult.before && ` (current: ${updateResult.before})`}
                                    </div>
                                ) : (
                                    <div style={{ color: '#22c55e' }}>
                                        {updateResult.before === updateResult.after
                                            ? `Already up to date (${updateResult.after})`
                                            : `Updated ${updateResult.before || 'unknown'} -> ${updateResult.after}`}
                                    </div>
                                )}
                            </div>
                        )}
                    </section>

                    {/* Network section */}
                    <section style={{
                        background: 'var(--yt-surface-1, #1a1a1a)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '12px',
                        padding: '16px',
                        marginTop: '16px',
                    }}>
                        <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--yt-text-primary)', margin: '0 0 12px' }}>
                            Network
                        </h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
                            <div style={{ color: 'var(--yt-text-primary)' }}>
                                IPv6: <span style={{
                                    color: status?.ipv6?.available ? '#22c55e' : '#eab308',
                                    fontWeight: 600,
                                }}>
                                    {status?.ipv6?.probed
                                        ? (status?.ipv6?.available ? 'Routable — yt-dlp prefers IPv6' : 'Not routable — using IPv4')
                                        : 'Checking...'}
                                </span>
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--yt-text-secondary)' }}>
                                Policy: {status?.ipv6?.force === 'ipv6' ? 'forced IPv6 (FORCE_IPV6=1)' :
                                    status?.ipv6?.force === 'ipv4' ? 'forced IPv4 (FORCE_IPV6=0)' :
                                    'auto (probe at startup)'}
                            </div>
                            {status?.ipv6?.targets && Object.keys(status.ipv6.targets).length > 0 && (
                                <div style={{ fontSize: '11px', color: 'var(--yt-text-secondary)' }}>
                                    Probe results:
                                    {Object.entries(status.ipv6.targets).map(([t, r]) => (
                                        <div key={t} style={{ marginLeft: '12px' }}>
                                            {t}: <span style={{ color: r === 'ok' ? '#22c55e' : '#ef4444' }}>{r === 'ok' ? 'reachable' : r}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div style={{ fontSize: '12px', color: 'var(--yt-text-secondary)', lineHeight: 1.5 }}>
                                YouTube often blocks residential IPv4 routes but allows the same traffic over IPv6.
                                On network-level failures the server automatically flips to the other IP family and retries.
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px', flexWrap: 'wrap' }}>
                                <button
                                    onClick={handleDiagnose}
                                    disabled={diagLoading}
                                    style={{
                                        padding: '8px 14px',
                                        borderRadius: '8px',
                                        border: '1px solid rgba(255,255,255,0.2)',
                                        background: 'transparent',
                                        color: 'var(--yt-text-primary)',
                                        cursor: diagLoading ? 'wait' : 'pointer',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                    }}
                                >
                                    {diagLoading ? 'Running...' : 'Run diagnostics'}
                                </button>
                                <button
                                    onClick={handleExtractionTest}
                                    disabled={diagLoading}
                                    title="Runs a real yt-dlp extraction (same chain playback uses). May take 20-60s."
                                    style={{
                                        padding: '8px 14px',
                                        borderRadius: '8px',
                                        border: '1px solid rgba(59,130,246,0.5)',
                                        background: 'rgba(59,130,246,0.15)',
                                        color: 'var(--yt-text-primary)',
                                        cursor: diagLoading ? 'wait' : 'pointer',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                    }}
                                >
                                    {diagLoading ? 'Testing...' : 'Test extraction'}
                                </button>
                                {diag && (
                                    <div style={{ fontSize: '11px', color: 'var(--yt-text-secondary)', fontFamily: 'monospace', lineHeight: 1.6, maxWidth: '100%', overflowWrap: 'anywhere' }}>
                                        <div>
                                            family: {diag.family} · YouTube v4: {diag.youtube_v4} · YouTube v6: {diag.youtube_v6} · yt-dlp: {diag.ytdlp_version || 'unknown'}{diag.impersonate ? ' · impersonate: on' : ''}
                                        </div>
                                        {diag.extraction_test && (
                                            <div style={{ color: diag.extraction_test.ok ? '#22c55e' : '#ef4444', marginTop: '4px' }}>
                                                {diag.extraction_test.ok
                                                    ? `Extraction OK: "${diag.extraction_test.title}" — ${diag.extraction_test.format_count} formats`
                                                    : `Extraction FAILED: ${diag.extraction_test.error || 'unknown error'}`}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                    {/* Cookies section */}
                    <section style={{
                        background: 'var(--yt-surface-1, #1a1a1a)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '12px',
                        padding: '16px',
                    }}>
                        <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--yt-text-primary)', margin: '0 0 12px' }}>
                            YouTube Cookies
                        </h2>
                        <p style={{ fontSize: '12px', color: 'var(--yt-text-secondary)', margin: '0 0 12px', lineHeight: 1.5 }}>
                            Upload a Netscape-format cookies.txt exported from your browser to bypass YouTube&apos;s
                            &quot;Sign in to confirm you&apos;re not a bot&quot; block (required for downloads and comments).
                            <br />
                            Or use <b>Fetch from browser</b> below to export cookies automatically from a browser
                            installed on the same machine as the server.
                        </p>

                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '14px' }}>
                            <select
                                value={browser}
                                onChange={(e) => setBrowser(e.target.value)}
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    background: 'var(--yt-surface-1, #1a1a1a)',
                                    color: 'var(--yt-text-primary)',
                                    fontSize: '13px',
                                    cursor: 'pointer',
                                }}
                            >
                                {fetchBrowsers.map((b) => (
                                    <option key={b} value={b}>{b}</option>
                                ))}
                            </select>
                            <button
                                onClick={handleCookiesFetch}
                                disabled={fetching}
                                style={{
                                    padding: '9px 16px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: '#22c55e',
                                    color: '#fff',
                                    cursor: fetching ? 'wait' : 'pointer',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    opacity: fetching ? 0.7 : 1,
                                }}
                            >
                                {fetching ? 'Exporting...' : 'Fetch from browser'}
                            </button>
                        </div>

                        <div style={{ fontSize: '13px', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ color: 'var(--yt-text-primary)' }}>
                                Status: <span style={{
                                    color: status?.cookies.configured ? '#22c55e' : (status?.cookies.exists ? '#eab308' : '#ef4444'),
                                    fontWeight: 600,
                                }}>
                                    {cookieLabel(status!.cookies)}
                                </span>
                            </div>
                            {status?.cookies.path && (
                                <div style={{ fontSize: '12px', color: 'var(--yt-text-secondary)', wordBreak: 'break-all' }}>
                                    Path: {status.cookies.path}
                                </div>
                            )}
                            {status?.cookies.exists && (
                                <div style={{ fontSize: '12px', color: 'var(--yt-text-secondary)' }}>
                                    Entries: {status.cookies.entries ?? 0} {status.cookies.valid ? '· Valid Netscape format' : '· INVALID format'}
                                </div>
                            )}
                            {status?.cookies.blacklisted && (
                                <div style={{ fontSize: '12px', color: '#eab308' }}>
                                    Uploaded cookies were rejected by YouTube — re-export a fresh file from your browser.
                                    The server is currently using an anonymous session.
                                </div>
                            )}
                        </div>

                        {fileError && (
                            <div style={{ fontSize: '13px', color: '#ef4444', marginBottom: '10px' }}>{fileError}</div>
                        )}

                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            <label style={{
                                padding: '9px 16px',
                                borderRadius: '8px',
                                border: '1px solid rgba(255,255,255,0.2)',
                                background: 'transparent',
                                color: 'var(--yt-text-primary)',
                                cursor: uploading ? 'wait' : 'pointer',
                                fontSize: '13px',
                                fontWeight: 600,
                            }}>
                                {uploading ? 'Uploading...' : 'Upload cookies.txt'}
                                <input type="file" accept=".txt" onChange={handleCookiesUpload} style={{ display: 'none' }} />
                            </label>
                            {status?.cookies.source === 'persisted' && (
                                <button
                                    onClick={handleCookiesDelete}
                                    style={{
                                        padding: '9px 16px',
                                        borderRadius: '8px',
                                        border: '1px solid rgba(239,68,68,0.5)',
                                        background: 'transparent',
                                        color: '#ef4444',
                                        cursor: 'pointer',
                                        fontSize: '13px',
                                        fontWeight: 600,
                                    }}
                                >
                                    Remove cookies
                                </button>
                            )}
                        </div>
                    </section>
                </>
            )}
        </div>
    );
}

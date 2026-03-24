'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { PiShareFat } from 'react-icons/pi';
import { TfiDownload } from 'react-icons/tfi';

interface VideoFormat {
    format_id: string;
    format_note: string;
    ext: string;
    resolution: string;
    filesize: number;
    type: string;
    has_audio?: boolean;
    url?: string;
}

declare global {
    interface Window {
        FFmpeg: any;
        FFmpegWASM: any;
    }
}

function getQualityLabel(resolution: string): string {
    const height = parseInt(resolution) || 0;
    if (height >= 3840) return '4K UHD';
    if (height >= 2560) return '2K QHD';
    if (height >= 1920) return 'Full HD 1080p';
    if (height >= 1280) return 'HD 720p';
    if (height >= 854) return 'SD 480p';
    if (height >= 640) return 'SD 360p';
    if (height >= 426) return 'SD 240p';
    if (height >= 256) return 'SD 144p';
    return resolution || 'Unknown';
}

function getQualityBadge(height: number): { label: string; color: string } | null {
    if (height >= 3840) return { label: '4K', color: '#ff0000' };
    if (height >= 2560) return { label: '2K', color: '#ff6b00' };
    if (height >= 1920) return { label: 'HD', color: '#00a0ff' };
    if (height >= 1280) return { label: 'HD', color: '#00a0ff' };
    return null;
}

export default function WatchActions({ videoId }: { videoId: string }) {
    const [isDownloading, setIsDownloading] = useState(false);
    const [showFormats, setShowFormats] = useState(false);
    const [formats, setFormats] = useState<VideoFormat[]>([]);
    const [audioFormats, setAudioFormats] = useState<VideoFormat[]>([]);
    const [isLoadingFormats, setIsLoadingFormats] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState<string>('');
    const [progressPercent, setProgressPercent] = useState(0);
    const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
    const [ffmpegLoading, setFfmpegLoading] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const ffmpegRef = useRef<any>(null);

    const loadFFmpeg = useCallback(async () => {
        if (ffmpegLoaded || ffmpegLoading) return;
        
        setFfmpegLoading(true);
        setDownloadProgress('Loading video processor...');
        
        try {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.7/dist/umd/ffmpeg.js';
            script.async = true;
            document.head.appendChild(script);

            const coreScript = document.createElement('script');
            coreScript.src = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js';
            coreScript.async = true;
            document.head.appendChild(coreScript);

            await new Promise<void>((resolve) => {
                const checkLoaded = () => {
                    if (window.FFmpeg && window.FFmpeg.FFmpeg) {
                        resolve();
                    } else {
                        setTimeout(checkLoaded, 100);
                    }
                };
                checkLoaded();
            });

            const { FFmpeg } = window.FFmpeg;
            const ffmpeg = new FFmpeg();
            
            await ffmpeg.load({
                coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',
                wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm',
            });
            
            ffmpegRef.current = ffmpeg;
            setFfmpegLoaded(true);
        } catch (e) {
            console.error('Failed to load FFmpeg:', e);
        } finally {
            setFfmpegLoading(false);
        }
    }, [ffmpegLoaded, ffmpegLoading]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setShowFormats(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleShare = () => {
        if (typeof window !== 'undefined') {
            const url = window.location.href;
            navigator.clipboard.writeText(url).then(() => {
                alert('Link copied to clipboard!');
            }).catch(() => {
                alert('Failed to copy link');
            });
        }
    };

    const fetchFormats = async () => {
        if (showFormats) {
            setShowFormats(false);
            return;
        }

        setShowFormats(true);
        if (formats.length > 0) return;

        setIsLoadingFormats(true);
        try {
            const res = await fetch(`/api/formats?v=${encodeURIComponent(videoId)}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            
            if (Array.isArray(data)) {
                const videoFormats = data.filter((f: VideoFormat) => 
                    (f.type === 'video' || f.type === 'both') && 
                    !f.format_note?.toLowerCase().includes('storyboard') &&
                    f.ext === 'mp4'
                ).sort((a: VideoFormat, b: VideoFormat) => {
                    const resA = parseInt(a.resolution) || 0;
                    const resB = parseInt(b.resolution) || 0;
                    return resB - resA;
                });

                const audioOnly = data.filter((f: VideoFormat) => 
                    f.type === 'audio' || (f.resolution === 'audio only')
                ).sort((a: VideoFormat, b: VideoFormat) => (b.filesize || 0) - (a.filesize || 0));

                setFormats(videoFormats.length > 0 ? videoFormats : data.filter((f: VideoFormat) => f.ext === 'mp4').slice(0, 10));
                setAudioFormats(audioOnly);
            }
        } catch (e) {
            console.error('Failed to fetch formats:', e);
        } finally {
            setIsLoadingFormats(false);
        }
    };

    const fetchFile = async (url: string, label: string): Promise<Uint8Array> => {
        setDownloadProgress(`Downloading ${label}...`);
        
        const tryDirect = async (): Promise<Response | null> => {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);
                const response = await fetch(url, { signal: controller.signal, mode: 'cors' });
                clearTimeout(timeoutId);
                return response.ok ? response : null;
            } catch {
                return null;
            }
        };

        const tryProxy = async (): Promise<Response> => {
            return fetch(`/api/proxy-file?url=${encodeURIComponent(url)}`);
        };

        let response = await tryDirect();
        if (!response) {
            setDownloadProgress(`Connecting via proxy...`);
            response = await tryProxy();
        }
        
        if (!response.ok) throw new Error(`Failed to fetch ${label}`);
        
        const contentLength = response.headers.get('content-length');
        const total = contentLength ? parseInt(contentLength, 10) : 0;
        let loaded = 0;

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No reader available');

        const chunks: Uint8Array[] = [];
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            loaded += value.length;
            if (total > 0) {
                const percent = Math.round((loaded / total) * 100);
                setProgressPercent(percent);
                setDownloadProgress(`${label}: ${percent}%`);
            }
        }

        const result = new Uint8Array(loaded);
        let offset = 0;
        for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
        }
        return result;
    };

    const downloadBlob = (blob: Blob, filename: string) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleDownload = async (format?: VideoFormat) => {
        setIsDownloading(true);
        setShowFormats(false);
        setProgressPercent(0);
        setDownloadProgress('Preparing download...');

        try {
            // Simple approach: use the backend's download-file endpoint
            const downloadUrl = `/api/download-file?v=${encodeURIComponent(videoId)}${format ? `&f=${encodeURIComponent(format.format_id)}` : ''}`;
            
            // Create a temporary anchor tag to trigger download
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = ''; // Let the server set filename via Content-Disposition
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            setDownloadProgress('Download started!');
            setProgressPercent(100);
            
            // Reset after a short delay
            setTimeout(() => {
                setIsDownloading(false);
                setDownloadProgress('');
                setProgressPercent(0);
            }, 2000);
        } catch (e: any) {
            console.error(e);
            alert(e.message || 'Download failed. Please try again.');
            setIsDownloading(false);
            setDownloadProgress('');
            setProgressPercent(0);
        }
    };

    const formatFileSize = (bytes: number): string => {
        if (!bytes || bytes <= 0) return '';
        if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
        if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        return `${(bytes / 1024).toFixed(0)} KB`;
    };

    return (
        <div style={{ display: 'flex', gap: '8px', position: 'relative', alignItems: 'center', flexShrink: 0 }}>
            <button
                type="button"
                onClick={handleShare}
                className="action-btn-hover"
                style={{ display: 'flex', alignItems: 'center', backgroundColor: 'var(--yt-hover)', border: 'none', borderRadius: '18px', padding: '0 16px', height: '36px', color: 'var(--yt-text-primary)', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}
            >
                <PiShareFat size={20} style={{ marginRight: '6px' }} />
                Share
            </button>
            
            <div ref={menuRef} style={{ position: 'relative' }}>
                {showFormats && (
                    <div 
                        className="download-backdrop"
                        style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundColor: 'rgba(0,0,0,0.5)',
                            zIndex: 9999
                        }}
                        onClick={() => setShowFormats(false)}
                    />
                )}
                <button
                    type="button"
                    onClick={fetchFormats}
                    disabled={isDownloading}
                    className="action-btn-hover"
                    style={{ display: 'flex', alignItems: 'center', backgroundColor: 'var(--yt-hover)', border: 'none', borderRadius: '18px', padding: '0 16px', height: '36px', color: 'var(--yt-text-primary)', fontSize: '14px', fontWeight: '500', cursor: isDownloading ? 'wait' : 'pointer', opacity: isDownloading ? 0.7 : 1, minWidth: '120px' }}
                >
                    <TfiDownload size={18} style={{ marginRight: '6px' }} />
                    {isDownloading ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {progressPercent > 0 ? `${progressPercent}%` : ''}
                            <span style={{ width: '12px', height: '12px', border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
                        </span>
                    ) : 'Download'}
                </button>

                {showFormats && (
                    <div 
                        className="download-dropdown"
                        style={{
                        position: 'fixed',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        backgroundColor: 'var(--yt-background)',
                        borderRadius: '16px',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                        padding: '0',
                        zIndex: 10000,
                        width: 'calc(100% - 32px)',
                        maxWidth: '360px',
                        maxHeight: '70vh',
                        overflowY: 'auto',
                        border: '1px solid var(--yt-border)',
                    }}>
                        <div style={{ 
                            padding: '16px', 
                            fontSize: '16px', 
                            fontWeight: '600', 
                            color: 'var(--yt-text-primary)', 
                            borderBottom: '1px solid var(--yt-border)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <span>Select Quality</span>
                            <button 
                                onClick={() => setShowFormats(false)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--yt-text-secondary)',
                                    fontSize: '20px',
                                    cursor: 'pointer',
                                    padding: '4px 8px'
                                }}
                            >
                                ×
                            </button>
                        </div>
                        
                        {isLoadingFormats ? (
                            <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--yt-text-secondary)', fontSize: '14px' }}>
                                <span style={{ width: '20px', height: '20px', border: '2px solid var(--yt-text-secondary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block', marginRight: '8px' }} />
                                Loading...
                            </div>
                        ) : formats.length === 0 ? (
                            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--yt-text-secondary)', fontSize: '14px' }}>
                                No formats available
                            </div>
                        ) : (
                            formats.map(f => {
                                const height = parseInt(f.resolution) || 0;
                                const badge = getQualityBadge(height);
                                
                                return (
                                    <button
                                        key={f.format_id}
                                        onClick={() => handleDownload(f)}
                                        className="format-item-hover"
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            width: '100%',
                                            padding: '12px 16px',
                                            backgroundColor: 'transparent',
                                            border: 'none',
                                            color: 'var(--yt-text-primary)',
                                            cursor: 'pointer',
                                            fontSize: '14px',
                                            transition: 'background-color 0.15s',
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            {badge && (
                                                <span style={{ 
                                                    fontSize: '10px', 
                                                    fontWeight: '700', 
                                                    color: '#fff',
                                                    background: badge.color,
                                                    padding: '3px 6px',
                                                    borderRadius: '4px',
                                                    letterSpacing: '0.5px'
                                                }}>
                                                    {badge.label}
                                                </span>
                                            )}
                                            <span style={{ fontWeight: '500' }}>{getQualityLabel(f.resolution)}</span>
                                        </div>
                                        <span style={{ fontSize: '12px', color: 'var(--yt-text-secondary)' }}>
                                            {formatFileSize(f.filesize) || 'Unknown size'}
                                        </span>
                                    </button>
                                );
                            })
                        )}
                    </div>
                )}
            </div>
            
            {isDownloading && downloadProgress && (
                <span style={{ fontSize: '12px', color: 'var(--yt-text-secondary)', minWidth: '150px' }}>
                    {downloadProgress}
                </span>
            )}
        </div>
    );
}

/**
 * KV-Tube Download Manager
 * Client-side download handling with progress tracking and library
 */

class DownloadManager {
    constructor() {
        this.activeDownloads = new Map();
        this.library = this.loadLibrary();
        this.onProgressCallback = null;
        this.onCompleteCallback = null;
        // Broadcast initial state
        setTimeout(() => this.notifyStateChange('update', {
            activeCount: this.activeDownloads.size,
            downloads: this.getActiveDownloads(),
            data: null
        }), 100);
    }

    formatTime(seconds) {
        if (!seconds || !isFinite(seconds)) return '--:--';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const hours = Math.floor(mins / 60);

        if (hours > 0) {
            const m = mins % 60;
            return `${hours}:${m.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    notifyStateChange(type, data) {
        const event = new CustomEvent('download-updated', {
            detail: {
                type,
                activeCount: this.activeDownloads.size,
                downloads: this.getActiveDownloads(),
                ...data
            }
        });
        window.dispatchEvent(event);
    }

    // === Library Management ===

    loadLibrary() {
        try {
            return JSON.parse(localStorage.getItem('kv_downloads') || '[]');
        } catch {
            return [];
        }
    }

    saveLibrary() {
        localStorage.setItem('kv_downloads', JSON.stringify(this.library));
    }

    addToLibrary(item) {
        // Remove if exists
        this.library = this.library.filter(d => d.id !== item.id);
        // Add to front
        this.library.unshift({
            ...item,
            downloadedAt: new Date().toISOString()
        });
        // Keep max 50 items
        this.library = this.library.slice(0, 50);
        this.saveLibrary();
    }

    removeFromLibrary(id) {
        this.library = this.library.filter(d => d.id !== id);
        this.saveLibrary();
    }

    clearLibrary() {
        this.library = [];
        this.saveLibrary();
    }

    getLibrary() {
        return [...this.library];
    }

    // === Download Functions ===

    async fetchFormats(videoId) {
        const response = await fetch(`/api/download/formats?v=${videoId}`);
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || 'Failed to fetch formats');
        }
        return data;
    }

    async startDownload(videoId, format, title = null) {
        const downloadId = `${videoId}_${format.quality}_${Date.now()}`;

        try {
            // Get video info for title if not provided
            let infoTitle = title;
            if (!infoTitle) {
                try {
                    const info = await this.fetchFormats(videoId);
                    infoTitle = info.title;
                } catch (e) {
                    console.warn('Could not fetch video info:', e);
                    infoTitle = videoId;
                }
            }

            // Store format specs for display
            const formatSpecs = {
                resolution: format.resolution || null,
                width: format.width || null,
                height: format.height || null,
                fps: format.fps || null,
                vcodec: format.vcodec || null,
                acodec: format.acodec || null,
                bitrate: format.bitrate || null,
                sample_rate: format.sample_rate || null,
                url: format.url // Important for resume
            };

            const downloadItem = {
                id: downloadId,
                videoId: videoId,
                title: infoTitle || 'Unknown Video',
                thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`, // Fallback/Construct thumbnail
                quality: format.quality,
                type: format.type,
                ext: format.ext,
                size: format.size,
                size_bytes: format.size_bytes, // Store bytes
                status: 'downloading',
                progress: 0,
                speed: 0,           // Download speed in bytes/sec
                speedDisplay: '',   // Human readable speed
                eta: '--:--',
                specs: formatSpecs  // Format specifications
            };

            this.activeDownloads.set(downloadId, {
                item: downloadItem,
                controller: new AbortController(),
                chunks: [],      // Store chunks here to persist across pauses
                received: 0,     // Track total bytes received
                total: 0,        // Track total file size
                startTime: performance.now()
            });

            this.notifyStateChange('start', { downloadId, item: downloadItem });

            // Start the actual download process
            this._processDownload(downloadId, format.url);

            return downloadId;

        } catch (error) {
            console.error('Failed to start download:', error);
            this.notifyStateChange('error', { downloadId, error: error.message });
        }
    }

    async _processDownload(downloadId, url) {
        const state = this.activeDownloads.get(downloadId);
        if (!state) return;

        const { item, controller, received } = state;

        try {
            // Route through proxy to avoid CORS and ensure headers are handled
            const proxyUrl = `/video_proxy?url=${encodeURIComponent(url)}`;

            // Add Range header if resuming
            const headers = {};
            if (received > 0) {
                headers['Range'] = `bytes=${received}-`;
            }

            const response = await fetch(proxyUrl, {
                headers: headers,
                signal: controller.signal
            });

            if (!response.ok) {
                throw new Error(`Download failed: ${response.status} ${response.statusText}`);
            }

            // Get content length (of remaining part)
            const contentLength = response.headers.get('content-length');
            const remainingLength = contentLength ? parseInt(contentLength, 10) : 0;

            // If total not set yet (first start), set it
            if (state.total === 0) {
                const contentRange = response.headers.get('content-range');
                if (contentRange) {
                    const match = contentRange.match(/\/(\d+)$/);
                    if (match) state.total = parseInt(match[1], 10);
                } else {
                    state.total = received + remainingLength;
                }

                if (!state.total && item.size_bytes) state.total = item.size_bytes;
            }

            const reader = response.body.getReader();

            // Speed calculation variables
            let lastTime = performance.now();
            let lastBytes = received;
            let speedSamples = [];

            while (true) {
                const { done, value } = await reader.read();

                if (done) break;

                state.chunks.push(value);
                state.received += value.length;

                // Calculate speed & ETA (every 500ms)
                const now = performance.now();
                const timeDiff = now - lastTime;

                if (timeDiff >= 500) {
                    const bytesDiff = state.received - lastBytes;
                    const speed = (bytesDiff / timeDiff) * 1000; // bytes/sec

                    speedSamples.push(speed);
                    if (speedSamples.length > 5) speedSamples.shift();

                    const avgSpeed = speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length;

                    item.speed = avgSpeed;
                    item.speedDisplay = this.formatSpeed(avgSpeed);

                    // Calculate ETA
                    if (avgSpeed > 0 && state.total > 0) {
                        const remainingBytes = state.total - state.received;
                        const etaSeconds = remainingBytes / avgSpeed;
                        item.eta = this.formatTime(etaSeconds);
                    } else {
                        item.eta = '--:--';
                    }

                    lastTime = now;
                    lastBytes = state.received;
                }

                const progress = state.total ? Math.round((state.received / state.total) * 100) : 0;
                item.progress = progress;

                this.notifyStateChange('progress', {
                    downloadId,
                    progress,
                    received: state.received,
                    total: state.total,
                    speed: item.speed,
                    speedDisplay: item.speedDisplay,
                    eta: item.eta
                });
            }

            // Download complete
            const blob = new Blob(state.chunks);
            const filename = this.sanitizeFilename(`${item.title}_${item.quality}.${item.ext}`);
            this.triggerDownload(blob, filename);

            item.status = 'completed';
            item.progress = 100;
            item.eta = 'Done';
            this.notifyStateChange('complete', { downloadId });
            this.addToLibrary(item);
            this.activeDownloads.delete(downloadId);

        } catch (error) {
            if (error.name === 'AbortError') {
                if (item.status === 'paused') {
                    console.log('Download paused:', item.title);
                    this.notifyStateChange('paused', { downloadId });
                } else {
                    console.log('Download cancelled');
                    this.notifyStateChange('cancelled', { downloadId });
                    this.activeDownloads.delete(downloadId);
                }
            } else {
                console.error('Download error:', error);
                item.status = 'error';
                this.notifyStateChange('error', { downloadId, error: error.message });
                this.activeDownloads.delete(downloadId);
            }
        }
    }

    pauseDownload(downloadId) {
        const state = this.activeDownloads.get(downloadId);
        if (state && state.item.status === 'downloading') {
            state.item.status = 'paused';
            state.controller.abort(); // Cancel current fetch
        }
    }

    resumeDownload(downloadId) {
        const state = this.activeDownloads.get(downloadId);
        if (state && state.item.status === 'paused') {
            state.item.status = 'downloading';
            state.controller = new AbortController(); // New controller for new fetch

            const url = state.item.specs.url;
            this._processDownload(downloadId, url);
        }
    }

    cancelDownload(downloadId) {
        const download = this.activeDownloads.get(downloadId);
        if (download) {
            download.controller.abort();
            this.activeDownloads.delete(downloadId);
        }
    }

    triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    sanitizeFilename(name) {
        return name.replace(/[<>:"/\\|?*]/g, '_').slice(0, 200);
    }

    formatSpeed(bytesPerSec) {
        if (bytesPerSec >= 1024 * 1024) {
            return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
        } else if (bytesPerSec >= 1024) {
            return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
        }
        return `${Math.round(bytesPerSec)} B/s`;
    }

    // === Active Downloads ===

    getActiveDownloads() {
        return Array.from(this.activeDownloads.values()).map(d => d.item);
    }

    isDownloading(videoId) {
        for (const [id, download] of this.activeDownloads) {
            if (download.item.videoId === videoId) {
                return true;
            }
        }
        return false;
    }

    // === Bandwidth Detection & Recommendations ===

    async measureBandwidth() {
        // Use cached bandwidth if measured recently (within 5 minutes)
        const cached = sessionStorage.getItem('kv_bandwidth');
        if (cached) {
            const { mbps, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp < 5 * 60 * 1000) {
                return mbps;
            }
        }

        try {
            // Use a small test image/resource to estimate bandwidth
            const testUrl = '/static/favicon.ico?' + Date.now();
            const startTime = performance.now();
            const response = await fetch(testUrl, { cache: 'no-store' });
            const blob = await response.blob();
            const endTime = performance.now();

            const durationSeconds = (endTime - startTime) / 1000;
            const bytesLoaded = blob.size;
            const bitsLoaded = bytesLoaded * 8;
            const mbps = (bitsLoaded / durationSeconds) / 1000000;

            // Cache the result
            sessionStorage.setItem('kv_bandwidth', JSON.stringify({
                mbps: Math.round(mbps * 10) / 10,
                timestamp: Date.now()
            }));

            return mbps;
        } catch (error) {
            console.warn('Bandwidth measurement failed:', error);
            return 10; // Default to 10 Mbps
        }
    }

    getRecommendedFormat(formats, bandwidth) {
        // Bandwidth thresholds for quality recommendations
        const videoQualities = [
            { minMbps: 25, qualities: ['2160p', '1440p', '1080p'] },
            { minMbps: 15, qualities: ['1080p', '720p'] },
            { minMbps: 5, qualities: ['720p', '480p'] },
            { minMbps: 2, qualities: ['480p', '360p'] },
            { minMbps: 0, qualities: ['360p', '240p', '144p'] }
        ];

        const audioQualities = [
            { minMbps: 5, qualities: ['256kbps', '192kbps', '160kbps'] },
            { minMbps: 2, qualities: ['192kbps', '160kbps', '128kbps'] },
            { minMbps: 0, qualities: ['128kbps', '64kbps'] }
        ];

        // Find recommended video format
        let recommendedVideo = null;
        for (const tier of videoQualities) {
            if (bandwidth >= tier.minMbps) {
                for (const quality of tier.qualities) {
                    const format = formats.video.find(f =>
                        f.quality.toLowerCase().includes(quality.toLowerCase())
                    );
                    if (format) {
                        recommendedVideo = format;
                        break;
                    }
                }
                if (recommendedVideo) break;
            }
        }
        // Fallback to first available
        if (!recommendedVideo && formats.video.length > 0) {
            recommendedVideo = formats.video[0];
        }

        // Find recommended audio format
        let recommendedAudio = null;
        for (const tier of audioQualities) {
            if (bandwidth >= tier.minMbps) {
                for (const quality of tier.qualities) {
                    const format = formats.audio.find(f =>
                        f.quality.toLowerCase().includes(quality.toLowerCase())
                    );
                    if (format) {
                        recommendedAudio = format;
                        break;
                    }
                }
                if (recommendedAudio) break;
            }
        }
        // Fallback to first available
        if (!recommendedAudio && formats.audio.length > 0) {
            recommendedAudio = formats.audio[0];
        }

        return { video: recommendedVideo, audio: recommendedAudio, bandwidth };
    }
}

// Global instance
window.downloadManager = new DownloadManager();

// === UI Helper Functions ===

async function showDownloadModal(videoId) {
    const modal = document.getElementById('downloadModal');
    const content = document.getElementById('downloadModalContent');

    if (!modal) {
        console.error('Download modal not found');
        return;
    }

    content.innerHTML = '<div class="download-loading"><i class="fas fa-spinner fa-spin"></i> Analyzing connection...</div>';
    modal.classList.add('visible');

    try {
        // Fetch formats and measure bandwidth in parallel
        const [data, bandwidth] = await Promise.all([
            window.downloadManager.fetchFormats(videoId),
            window.downloadManager.measureBandwidth()
        ]);

        // Get recommendations based on bandwidth
        const recommended = window.downloadManager.getRecommendedFormat(data.formats, bandwidth);
        const bandwidthText = bandwidth >= 15 ? 'Fast connection' :
            bandwidth >= 5 ? 'Good connection' : 'Slow connection';

        let html = `
            <div class="download-header">
                <img src="${data.thumbnail}" class="download-thumb">
                <div class="download-info">
                    <h4>${escapeHtml(data.title)}</h4>
                    <span>${formatDuration(data.duration)} · <i class="fas fa-wifi"></i> ${bandwidthText}</span>
                </div>
            </div>
            <div class="download-options">
        `;

        // Recommended formats section
        if (recommended.video || recommended.audio) {
            html += `<h5><i class="fas fa-star"></i> Recommended</h5>
                <div class="format-list recommended-list">`;

            if (recommended.video) {
                html += `
                    <button class="format-btn recommended" onclick="startDownloadFromModal('${videoId}', ${JSON.stringify(recommended.video).replace(/"/g, '&quot;')})">
                        <span class="format-badge">Best for you</span>
                        <i class="fas fa-video"></i>
                        <span class="format-quality">${recommended.video.quality}</span>
                        <span class="format-size">${recommended.video.size}</span>
                        <i class="fas fa-download"></i>
                    </button>
                `;
            }

            if (recommended.audio) {
                html += `
                    <button class="format-btn recommended audio" onclick="startDownloadFromModal('${videoId}', ${JSON.stringify(recommended.audio).replace(/"/g, '&quot;')})">
                        <span class="format-badge">Best audio</span>
                        <i class="fas fa-music"></i>
                        <span class="format-quality">${recommended.audio.quality}</span>
                        <span class="format-size">${recommended.audio.size}</span>
                        <i class="fas fa-download"></i>
                    </button>
                `;
            }
            html += '</div>';
        }

        // All formats (collapsed by default)
        html += `
            <button class="format-toggle" onclick="toggleAdvancedFormats(this)">
                <i class="fas fa-chevron-down"></i> More options
            </button>
            <div class="format-advanced" style="display: none;">
                <h5><i class="fas fa-video"></i> All Video Formats</h5>
                <div class="format-list">
        `;

        data.formats.video.forEach(f => {
            const isRecommended = recommended.video && f.quality === recommended.video.quality;
            html += `
                <button class="format-btn ${isRecommended ? 'is-recommended' : ''}" onclick="startDownloadFromModal('${videoId}', ${JSON.stringify(f).replace(/"/g, '&quot;')})">
                    <span class="format-quality">${f.quality}</span>
                    <span class="format-size">${f.size}</span>
                    ${isRecommended ? '<span class="rec-dot"></span>' : ''}
                    <i class="fas fa-download"></i>
                </button>
            `;
        });

        html += `</div><h5><i class="fas fa-music"></i> All Audio Formats</h5><div class="format-list">`;

        data.formats.audio.forEach(f => {
            const isRecommended = recommended.audio && f.quality === recommended.audio.quality;
            html += `
                <button class="format-btn audio ${isRecommended ? 'is-recommended' : ''}" onclick="startDownloadFromModal('${videoId}', ${JSON.stringify(f).replace(/"/g, '&quot;')})">
                    <span class="format-quality">${f.quality}</span>
                    <span class="format-size">${f.size}</span>
                    ${isRecommended ? '<span class="rec-dot"></span>' : ''}
                    <i class="fas fa-download"></i>
                </button>
            `;
        });

        html += '</div></div></div>';
        content.innerHTML = html;

    } catch (error) {
        content.innerHTML = `<div class="download-error"><i class="fas fa-exclamation-triangle"></i> ${error.message}</div>`;
    }
}

function toggleAdvancedFormats(btn) {
    const advanced = btn.nextElementSibling;
    const isHidden = advanced.style.display === 'none';
    advanced.style.display = isHidden ? 'block' : 'none';
    btn.innerHTML = isHidden ?
        '<i class="fas fa-chevron-up"></i> Less options' :
        '<i class="fas fa-chevron-down"></i> More options';
}

function closeDownloadModal() {
    const modal = document.getElementById('downloadModal');
    if (modal) {
        modal.classList.remove('visible');
    }
}

async function startDownloadFromModal(videoId, format, title) {
    closeDownloadModal();
    showToast(`Starting download: ${format.quality}...`, 'info');

    try {
        await window.downloadManager.startDownload(videoId, format, title);
        showToast('Download started!', 'success');
    } catch (error) {
        showToast(`Download failed: ${error.message}`, 'error');
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDuration(seconds) {
    if (!seconds) return '';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

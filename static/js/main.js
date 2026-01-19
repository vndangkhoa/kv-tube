// KV-Tube Main JavaScript - YouTube Clone

// Re-usable init function for SPA
window.initApp = function () {
    const searchInput = document.getElementById('searchInput');
    const resultsArea = document.getElementById('resultsArea');

    // cleanup previous observers if any
    if (window.currentObserver) {
        window.currentObserver.disconnect();
    }

    // Check APP_CONFIG if available (set in index.html)
    const socketConfig = window.APP_CONFIG || {};
    const pageType = socketConfig.page || 'home';

    if (searchInput) {
        // Clear previous event listeners to avoid duplicates (optional, but safer to just re-attach if we are careful)
        // Actually, searchInput is in the header, which is NOT replaced.
        // So we should NOT re-attach listener to searchInput every time.
        // We need to check if we already attached it.
        if (!searchInput.dataset.listenerAttached) {
            searchInput.addEventListener('keypress', async (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const query = searchInput.value.trim();
                    if (query) {
                        // Use navigation manager if available
                        if (window.navigationManager) {
                            window.navigationManager.navigateTo(`/results?search_query=${encodeURIComponent(query)}`);
                        } else {
                            window.location.href = `/results?search_query=${encodeURIComponent(query)}`;
                        }
                    }
                }
            });
            searchInput.dataset.listenerAttached = 'true';
        }

        // Handle Page Initialization - only if resultsArea exists (not on channel.html)
        if (resultsArea) {
            if (pageType === 'channel' && socketConfig.channelId) {
                console.log("Loading Channel:", socketConfig.channelId);
                loadChannelVideos(socketConfig.channelId);
            } else if (pageType === 'results' || socketConfig.query) {
                const q = socketConfig.query || new URLSearchParams(window.location.search).get('search_query');
                if (q) {
                    if (searchInput) searchInput.value = q;
                    searchYouTube(q);
                }
            } else {
                // Default Home
                // Check if we are actually on home page based on URL or Config
                if (pageType === 'home') {
                    loadTrending();
                }
            }

            // Init Infinite Scroll
            initInfiniteScroll();
        }
    }

    // Init Theme (check if already init)
    initTheme();

    // Restore sidebar state from localStorage to prevent layout shift
    initSidebarState();

    // Check for category in URL if we are on home and need to switch
    const urlParams = new URLSearchParams(window.location.search);
    const category = urlParams.get('category');
    if (category && typeof switchCategory === 'function' && pageType === 'home') {
        // We might have already loaded trending above, but switchCategory handles UI state
        // It also triggers a load, so maybe we want to avoid double loading.
        // But switchCategory also sets the active pill.
        // Let's just set the active pill visually for now if we already loaded trending.
        const pill = document.querySelector(`.yt-chip[onclick*="'${category}'"]`);
        if (pill) {
            document.querySelectorAll('.yt-category-pill, .yt-chip').forEach(b => b.classList.remove('active'));
            pill.classList.add('active');
        }
        // If switchCategory is called it will re-fetch.
    }
};

document.addEventListener('DOMContentLoaded', window.initApp);

// Note: Global variables like currentCategory are defined below
let currentCategory = 'all';
let currentPage = 1;
let isLoading = false;
let hasMore = true; // Track if there are more videos to load

// --- Lazy Loading ---
const imageObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const img = entry.target;
            const src = img.getAttribute('data-src');
            if (src) {
                img.src = src;
                img.onload = () => img.classList.add('loaded');
                img.removeAttribute('data-src');
            }
            observer.unobserve(img);
        }
    });
}, {
    rootMargin: '50px 0px',
    threshold: 0.1
});

window.observeImages = function () {
    document.querySelectorAll('img[data-src]').forEach(img => {
        imageObserver.observe(img);
    });
};

// --- Infinite Scroll ---
function initInfiniteScroll() {
    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !isLoading && hasMore) {
            loadMore();
        }
    }, { rootMargin: '200px' });

    // Create sentinel logic or observe existing footer/element
    // We'll observe a sentinel element at the bottom of the grid
    // Create sentinel logic or observe existing footer/element
    // We'll observe a sentinel element at the bottom of the grid
    const resultsArea = document.getElementById('resultsArea');
    if (!resultsArea) return; // Exit if not on home page

    const sentinel = document.createElement('div');
    sentinel.id = 'scroll-sentinel';
    sentinel.style.width = '100%';
    sentinel.style.height = '20px';
    resultsArea.parentNode.appendChild(sentinel);
    observer.observe(sentinel);
}

// --- UI Helpers ---
function renderSkeleton() {
    // Generate 8 skeleton cards
    return Array(8).fill(0).map(() => `
        <div class="yt-video-card skeleton-card">
            <div class="skeleton-thumb skeleton"></div>
            <div class="skeleton-details">
                <div class="skeleton-avatar skeleton"></div>
                <div class="skeleton-text">
                    <div class="skeleton-title skeleton"></div>
                    <div class="skeleton-meta skeleton"></div>
                </div>
            </div>
        </div>
    `).join('');
}

function renderNoContent(message = 'Try searching for something else', title = 'No videos found') {
    return `
        <div class="yt-empty-state">
            <div class="yt-empty-icon"><i class="fas fa-film"></i></div>
            <div class="yt-empty-title">${title}</div>
            <div class="yt-empty-desc">${message}</div>
        </div>
    `;
}

// Render homepage with personalized sections
function renderHomepageSections(sections, container, localHistory = []) {
    // Check if container exists
    if (!container) {
        console.warn('renderHomepageSections: container is null');
        return;
    }

    // Create a map for quick history lookup
    const historyMap = {};
    localHistory.forEach(v => {
        if (v && v.id) historyMap[v.id] = v;
    });

    sections.forEach(section => {
        if (!section.videos || section.videos.length === 0) return;

        // Create section wrapper
        const sectionEl = document.createElement('div');
        sectionEl.className = 'yt-homepage-section';
        sectionEl.id = `section-${section.id}`;

        // Section header
        const header = document.createElement('div');
        header.className = 'yt-section-header';
        header.innerHTML = `
            <h2>${escapeHtml(section.title)}</h2>
        `;
        sectionEl.appendChild(header);

        // Video grid for this section
        const grid = document.createElement('div');
        grid.className = 'yt-video-grid';

        // LIMIT VISIBLE VIDEOS TO 8 (2 rows of 4 on desktop)
        const INITIAL_LIMIT = 8;
        const hasMore = section.videos.length > INITIAL_LIMIT;

        section.videos.forEach((video, index) => {
            // For continue watching
            if (video._from_history && historyMap[video.id]) {
                const hist = historyMap[video.id];
                video.title = hist.title || video.title;
                video.uploader = hist.uploader || video.uploader;
                video.thumbnail = hist.thumbnail || video.thumbnail;
            }

            const card = document.createElement('div');
            card.className = 'yt-video-card';
            // Hide videos beyond limit initially
            if (index >= INITIAL_LIMIT) {
                card.classList.add('yt-hidden-video');
                card.style.display = 'none';
            }

            card.innerHTML = `
                <div class="yt-thumbnail-container">
                    <img class="yt-thumbnail" src="${video.thumbnail}" alt="${escapeHtml(video.title || 'Video')}" loading="lazy" onload="this.classList.add('loaded')">
                    ${video.duration ? `<span class="yt-duration">${video.duration}</span>` : ''}
                </div>
                <div class="yt-video-details">
                    <div class="yt-channel-avatar">
                        ${video.uploader ? video.uploader.charAt(0).toUpperCase() : 'Y'}
                    </div>
                    <div class="yt-video-meta">
                        <h3 class="yt-video-title">${escapeHtml(video.title || 'Unknown')}</h3>
                        <p class="yt-channel-name">${escapeHtml(video.uploader || 'Unknown')}</p>
                        <p class="yt-video-stats">${formatViews(video.view_count)} views${video.upload_date ? ' • ' + formatDate(video.upload_date) : ''}</p>
                    </div>
                </div>
            `;

            card.addEventListener('click', () => {
                const params = new URLSearchParams({
                    v: video.id,
                    title: video.title || '',
                    uploader: video.uploader || '',
                    thumbnail: video.thumbnail || ''
                });
                const dest = `/watch?${params.toString()}`;

                if (window.navigationManager) {
                    window.navigationManager.navigateTo(dest);
                } else {
                    window.location.href = dest;
                }
            });

            grid.appendChild(card);
        });

        sectionEl.appendChild(grid);

        // ADD LOAD MORE BUTTON IF NEEDED
        if (hasMore) {
            const btnContainer = document.createElement('div');
            btnContainer.className = 'yt-section-footer';
            btnContainer.style.textAlign = 'center';
            btnContainer.style.padding = '10px';

            const btn = document.createElement('button');
            btn.className = 'yt-action-btn'; // Re-use existing or generic class
            btn.style.padding = '8px 24px';
            btn.style.borderRadius = '18px';
            btn.style.border = '1px solid var(--yt-border)';
            btn.style.background = 'var(--yt-bg-secondary)';
            btn.style.color = 'var(--yt-text-primary)';
            btn.style.cursor = 'pointer';
            btn.style.fontWeight = '500';
            btn.innerText = 'Show more';

            btn.onmouseover = () => btn.style.background = 'var(--yt-bg-hover)';
            btn.onmouseout = () => btn.style.background = 'var(--yt-bg-secondary)';

            btn.onclick = function () {
                // Reveal hidden videos
                const hidden = grid.querySelectorAll('.yt-hidden-video');
                hidden.forEach(el => el.style.display = 'flex'); // Restore display
                btnContainer.remove(); // Remove button
            };

            btnContainer.appendChild(btn);
            sectionEl.appendChild(btnContainer);
        }

        container.appendChild(sectionEl);
    });

    if (window.observeImages) window.observeImages();
}


async function searchYouTube(query) {
    if (isLoading) return;

    const resultsArea = document.getElementById('resultsArea');
    const loadMoreArea = document.getElementById('loadMoreArea');

    isLoading = true;
    resultsArea.innerHTML = renderSkeleton();

    try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await response.json();

        if (data.error) {
            resultsArea.innerHTML = `<div class="yt-loader" style="grid-column: 1/-1;"><p style="color:#f00;">Error: ${data.error}</p></div>`;
            return;
        }

        displayResults(data, false);
        if (loadMoreArea) loadMoreArea.style.display = 'none';
    } catch (error) {
        console.error('Search error:', error);
        resultsArea.innerHTML = `<div class="yt-loader" style="grid-column: 1/-1;"><p style="color:#f00;">Failed to fetch results</p></div>`;
    } finally {
        isLoading = false;
    }
}

// Switch category
async function switchCategory(category, btn) {
    if (isLoading) return;

    // Update UI (Pills)
    document.querySelectorAll('.yt-category-pill').forEach(b => b.classList.remove('active'));
    if (btn && btn.classList) btn.classList.add('active');

    // Update UI (Sidebar)
    document.querySelectorAll('.yt-sidebar-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-category') === category) {
            item.classList.add('active');
        }
    });

    // Reset state
    currentCategory = category;
    currentPage = 1;
    window.currentPage = 1;
    hasMore = true; // Reset infinite scroll

    const resultsArea = document.getElementById('resultsArea');
    const videosSection = document.getElementById('videosSection');

    // Show resultsArea (may have been hidden by homepage sections)
    resultsArea.style.display = '';
    // Remove any homepage sections
    if (videosSection) {
        videosSection.querySelectorAll('.yt-homepage-section').forEach(el => el.remove());
    }

    resultsArea.innerHTML = renderSkeleton();

    // Hide pagination while loading
    const paginationArea = document.getElementById('paginationArea');
    if (paginationArea) paginationArea.style.display = 'none';

    // Handle Shorts Layout
    const shortsSection = document.getElementById('shortsSection');
    // videosSection already declared above

    if (shortsSection) {
        if (category === 'shorts') {
            shortsSection.style.display = 'none'; // Hide carousel, show grid in results
            if (videosSection) videosSection.querySelector('h2').style.display = 'none'; // Optional: hide "Videos" header
        } else {
            shortsSection.style.display = 'block';
            if (videosSection) videosSection.querySelector('h2').style.display = 'flex';
        }
    }

    // Handle Special Categories
    if (category === 'history') {
        const response = await fetch('/api/history');
        const data = await response.json();
        displayResults(data, false);
        isLoading = false;
        return;
    }
    if (category === 'suggested') {
        // Build query params from localStorage history
        const history = JSON.parse(localStorage.getItem('kv_history') || '[]');
        const titles = history.slice(0, 5).map(v => v.title).filter(Boolean).join(',');
        const channels = history.slice(0, 3).map(v => v.uploader).filter(Boolean).join(',');

        let url = '/api/suggested';
        const params = new URLSearchParams();
        if (titles) params.append('titles', titles);
        if (channels) params.append('channels', channels);
        if (params.toString()) url += '?' + params.toString();

        const response = await fetch(url);
        const data = await response.json();
        displayResults(data, false);
        isLoading = false;
        return;
    }

    // Load both videos and shorts with current category, sort, and region
    await loadTrending(true);


    // Also reload shorts to match category
    if (typeof loadShorts === 'function') {
        loadShorts();
    }

    // Render pagination
    if (typeof renderPagination === 'function') {
        renderPagination();
    }
}

// Load more videos
async function loadMore() {
    currentPage++;
    await loadTrending(false);
}

// Load trending videos
async function loadTrending(reset = true) {
    if (isLoading && reset) isLoading = false;

    const resultsArea = document.getElementById('resultsArea');
    const loadMoreArea = document.getElementById('loadMoreArea');
    const loadMoreBtn = document.getElementById('loadMoreBtn');

    if (!resultsArea) return; // Exit if not on home page

    isLoading = true;
    if (!reset && loadMoreBtn) {
        loadMoreBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
    } else if (reset) {
        resultsArea.innerHTML = renderSkeleton();
    }

    try {
        const regionValue = window.currentRegion || 'vietnam';

        // For 'all' category, use new homepage API with personalization
        if (currentCategory === 'all') {
            // Build personalization params from localStorage
            const history = JSON.parse(localStorage.getItem('kv_history') || '[]');
            const subscriptions = JSON.parse(localStorage.getItem('kv_subscriptions') || '[]');

            const params = new URLSearchParams();
            params.append('region', regionValue);
            params.append('page', currentPage); // Add Pagination
            params.append('_', Date.now()); // Cache buster

            if (history.length > 0 && reset) { // Only send history on first page for relevance
                const historyIds = history.slice(0, 10).map(v => v.id).filter(Boolean);
                const historyTitles = history.slice(0, 5).map(v => v.title).filter(Boolean);
                const historyChannels = history.slice(0, 5).map(v => v.uploader).filter(Boolean);

                if (historyIds.length) params.append('history', historyIds.join(','));
                if (historyTitles.length) params.append('titles', historyTitles.join(','));
                if (historyChannels.length) params.append('channels', historyChannels.join(','));
            }

            if (subscriptions.length > 0 && reset) {
                const subIds = subscriptions.slice(0, 10).map(s => s.id).filter(Boolean);
                if (subIds.length) params.append('subs', subIds.join(','));
            }

            // Show skeleton for infinite scroll
            if (!reset) {
                const videosSection = document.getElementById('videosSection');
                // Avoid duplicates
                if (!document.getElementById('infinite-scroll-skeleton')) {
                    const skelDiv = document.createElement('div');
                    skelDiv.id = 'infinite-scroll-skeleton';
                    skelDiv.className = 'yt-video-grid';
                    skelDiv.style.marginTop = '20px';
                    skelDiv.innerHTML = renderSkeleton(); // Reuse existing skeleton generator
                    videosSection.appendChild(skelDiv);
                }
            }

            const response = await fetch(`/api/homepage?${params.toString()}`);
            const data = await response.json();

            if (data.mode === 'sections' && data.data) {
                // Hide the grid-based resultsArea and render sections to parent
                resultsArea.style.display = 'none';
                const videosSection = document.getElementById('videosSection');

                if (reset) {
                    // Remove previous sections if reset
                    videosSection.querySelectorAll('.yt-homepage-section').forEach(el => el.remove());
                }

                // Remove infinite scroll skeleton if it exists
                const existingSkeleton = document.getElementById('infinite-scroll-skeleton');
                if (existingSkeleton) existingSkeleton.remove();

                // Append new sections (for Infinite Scroll)
                renderHomepageSections(data.data, videosSection, history);
                isLoading = false;
                hasMore = data.data.length > 0; // Continue if we got sections
                return;
            }
        }

        // Fallback: Original trending logic for category pages
        const sortValue = window.currentSort || 'month';
        const cb = reset ? `&_=${Date.now()}` : '';

        const response = await fetch(`/api/trending?category=${currentCategory}&page=${currentPage}&sort=${sortValue}&region=${regionValue}${cb}`);
        const data = await response.json();

        if (data.error) {
            console.error('Trending error:', data.error);
            if (reset) {
                resultsArea.innerHTML = renderNoContent(`Error: ${data.error}`, 'Something went wrong');
            }
            return;
        }

        if (data.mode === 'sections') {
            if (reset) resultsArea.innerHTML = '';

            // Flatten all section videos into a single unified grid
            // User requested single vertical scroll instead of per-section carousels
            let allVideos = [];

            data.data.forEach(section => {
                const videos = section.videos || [];
                // Add section info to each video for potential category display
                videos.forEach(video => {
                    video._sectionId = section.id;
                    video._sectionTitle = section.title;
                });
                allVideos = allVideos.concat(videos);
            });

            // Render all videos in a unified grid
            allVideos.forEach(video => {
                const card = document.createElement('div');
                card.className = 'yt-video-card';

                card.innerHTML = `
                    <div class="yt-thumbnail-container">
                        <img class="yt-thumbnail" src="${video.thumbnail}" loading="lazy" onload="this.classList.add('loaded')" alt="${escapeHtml(video.title)}">
                        ${video.duration ? `<span class="yt-duration">${video.duration}</span>` : ''}
                    </div>
                    <div class="yt-video-details">
                        <div class="yt-channel-avatar">
                            ${video.uploader ? video.uploader.charAt(0).toUpperCase() : 'Y'}
                        </div>
                        <div class="yt-video-meta">
                            <h3 class="yt-video-title">${escapeHtml(video.title)}</h3>
                            <p class="yt-channel-name">${escapeHtml(video.uploader || 'Unknown')}</p>
                            <p class="yt-video-stats">${formatViews(video.view_count)} views</p>
                        </div>
                    </div>
                `;
                card.onclick = () => {
                    const params = new URLSearchParams({
                        v: video.id,
                        title: video.title || '',
                        uploader: video.uploader || '',
                        thumbnail: video.thumbnail || ''
                    });
                    const dest = `/watch?${params.toString()}`;

                    if (window.navigationManager) {
                        window.navigationManager.navigateTo(dest);
                    } else {
                        window.location.href = dest;
                    }
                };
                resultsArea.appendChild(card);
            });

            if (window.observeImages) window.observeImages();
            return;
        }

        if (reset) resultsArea.innerHTML = '';

        if (data.length === 0) {
            if (reset) {
                resultsArea.innerHTML = renderNoContent();
            }
            hasMore = false; // Only stop if we get no results at all
        } else {
            displayResults(data, !reset);
            // Keep loading unless we got 0 videos
            // Multi-category API returns variable amounts, so don't limit by 20
            hasMore = data.length > 0;
        }
    } catch (e) {
        console.error('Failed to load trending:', e);
        if (reset) {
            resultsArea.innerHTML = `<div class="yt-loader" style="grid-column: 1/-1;"><p style="color:#f00;">Connection error</p></div>`;
        }
    } finally {
        isLoading = false;
    }
}

// Display results with YouTube-style cards
function displayResults(videos, append = false) {
    const resultsArea = document.getElementById('resultsArea');
    if (!append) resultsArea.innerHTML = '';

    if (videos.length === 0 && !append) {
        resultsArea.innerHTML = renderNoContent();
        return;
    }

    videos.forEach(video => {
        const card = document.createElement('div');

        if (currentCategory === 'shorts') {
            // Render as Short Card (Vertical)
            card.className = 'yt-short-card';
            // Adjust styling for grid view if needed
            card.style.width = '100%';
            card.style.maxWidth = '200px';
            card.innerHTML = `
                <img data-src="${video.thumbnail}" class="yt-short-thumb" style="width:100%; aspect-ratio:9/16; height:auto;">
                <p class="yt-short-title">${escapeHtml(video.title)}</p>
                <p class="yt-short-views">${formatViews(video.view_count)} views</p>
             `;
        } else {
            // Render as Standard Video Card
            card.className = 'yt-video-card';
            card.innerHTML = `
                <div class="yt-thumbnail-container">
                    <img class="yt-thumbnail" data-src="${video.thumbnail}" alt="${escapeHtml(video.title)}">
                    ${video.duration ? `<span class="yt-duration">${video.duration}</span>` : ''}
                </div>
                <div class="yt-video-details">
                    <div class="yt-channel-avatar">
                        ${video.uploader ? video.uploader.charAt(0).toUpperCase() : 'Y'}
                    </div>
                    <div class="yt-video-meta">
                        <h3 class="yt-video-title">${escapeHtml(video.title)}</h3>
                        <p class="yt-channel-name">
                            <a href="/channel/${video.channel_id || video.uploader_id || video.uploader || 'unknown'}" 
                               class="yt-channel-link" 
                               style="color:inherit; text-decoration:none;">
                                ${escapeHtml(video.uploader || 'Unknown')}
                            </a>
                        </p>
                        <p class="yt-video-stats">${formatViews(video.view_count)} views • ${formatDate(video.upload_date)}</p>
                    </div>
                </div>
            `;
        }

        card.addEventListener('click', (e) => {
            // Prevent navigation if clicking on channel link
            if (e.target.closest('.yt-channel-link')) return;

            const params = new URLSearchParams({
                v: video.id,
                title: video.title || '',
                uploader: video.uploader || '',
                thumbnail: video.thumbnail || ''
            });
            const dest = `/watch?${params.toString()}`;

            if (window.navigationManager) {
                window.navigationManager.navigateTo(dest);
            } else {
                window.location.href = dest;
            }
        });
        resultsArea.appendChild(card);
    });

    if (window.observeImages) window.observeImages();
}

// Format view count (YouTube style)
function formatViews(views) {
    if (!views) return '0';
    const num = parseInt(views);
    if (num >= 1000000000) return (num / 1000000000).toFixed(1) + 'B';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toLocaleString();
}

// Format date (YouTube style: "2 hours ago", "3 days ago", etc.)
function formatDate(dateStr) {
    if (!dateStr) return 'Recently';

    // Ensure string
    dateStr = String(dateStr);
    console.log('[Debug] formatDate input:', dateStr);

    // Handle YYYYMMDD format
    if (/^\d{8}$/.test(dateStr)) {
        const year = dateStr.substring(0, 4);
        const month = dateStr.substring(4, 6);
        const day = dateStr.substring(6, 8);
        dateStr = `${year}-${month}-${day}`;
    }

    const date = new Date(dateStr);
    console.log('[Debug] Date Logic:', { input: dateStr, parsed: date, valid: !isNaN(date.getTime()) });

    if (isNaN(date.getTime())) return 'Invalid Date';

    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    const diffWeek = Math.floor(diffDay / 7);
    const diffMonth = Math.floor(diffDay / 30);
    const diffYear = Math.floor(diffDay / 365);

    if (diffYear > 0) return `${diffYear} year${diffYear > 1 ? 's' : ''} ago`;
    if (diffMonth > 0) return `${diffMonth} month${diffMonth > 1 ? 's' : ''} ago`;
    if (diffWeek > 0) return `${diffWeek} week${diffWeek > 1 ? 's' : ''} ago`;
    if (diffDay > 0) return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
    if (diffHour > 0) return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`;
    if (diffMin > 0) return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`;
    return 'Just now';
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Sidebar toggle (for mobile and desktop)
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const main = document.getElementById('mainContent');
    const overlay = document.querySelector('.yt-sidebar-overlay');

    if (window.innerWidth <= 1024) {
        // Mobile: slide-in sidebar with overlay
        sidebar.classList.toggle('open');
        if (overlay) {
            overlay.classList.toggle('active', sidebar.classList.contains('open'));
        }
    } else {
        // Desktop: collapse/expand sidebar
        sidebar.classList.toggle('collapsed');
        main.classList.toggle('sidebar-collapsed');
        localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
    }
}

// Close sidebar when clicking outside (mobile)
document.addEventListener('click', (e) => {
    const sidebar = document.getElementById('sidebar');
    const menuBtn = document.querySelector('.yt-menu-btn');
    const overlay = document.querySelector('.yt-sidebar-overlay');

    if (window.innerWidth <= 1024 &&
        sidebar &&
        sidebar.classList.contains('open') &&
        !sidebar.contains(e.target) &&
        menuBtn && !menuBtn.contains(e.target)) {
        sidebar.classList.remove('open');
        if (overlay) {
            overlay.classList.remove('active');
        }
    }
});

// Initialize sidebar state from localStorage to prevent layout shift
function initSidebarState() {
    const sidebar = document.getElementById('sidebar');
    const main = document.getElementById('mainContent');
    const overlay = document.querySelector('.yt-sidebar-overlay');

    if (!sidebar || !main) return;

    // Mobile: always hide sidebar (it will slide in when toggled)
    if (window.innerWidth <= 1024) {
        sidebar.classList.remove('open', 'collapsed');
        main.classList.remove('sidebar-collapsed');
        if (overlay) overlay.classList.remove('active');
        return;
    }

    // Desktop: Check if we're on watch page
    const isWatchPage = document.querySelector('.yt-watch-layout') !== null;

    // On watch page, always use mini sidebar for more video space
    if (isWatchPage) {
        sidebar.classList.add('collapsed');
        main.classList.add('sidebar-collapsed');
        return;
    }

    // On other pages, restore from localStorage for consistent experience
    const savedState = localStorage.getItem('sidebarCollapsed');
    if (savedState === 'true') {
        sidebar.classList.add('collapsed');
        main.classList.add('sidebar-collapsed');
    } else {
        sidebar.classList.remove('collapsed');
        main.classList.remove('sidebar-collapsed');
    }
}

// Re-initialize sidebar state on window resize
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        initSidebarState();
    }, 150);
});

// --- Theme Logic ---
function initTheme() {
    // Check for saved preference
    let savedTheme = localStorage.getItem('theme');

    // If no saved preference, default to dark theme
    if (!savedTheme) {
        savedTheme = 'dark';
    }

    setTheme(savedTheme, false); // Initial set without saving (already saved or computed)
}

function setTheme(theme, save = true) {
    document.documentElement.setAttribute('data-theme', theme);
    if (save) {
        localStorage.setItem('theme', theme);
    }

    // Update UI Buttons (if on settings page)
    const btnLight = document.getElementById('themeBtnLight');
    const btnDark = document.getElementById('themeBtnDark');

    if (btnLight && btnDark) {
        btnLight.classList.remove('active');
        btnDark.classList.remove('active');

        if (theme === 'light') btnLight.classList.add('active');
        else btnDark.classList.add('active');
    }
}

// Ensure theme persists on back navigation (BFCache)
window.addEventListener('pageshow', (event) => {
    // Re-apply theme from storage to ensure it matches user preference
    // even if page was restored from cache with old state
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        setTheme(savedTheme, false);
    } else {
        initTheme();
    }
});

// Sync across tabs
window.addEventListener('storage', (event) => {
    if (event.key === 'theme') {
        setTheme(event.newValue, false);
    }
});

// --- Profile Logic ---
async function updateProfile(e) {
    if (e) e.preventDefault();

    const displayName = document.getElementById('displayName').value;
    const btn = e.target.querySelector('button');
    const originalText = btn.innerHTML;

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    try {
        const response = await fetch('/api/update_profile', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username: displayName })
        });

        const data = await response.json();

        if (data.success) {
            showToast('Profile updated successfully!', 'success');
            // Update UI immediately
            const avatarName = document.querySelector('.yt-avatar');
            if (avatarName) avatarName.title = displayName;
        } else {
            showToast(data.message || 'Update failed', 'error');
        }
    } catch (err) {
        showToast('Network error', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// --- Local Storage Helpers ---
function getLibrary(type) {
    return JSON.parse(localStorage.getItem(`kv_${type}`) || '[]');
}

function saveToLibrary(type, item) {
    let lib = getLibrary(type);
    // Filter out nulls/invalid items to self-heal storage
    lib = lib.filter(i => i && i.id);

    // Avoid duplicates
    if (!lib.some(i => i.id === item.id)) {
        lib.unshift(item); // Add to top
        localStorage.setItem(`kv_${type}`, JSON.stringify(lib));
        if (type !== 'history') {
            showToast(`Saved to ${type}`, 'success');
        }
    }
}

function removeFromLibrary(type, id) {
    let lib = getLibrary(type);
    lib = lib.filter(i => i && i.id !== id);
    localStorage.setItem(`kv_${type}`, JSON.stringify(lib));
    showToast(`Removed from ${type}`, 'info');
    // Refresh if on library page
    if (window.location.pathname === '/my-videos') {
        location.reload();
    }
}

function isInLibrary(type, id) {
    const lib = getLibrary(type);
    return lib.some(i => i && i.id === id);
}

// --- Subscription Logic ---
function toggleSubscribe(channelId, channelName, avatarUrl, btnElement) {
    event.stopPropagation(); // Prevent card clicks

    if (isInLibrary('subscriptions', channelId)) {
        removeFromLibrary('subscriptions', channelId);
        if (btnElement) {
            btnElement.classList.remove('subscribed');
            btnElement.innerHTML = 'Subscribe';
        }
    } else {
        saveToLibrary('subscriptions', {
            id: channelId,
            title: channelName,
            thumbnail: avatarUrl,
            timestamp: new Date().toISOString()
        });
        if (btnElement) {
            btnElement.classList.add('subscribed');
            btnElement.innerHTML = 'Subscribed';
        }
    }
}

function checkSubscriptionStatus(channelId, btnElement) {
    if (isInLibrary('subscriptions', channelId)) {
        btnElement.classList.add('subscribed');
        btnElement.innerHTML = 'Subscribed';
    }
}

// Load Channel Videos
async function loadChannelVideos(channelId) {
    const resultsArea = document.getElementById('resultsArea');
    if (!resultsArea) return; // Guard: only works on pages with resultsArea

    isLoading = true;
    resultsArea.innerHTML = renderSkeleton();

    try {
        const response = await fetch(`/api/channel?id=${encodeURIComponent(channelId)}`);
        const data = await response.json();

        if (data.error) {
            resultsArea.innerHTML = renderNoContent(`Error: ${data.error}`, "Could not load channel.");
            return;
        }

        // Render header
        const headerHtml = `
            <div class="yt-channel-header" style="padding: 24px 0; border-bottom: 1px solid var(--yt-border); margin-bottom: 24px; display: flex; align-items: center; gap: 20px;">
                <div class="yt-channel-avatar-xl" style="width: 80px; height: 80px; border-radius: 50%; background: var(--yt-accent-blue); display: flex; align-items: center; justify-content: center; font-size: 32px; color: white; font-weight: bold;">
                   ${channelId.startsWith('UC') ? channelId[0] : (data[0]?.uploader?.[0] || 'C')}
                </div>
                <div>
                   <h1 style="font-size: 24px; margin: 0 0 8px 0;">${data[0]?.uploader || 'Channel Content'}</h1>
                   <p style="color: var(--yt-text-secondary); margin: 0;">${data.length} Videos</p>
                </div>
            </div>
            <div class="yt-video-grid">
        `;

        // Videos
        const videosHtml = data.map(video => `
            <div class="yt-video-card" onclick="window.navigationManager ? window.navigationManager.navigateTo('/watch?v=${video.id}') : window.location.href='/watch?v=${video.id}'">
                 <div class="yt-thumbnail-container">
                    <img class="yt-thumbnail" src="${video.thumbnail}" loading="lazy" onload="this.classList.add('loaded')" alt="${escapeHtml(video.title)}">
                    ${video.duration ? `<span class="yt-duration">${video.duration}</span>` : ''}
                </div>
                <div class="yt-video-details">
                    <div class="yt-video-meta">
                        <h3 class="yt-video-title">${escapeHtml(video.title)}</h3>
                        <div class="yt-video-info">
                            <span>${formatViews(video.view_count)} views</span>
                            <span>• ${formatDate(video.upload_date)}</span>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');

        resultsArea.innerHTML = headerHtml + videosHtml + '</div>';

        if (window.observeImages) window.observeImages();

    } catch (e) {
        console.error("Channel Load Error:", e);
        resultsArea.innerHTML = renderNoContent("Failed to load channel", "Please try again later.");
    } finally {
        isLoading = false;
    }
}

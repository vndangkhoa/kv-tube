/**
 * KV-Tube Navigation Manager
 * Handles SPA-style navigation to persist state (like downloads) across pages.
 */

class NavigationManager {
    constructor() {
        this.mainContentId = 'mainContent';
        this.pageCache = new Map();
        this.maxCacheSize = 20;
        this.init();
    }

    init() {
        // Handle browser back/forward buttons
        window.addEventListener('popstate', (e) => {
            if (e.state && e.state.url) {
                this.loadPage(e.state.url, false);
            } else {
                // Fallback for initial state or external navigation
                this.loadPage(window.location.href, false);
            }
        });

        // Intercept clicks
        document.addEventListener('click', (e) => {
            // Find closest anchor tag
            const link = e.target.closest('a');

            // Check if it's an internal link and not a download/special link
            if (link &&
                link.href &&
                link.href.startsWith(window.location.origin) &&
                !link.getAttribute('download') &&
                !link.getAttribute('target') &&
                !link.classList.contains('no-spa') &&
                !e.ctrlKey && !e.metaKey && !e.shiftKey // Allow new tab clicks
            ) {
                e.preventDefault();
                const url = link.href;
                this.navigateTo(url);

                // Update active state in sidebar
                this.updateSidebarActiveState(link);
            }
        });

        // Save initial state
        const currentUrl = window.location.href;
        if (!this.pageCache.has(currentUrl)) {
            // We don't have the raw HTML, so we can't fully cache the initial page accurately 
            // without fetching it or serializing current DOM. 
            // For now, we will cache it upon *leaving* securely or just let the first visit be uncached.
            // Better: Cache the current DOM state as the "initial" state.
            this.saveCurrentState(currentUrl);
        }
    }

    saveCurrentState(url) {
        const mainContent = document.getElementById(this.mainContentId);
        if (mainContent) {
            this.pageCache.set(url, {
                html: mainContent.innerHTML,
                title: document.title,
                scrollY: window.scrollY,
                className: mainContent.className
            });

            // Prune cache
            if (this.pageCache.size > this.maxCacheSize) {
                const firstKey = this.pageCache.keys().next().value;
                this.pageCache.delete(firstKey);
            }
        }
    }

    async navigateTo(url) {
        // Start Progress Bar
        const bar = document.getElementById('nprogress-bar');
        if (bar) {
            bar.style.opacity = '1';
            bar.style.width = '30%';
        }

        // Save state of current page before leaving
        this.saveCurrentState(window.location.href);

        // Update history
        history.pushState({ url: url }, '', url);
        await this.loadPage(url);
    }

    async loadPage(url, pushState = true) {
        const bar = document.getElementById('nprogress-bar');
        if (bar) bar.style.width = '60%';

        const mainContent = document.getElementById(this.mainContentId);
        if (!mainContent) return;

        // Check cache
        if (this.pageCache.has(url)) {
            const cached = this.pageCache.get(url);

            // Restore content
            document.title = cached.title;
            mainContent.innerHTML = cached.html;
            mainContent.className = cached.className;

            // Re-execute scripts
            this.executeScripts(mainContent);

            // Re-initialize App
            if (typeof window.initApp === 'function') {
                window.initApp();
            }

            // Restore scroll
            window.scrollTo(0, cached.scrollY);
            return;
        }

        // Show loading state if needed
        mainContent.style.opacity = '0.5';

        try {
            const response = await fetch(url);
            const html = await response.text();

            // Parse HTML
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Extract new content
            const newContent = doc.getElementById(this.mainContentId);
            if (!newContent) {
                // Check if it's a full page not extending layout properly or error
                console.error('Could not find mainContent in response');
                window.location.href = url; // Fallback to full reload
                return;
            }

            // Update title
            document.title = doc.title;

            // Replace content
            mainContent.innerHTML = newContent.innerHTML;
            mainContent.className = newContent.className; // Maintain classes

            // Execute scripts found in the new content (critical for APP_CONFIG)
            this.executeScripts(mainContent);

            // Re-initialize App logic
            if (typeof window.initApp === 'function') {
                window.initApp();
            }

            // Scroll to top for new pages
            window.scrollTo(0, 0);

            // Save to cache (initial state of this page)
            this.pageCache.set(url, {
                html: newContent.innerHTML,
                title: doc.title,
                scrollY: 0,
                className: newContent.className
            });

        } catch (error) {
            console.error('Navigation error:', error);
            // Fallback
            window.location.href = url;
        } finally {
            mainContent.style.opacity = '1';
        }
    }

    executeScripts(element) {
        const scripts = element.querySelectorAll('script');
        scripts.forEach(oldScript => {
            const newScript = document.createElement('script');
            Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
            newScript.textContent = oldScript.textContent;
            oldScript.parentNode.replaceChild(newScript, oldScript);
        });
    }

    updateSidebarActiveState(clickedLink) {
        // Remove active class from all items
        document.querySelectorAll('.yt-sidebar-item').forEach(item => item.classList.remove('active'));

        // Add to clicked if it is a sidebar item
        if (clickedLink.classList.contains('yt-sidebar-item')) {
            clickedLink.classList.add('active');
        } else {
            // Try to find matching sidebar item
            const path = new URL(clickedLink.href).pathname;
            const match = document.querySelector(`.yt-sidebar-item[href="${path}"]`);
            if (match) match.classList.add('active');
        }
    }
}

// Initialize
window.navigationManager = new NavigationManager();

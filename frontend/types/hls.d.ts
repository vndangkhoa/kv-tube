// Shared ambient types for the runtime-loaded hls.js library and iOS
// picture-in-picture presentation-mode extensions.

declare global {
    interface HlsInstance {
        loadSource(url: string): void;
        attachMedia(media: HTMLMediaElement): void;
        on(event: string, cb: () => void): void;
        destroy(): void;
    }

    interface HlsStatic {
        isSupported(): boolean;
        Events: { MANIFEST_PARSED: string; ERROR: string };
        new (config?: { xhrSetup?: (xhr: XMLHttpRequest) => void }): HlsInstance;
    }

    interface Window {
        Hls?: HlsStatic;
    }

    interface HTMLVideoElement {
        webkitSetPresentationMode?: (mode: 'picture-in-picture' | 'inline') => void;
        webkitPresentationMode?: string;
    }
}

export {};

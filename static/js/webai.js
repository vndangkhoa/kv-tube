/**
 * WebAI - Client-side AI features using Transformers.js
 */

// Suppress ONNX Runtime warnings
if (typeof ort !== 'undefined') {
    ort.env.logLevel = 'fatal';
}

class SubtitleGenerator {
    constructor() {
        this.pipeline = null;
        this.isLoading = false;
    }

    async init(progressCallback) {
        if (this.pipeline) return;
        if (this.isLoading) return;

        this.isLoading = true;

        try {
            // Suppress ONNX warnings at import time
            if (typeof ort !== 'undefined') {
                ort.env.logLevel = 'fatal';
            }

            progressCallback?.('Loading AI model...');

            const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');

            // Configure environment
            env.allowLocalModels = false;
            env.useBrowserCache = true;

            // Suppress ONNX Runtime warnings
            if (typeof ort !== 'undefined') {
                ort.env.logLevel = 'fatal';
            }

            progressCallback?.('Downloading Whisper model (~40MB)...');

            this.pipeline = await pipeline(
                'automatic-speech-recognition',
                'Xenova/whisper-tiny',
                {
                    progress_callback: (progress) => {
                        if (progress.status === 'downloading') {
                            const pct = Math.round((progress.loaded / progress.total) * 100);
                            progressCallback?.(`Downloading: ${pct}%`);
                        } else if (progress.status === 'loading') {
                            progressCallback?.('Loading model...');
                        }
                    }
                }
            );

            progressCallback?.('Model ready!');
        } catch (e) {
            console.error('Failed to load Whisper:', e);
            throw e;
        } finally {
            this.isLoading = false;
        }
    }

    async generate(audioUrl, progressCallback) {
        if (!this.pipeline) {
            throw new Error('Model not initialized. Call init() first.');
        }

        progressCallback?.('Transcribing audio...');

        try {
            const result = await this.pipeline(audioUrl, {
                chunk_length_s: 30,
                stride_length_s: 5,
                return_timestamps: true,
            });

            progressCallback?.('Formatting subtitles...');

            // Convert to VTT format
            return this.toVTT(result.chunks || []);
        } catch (e) {
            console.error('Transcription failed:', e);
            throw e;
        }
    }

    toVTT(chunks) {
        let vtt = 'WEBVTT\n\n';

        chunks.forEach((chunk, i) => {
            const start = this.formatTime(chunk.timestamp[0]);
            const end = this.formatTime(chunk.timestamp[1]);
            const text = chunk.text.trim();

            if (text) {
                vtt += `${i + 1}\n`;
                vtt += `${start} --> ${end}\n`;
                vtt += `${text}\n\n`;
            }
        });

        return vtt;
    }

    formatTime(seconds) {
        if (seconds === null || seconds === undefined) seconds = 0;
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = (seconds % 60).toFixed(3);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.padStart(6, '0')}`;
    }
}

// Export singleton
window.subtitleGenerator = new SubtitleGenerator();

/**
 * KV-Tube WebAI Service
 * Local AI chatbot for transcript Q&A using WebLLM
 * 
 * Runs entirely in-browser, no server required after model download
 */

// WebLLM CDN import (lazy loaded)
var WEBLLM_CDN = 'https://esm.run/@mlc-ai/web-llm';

// Model options - using verified WebLLM model IDs
var AI_MODELS = {
    small: { id: 'Qwen2-0.5B-Instruct-q4f16_1-MLC', name: 'Qwen2 (0.5B)', size: '350MB' },
    medium: { id: 'Qwen2-1.5B-Instruct-q4f16_1-MLC', name: 'Qwen2 (1.5B)', size: '1GB' },
};

// Default to small model
var DEFAULT_MODEL = AI_MODELS.small;

if (typeof TranscriptAI === 'undefined') {
    window.TranscriptAI = class TranscriptAI {
        constructor() {
            this.engine = null;
            this.isLoading = false;
            this.isReady = false;
            this.transcript = '';
            this.onProgressCallback = null;
            this.onReadyCallback = null;
        }

        setTranscript(text) {
            this.transcript = text.slice(0, 8000); // Limit context size
        }

        setCallbacks({ onProgress, onReady }) {
            this.onProgressCallback = onProgress;
            this.onReadyCallback = onReady;
        }

        async init() {
            if (this.isReady || this.isLoading) return;

            this.isLoading = true;

            try {
                // Dynamic import WebLLM
                const { CreateMLCEngine } = await import(WEBLLM_CDN);

                // Initialize engine with progress callback
                this.engine = await CreateMLCEngine(DEFAULT_MODEL.id, {
                    initProgressCallback: (report) => {
                        if (this.onProgressCallback) {
                            this.onProgressCallback(report);
                        }
                        console.log('AI Load Progress:', report.text);
                    }
                });

                this.isReady = true;
                this.isLoading = false;

                if (this.onReadyCallback) {
                    this.onReadyCallback();
                }

                console.log('TranscriptAI ready with model:', DEFAULT_MODEL.name);

            } catch (err) {
                this.isLoading = false;
                console.error('Failed to load AI model:', err);
                throw err;
            }
        }

        async ask(question) {
            if (!this.isReady) {
                throw new Error('AI not initialized');
            }

            const systemPrompt = this.transcript
                ? `You are a helpful AI assistant analyzing a video transcript. Answer the user's question based ONLY on the transcript content below. Be concise and direct. If the answer is not in the transcript, say so.\n\nTRANSCRIPT:\n${this.transcript}`
                : `You are a helpful AI assistant for KV-Tube, a lightweight YouTube client. You can help the user with general questions, explain features of the app, or chat casually. Be concise and helpful.`;

            try {
                const response = await this.engine.chat.completions.create({
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: question }
                    ],
                    max_tokens: 256,
                    temperature: 0.7,
                });

                return response.choices[0].message.content;

            } catch (err) {
                console.error('AI response error:', err);
                throw err;
            }
        }

        async *askStreaming(question) {
            if (!this.isReady) {
                throw new Error('AI not initialized');
            }

            const systemPrompt = this.transcript
                ? `You are a helpful AI assistant analyzing a video transcript. Answer the user's question based ONLY on the transcript content below. Be concise and direct. If the answer is not in the transcript, say so.\n\nTRANSCRIPT:\n${this.transcript}`
                : `You are a helpful AI assistant for KV-Tube, a lightweight YouTube client. You can help the user with general questions, explain features of the app, or chat casually. Be concise and helpful.`;

            const chunks = await this.engine.chat.completions.create({
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: question }
                ],
                max_tokens: 256,
                temperature: 0.7,
                stream: true,
            });

            for await (const chunk of chunks) {
                const delta = chunk.choices[0]?.delta?.content;
                if (delta) {
                    yield delta;
                }
            }
        }

        getModelInfo() {
            return DEFAULT_MODEL;
        }

        isModelReady() {
            return this.isReady;
        }

        isModelLoading() {
            return this.isLoading;
        }
    }

    // Global instance
    window.transcriptAI = new TranscriptAI();
}

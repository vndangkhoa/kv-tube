/**
 * WebLLM Service - Browser-based AI for Translation & Summarization
 * Uses MLC's WebLLM for on-device AI inference via WebGPU
 */

// Guard against redeclaration on SPA navigation
if (typeof WebLLMService === 'undefined') {

    class WebLLMService {
        constructor() {
            this.engine = null;
            this.isLoading = false;
            this.loadProgress = 0;
            this.currentModel = null;

            // Model configurations - Qwen2 chosen for Vietnamese support
            this.models = {
                'qwen2-0.5b': 'Qwen2-0.5B-Instruct-q4f16_1-MLC',
                'phi-3.5-mini': 'Phi-3.5-mini-instruct-q4f16_1-MLC',
                'smollm2': 'SmolLM2-360M-Instruct-q4f16_1-MLC'
            };

            // Default to lightweight Qwen2 for Vietnamese support
            this.selectedModel = 'qwen2-0.5b';

            // Callbacks
            this.onProgressCallback = null;
            this.onReadyCallback = null;
            this.onErrorCallback = null;
        }

        /**
         * Check if WebGPU is supported
         */
        static isSupported() {
            return 'gpu' in navigator;
        }

        /**
         * Initialize WebLLM with selected model
         * @param {string} modelKey - Model key from this.models
         * @param {function} onProgress - Progress callback (percent, status)
         * @returns {Promise<boolean>}
         */
        async init(modelKey = null, onProgress = null) {
            if (!WebLLMService.isSupported()) {
                console.warn('WebGPU not supported in this browser');
                if (this.onErrorCallback) {
                    this.onErrorCallback('WebGPU not supported. Using server-side AI.');
                }
                return false;
            }

            if (this.engine && this.currentModel === (modelKey || this.selectedModel)) {
                console.log('WebLLM already initialized with this model');
                return true;
            }

            this.isLoading = true;
            this.onProgressCallback = onProgress;

            try {
                // Dynamic import of WebLLM
                const webllm = await import('https://esm.run/@mlc-ai/web-llm');

                const modelId = this.models[modelKey || this.selectedModel];
                console.log('Loading WebLLM model:', modelId);

                // Progress callback wrapper
                const initProgressCallback = (progress) => {
                    this.loadProgress = Math.round(progress.progress * 100);
                    const status = progress.text || 'Loading model...';
                    console.log(`WebLLM: ${this.loadProgress}% - ${status}`);

                    if (this.onProgressCallback) {
                        this.onProgressCallback(this.loadProgress, status);
                    }
                };

                // Create engine
                this.engine = await webllm.CreateMLCEngine(modelId, {
                    initProgressCallback: initProgressCallback
                });

                this.currentModel = modelKey || this.selectedModel;
                this.isLoading = false;
                this.loadProgress = 100;

                console.log('WebLLM ready!');
                if (this.onReadyCallback) {
                    this.onReadyCallback();
                }

                return true;

            } catch (error) {
                console.error('WebLLM initialization failed:', error);
                this.isLoading = false;

                if (this.onErrorCallback) {
                    this.onErrorCallback(error.message);
                }

                return false;
            }
        }

        /**
         * Check if engine is ready
         */
        isReady() {
            return this.engine !== null && !this.isLoading;
        }

        /**
         * Summarize text using local AI
         * @param {string} text - Text to summarize
         * @param {string} language - Output language ('en' or 'vi')
         * @returns {Promise<string>}
         */
        async summarize(text, language = 'en') {
            if (!this.isReady()) {
                throw new Error('WebLLM not ready. Call init() first.');
            }

            // Truncate text to avoid token limits
            const maxChars = 4000;
            if (text.length > maxChars) {
                text = text.substring(0, maxChars) + '...';
            }

            const langInstruction = language === 'vi'
                ? 'Respond in Vietnamese (Tiếng Việt).'
                : 'Respond in English.';

            const messages = [
                {
                    role: 'system',
                    content: `You are a helpful AI assistant that creates detailed, insightful video summaries. ${langInstruction}`
                },
                {
                    role: 'user',
                    content: `Provide a comprehensive summary of this video transcript in 4-6 sentences. Include the main topic, key points discussed, and any important insights or conclusions. Make the summary informative and meaningful:\n\n${text}`
                }
            ];

            try {
                const response = await this.engine.chat.completions.create({
                    messages: messages,
                    temperature: 0.7,
                    max_tokens: 350
                });

                return response.choices[0].message.content.trim();

            } catch (error) {
                console.error('Summarization error:', error);
                throw error;
            }
        }

        /**
         * Translate text between English and Vietnamese
         * @param {string} text - Text to translate
         * @param {string} sourceLang - Source language ('en' or 'vi')
         * @param {string} targetLang - Target language ('en' or 'vi')
         * @returns {Promise<string>}
         */
        async translate(text, sourceLang = 'en', targetLang = 'vi') {
            if (!this.isReady()) {
                throw new Error('WebLLM not ready. Call init() first.');
            }

            const langNames = {
                'en': 'English',
                'vi': 'Vietnamese (Tiếng Việt)'
            };

            const messages = [
                {
                    role: 'system',
                    content: `You are a professional translator. Translate the following text from ${langNames[sourceLang]} to ${langNames[targetLang]}. Provide only the translation, no explanations.`
                },
                {
                    role: 'user',
                    content: text
                }
            ];

            try {
                const response = await this.engine.chat.completions.create({
                    messages: messages,
                    temperature: 0.3,
                    max_tokens: 500
                });

                return response.choices[0].message.content.trim();

            } catch (error) {
                console.error('Translation error:', error);
                throw error;
            }
        }

        /**
         * Extract key points from text
         * @param {string} text - Text to analyze
         * @param {string} language - Output language
         * @returns {Promise<string[]>}
         */
        async extractKeyPoints(text, language = 'en') {
            if (!this.isReady()) {
                throw new Error('WebLLM not ready. Call init() first.');
            }

            const maxChars = 3000;
            if (text.length > maxChars) {
                text = text.substring(0, maxChars) + '...';
            }

            const langInstruction = language === 'vi'
                ? 'Respond in Vietnamese.'
                : 'Respond in English.';

            const messages = [
                {
                    role: 'system',
                    content: `You extract the main IDEAS and CONCEPTS from video content. ${langInstruction} Focus on:
- Main topics discussed
- Key insights or takeaways  
- Important facts or claims
- Conclusions or recommendations

Do NOT copy sentences from the transcript. Instead, synthesize the core ideas in your own words. List 3-5 key points, one per line, without bullet points or numbers.`
                },
                {
                    role: 'user',
                    content: `What are the main ideas and takeaways from this video transcript?\n\n${text}`
                }
            ];

            try {
                const response = await this.engine.chat.completions.create({
                    messages: messages,
                    temperature: 0.6,
                    max_tokens: 400
                });

                const content = response.choices[0].message.content.trim();
                const points = content.split('\n')
                    .map(line => line.replace(/^[\d\.\-\*\•]+\s*/, '').trim())
                    .filter(line => line.length > 10);

                return points.slice(0, 5);

            } catch (error) {
                console.error('Key points extraction error:', error);
                throw error;
            }
        }

        /**
         * Stream chat completion for real-time output
         * @param {string} prompt - User prompt
         * @param {function} onChunk - Callback for each chunk
         * @returns {Promise<string>}
         */
        async streamChat(prompt, onChunk) {
            if (!this.isReady()) {
                throw new Error('WebLLM not ready.');
            }

            const messages = [
                { role: 'user', content: prompt }
            ];

            try {
                const chunks = await this.engine.chat.completions.create({
                    messages: messages,
                    temperature: 0.7,
                    stream: true
                });

                let fullResponse = '';
                for await (const chunk of chunks) {
                    const delta = chunk.choices[0]?.delta?.content || '';
                    fullResponse += delta;
                    if (onChunk) {
                        onChunk(delta, fullResponse);
                    }
                }

                return fullResponse;

            } catch (error) {
                console.error('Stream chat error:', error);
                throw error;
            }
        }

        /**
         * Get available models
         */
        getModels() {
            return Object.keys(this.models).map(key => ({
                id: key,
                name: this.models[key],
                selected: key === this.selectedModel
            }));
        }

        /**
         * Set selected model (requires re-init)
         */
        setModel(modelKey) {
            if (this.models[modelKey]) {
                this.selectedModel = modelKey;
                // Reset engine to force reload with new model
                this.engine = null;
                this.currentModel = null;
            }
        }

        /**
         * Cleanup and release resources
         */
        async destroy() {
            if (this.engine) {
                // WebLLM doesn't have explicit destroy, but we can nullify
                this.engine = null;
                this.currentModel = null;
                this.loadProgress = 0;
            }
        }
    }

    // Global singleton instance
    window.webLLMService = new WebLLMService();

    // Export for module usage
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = WebLLMService;
    }

} // End guard block for WebLLMService

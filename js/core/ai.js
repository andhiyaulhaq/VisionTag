import { state } from './state.js';
import { ResizeLongestSide, PromptEncoder } from './sam_utils.js';

// Use the global 'ort' from the script tag to ensure JS and WASM versions match perfectly
const ort = globalThis.ort;

/**
 * SharpTensor AI Engine
 * Handles background model inference and embedding management.
 */
export class AIEngine {
    constructor() {
        this.samDecoderSession = null;
        this.promptEncoder = null;
        this.worker = null;
        
        this.isLoaded = false;
        this.isWorkerReady = false;
        
        // Context-specific state
        this.activeKey = null; // The image currently being processed for segmentation
        this.rtdetrConfig = null;
        
        this.samTransform = new ResizeLongestSide(1024);
        this.embeddingCache = new Map(); // Key -> { embeddings, width, height }
        this.pendingCacheKeys = new Set();
        this.pendingDetections = new Map(); // requestId -> resolve

        this.initWorker();
    }

    initWorker() {
        if (this.worker) return;
        this.worker = new Worker(new URL('./ai.worker.js', import.meta.url));
        this.worker.onmessage = (e) => this.handleWorkerMessage(e);
    }

    handleWorkerMessage(e) {
        const { type, payload } = e.data;
        
        if (type === 'initialized') {
            this.isWorkerReady = true;
            console.log('👷 AI Worker: Background engines ready');
        }

        if (type === 'encoded') {
            const { embeddings, dims, cacheKey, latency } = payload;
            if (cacheKey) this.pendingCacheKeys.delete(cacheKey);

            // Store in the isolated cache
            const tensor = new ort.Tensor('float32', embeddings, dims);
            
            // We need to know the original dimensions to store with the embeddings
            // These are retrieved from the pending task metadata or active state
            const metadata = this.embeddingCache.get(cacheKey) || {};
            
            this.embeddingCache.set(cacheKey, { 
                ...metadata,
                embeddings: tensor
            });

            // Update global state only if this is the ACTIVE image
            if (cacheKey === this.activeKey) {
                state.set({ modelStatus: 'ready' });
            }
            
            // Maintenance: keep cache at 15
            if (this.embeddingCache.size > 15) {
                const oldestKey = this.embeddingCache.keys().next().value;
                this.embeddingCache.delete(oldestKey);
            }

            this.log(`🖼️ ${cacheKey} encoded (${latency.toFixed(0)}ms)`);
        }

        if (type === 'detected') {
            const { detections, requestId, latency } = payload;
            const resolve = this.pendingDetections.get(requestId);
            if (resolve) {
                this.pendingDetections.delete(requestId);
                resolve(detections);
            }
            this.log(`🎯 Found ${detections.length} objects (${latency.toFixed(0)}ms)`);
        }

        if (type === 'error') {
            this.log(`❌ Worker error: ${payload}`, 'error');
            state.set({ modelStatus: 'error' });
        }
    }

    log(msg, type = 'info') {
        const event = new CustomEvent('ai-log', {
            detail: {
                message: msg,
                type: type,
                time: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
            }
        });
        window.dispatchEvent(event);
    }

    async loadModels() {
        try {
            state.set({ modelStatus: 'loading' });
            this.worker.postMessage({
                type: 'init',
                payload: { 
                    samUrl: '/models/mobilesam_encoder.onnx',
                    rtdetrUrl: '/models/rtdetr.onnx'
                }
            });

            const configResp = await fetch('/models/rtdetr_config.json');
            this.rtdetrConfig = await configResp.json();
            
            const options = { executionProviders: ['wasm'], numThreads: self.navigator.hardwareConcurrency || 4 };
            this.samDecoderSession = await ort.InferenceSession.create('/models/mobilesam_decoder.onnx', options);

            const weightsResp = await fetch('/models/mobilesam_prompt_encoder_weights.json');
            const weights = await weightsResp.json();
            this.promptEncoder = new PromptEncoder(weights);

            this.isLoaded = true;
            state.set({ 
                modelStatus: 'ready',
                aiModel: { name: 'RT-DETR + MobileSAM (Worker Optimized)' }
            });
            this.log('✅ AI Engines Loaded (Hybrid Mode)');
        } catch (err) {
            this.log(`❌ Load error: ${err.message}`, 'error');
            state.set({ modelStatus: 'error' });
            throw err;
        }
    }

    detect(bitmap) {
        if (!this.isLoaded) return Promise.resolve([]);
        const requestId = Math.random().toString(36).substr(2, 9);
        
        return new Promise((resolve) => {
            this.pendingDetections.set(requestId, resolve);
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(bitmap, 0, 0);
            const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);

            this.worker.postMessage({
                type: 'detect',
                payload: { imageData, width: bitmap.width, height: bitmap.height, requestId }
            }, [imageData.data.buffer]);
        });
    }

    /**
     * Prepare SAM for a specific image (can be active or background warmup)
     */
    async setSAMImage(bitmap, cacheKey) {
        if (!this.isLoaded || !cacheKey) return;
        
        // 1. If we are setting the ACTIVE image, update the key
        const isActive = state.currentImage && state.currentImage.name === cacheKey;
        if (isActive) {
            this.activeKey = cacheKey;
        }

        // 2. Check if already in cache
        if (this.embeddingCache.has(cacheKey)) {
            const entry = this.embeddingCache.get(cacheKey);
            if (entry.embeddings && isActive) {
                state.set({ modelStatus: 'ready' });
            }
            return;
        }

        // 3. Prevent redundant tasks
        if (this.pendingCacheKeys.has(cacheKey)) return;

        // 4. Register metadata (dims) before sending to worker
        this.embeddingCache.set(cacheKey, { width: bitmap.width, height: bitmap.height });
        this.pendingCacheKeys.add(cacheKey);
        
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);

        const isPreload = !isActive;
        this.log(`${isPreload ? '💤 Warmup' : '🍳 Active'} encoding: ${cacheKey}...`);
        
        if (isActive) {
            state.set({ modelStatus: 'processing' });
        }

        this.worker.postMessage({
            type: 'encode',
            payload: { imageData, width: bitmap.width, height: bitmap.height, cacheKey }
        }, [imageData.data.buffer]);
    }

    /**
     * Run prediction using the context-specific embeddings from cache
     */
    async predictSAMMask(points = null, boxes = null) {
        if (!this.activeKey || !this.embeddingCache.has(this.activeKey)) return null;
        
        const entry = this.embeddingCache.get(this.activeKey);
        if (!entry.embeddings) return null;

        const start = performance.now();
        const origSize = [entry.height, entry.width];
        
        let tp = null;
        if (points) tp = { coords: this.samTransform.applyCoords(points.coords, origSize), labels: points.labels };
        let tb = null;
        if (boxes) tb = this.samTransform.applyBoxes(boxes, origSize);

        const { sparse, sparseDims, dense, denseDims } = this.promptEncoder.encode(tp, tb);
        const results = await this.samDecoderSession.run({
            image_embeddings: entry.embeddings,
            sparse_embeddings: new ort.Tensor('float32', sparse, sparseDims),
            dense_embeddings: new ort.Tensor('float32', dense, denseDims)
        });
        
        const maskOnnx = results[this.samDecoderSession.outputNames[0]];
        const mask = this.postprocessMask(maskOnnx.data, maskOnnx.dims, origSize[0], origSize[1]);
        return mask;
    }

    postprocessMask(data, dims, h, w) {
        const maskSize = 256;
        const longSide = Math.max(h, w);
        const scale = 1024 / longSide;
        const nh = h * scale;
        const nw = w * scale;
        const maskW = (nw / 1024) * maskSize;
        const maskH = (nh / 1024) * maskSize;

        const canvas = document.createElement('canvas');
        canvas.width = maskSize;
        canvas.height = maskSize;
        const ctx = canvas.getContext('2d');
        const imgData = ctx.createImageData(maskSize, maskSize);
        
        for (let i = 0; i < data.length; i++) {
            const val = data[i] > 0 ? 255 : 0;
            imgData.data[i * 4] = val;
            imgData.data[i * 4 + 1] = val;
            imgData.data[i * 4 + 2] = val;
            imgData.data[i * 4 + 3] = 255;
        }
        ctx.putImageData(imgData, 0, 0);

        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = w;
        finalCanvas.height = h;
        const fctx = finalCanvas.getContext('2d');
        fctx.drawImage(canvas, 0, 0, maskW, maskH, 0, 0, w, h);
        
        return fctx.getImageData(0, 0, w, h).data.filter((_, i) => i % 4 === 0).map(v => v > 128 ? 1 : 0);
    }
}

export const ai = new AIEngine();

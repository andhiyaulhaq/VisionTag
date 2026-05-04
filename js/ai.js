import { state } from './state.js';

// Use the global 'ort' from the script tag to ensure JS and WASM versions match perfectly
const ort = globalThis.ort;

/**
 * VisionTag AI Engine
 * Handles YOLOv8/v11 inference via ONNX Runtime Web.
 */
export class AIEngine {
    constructor() {
        this.session = null;
        this.inputShape = [1, 3, 640, 640];
        this.isLoaded = false;
        
        // Default COCO classes for the bundled model
        this.cocoClasses = [
            'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat', 'traffic light',
            'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat', 'dog', 'horse', 'sheep', 'cow',
            'elephant', 'bear', 'zebra', 'giraffe', 'backpack', 'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee',
            'skis', 'snowboard', 'sports ball', 'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard',
            'tennis racket', 'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
            'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair', 'couch',
            'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse', 'remote', 'keyboard', 'cell phone',
            'microwave', 'oven', 'toaster', 'sink', 'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear',
            'hair drier', 'toothbrush'
        ];
    }

    /**
     * Load the ONNX model
     */
    async loadModel(modelSource) {
        try {
            state.set({ modelStatus: 'loading' });
            console.log('🧠 AI: Loading model...', modelSource);

            const options = {
                executionProviders: ['webgl', 'wasm'], // Prefer GPU (WebGL), fallback to WASM
            };

            if (modelSource instanceof File) {
                const buffer = await modelSource.arrayBuffer();
                this.session = await ort.InferenceSession.create(buffer, options);
            } else {
                // Load from URL (default model)
                this.session = await ort.InferenceSession.create(modelSource, options);
            }

            this.isLoaded = true;
            state.set({ 
                modelStatus: 'ready',
                aiModel: { name: modelSource instanceof File ? modelSource.name : 'YOLOv8n (Default)' }
            });
            console.log('✅ AI: Model ready');
        } catch (err) {
            console.error('❌ AI: Failed to load model:', err);
            state.set({ modelStatus: 'error' });
            throw err;
        }
    }

    /**
     * Run inference on an image
     * @param {ImageBitmap} bitmap 
     * @returns {Array} Annotations
     */
    async predict(bitmap) {
        if (!this.isLoaded) return [];

        const { input, ratio, pad } = await this.preprocess(bitmap);
        
        const feeds = {};
        feeds[this.session.inputNames[0]] = input;
        
        const results = await this.session.run(feeds);
        const output = results[this.session.outputNames[0]];
        
        return this.postprocess(output.data, bitmap.width, bitmap.height, ratio, pad);
    }

    /**
     * Prepare image for YOLO (resize, padding, normalization)
     */
    async preprocess(bitmap) {
        const [batch, channels, height, width] = this.inputShape;
        
        // 1. Resize and Pad (Letterbox)
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        const r = Math.min(width / bitmap.width, height / bitmap.height);
        const nw = bitmap.width * r;
        const nh = bitmap.height * r;
        const dw = (width - nw) / 2;
        const dh = (height - nh) / 2;
        
        ctx.fillStyle = '#727272'; // Neutral grey padding
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(bitmap, dw, dh, nw, nh);
        
        const imageData = ctx.getImageData(0, 0, width, height);
        const { data } = imageData;
        
        // 2. Normalize and HWC to CHW
        const floatData = new Float32Array(width * height * channels);
        for (let i = 0; i < data.length / 4; i++) {
            floatData[i] = data[i * 4] / 255.0; // R
            floatData[i + width * height] = data[i * 4 + 1] / 255.0; // G
            floatData[i + width * height * 2] = data[i * 4 + 2] / 255.0; // B
        }
        
        return {
            input: new ort.Tensor('float32', floatData, this.inputShape),
            ratio: r,
            pad: { x: dw, y: dh }
        };
    }

    /**
     * Parse YOLOv8 output tensor
     */
    postprocess(data, origW, origH, ratio, pad) {
        const boxes = [];
        const threshold = 0.45;
        
        // YOLOv8 output: [1, 84, 8400]
        // 0-3: box (x,y,w,h)
        // 4-83: class scores
        const numClasses = 80;
        const numPredictions = 8400;
        
        for (let i = 0; i < numPredictions; i++) {
            let maxScore = -1;
            let classId = -1;
            
            for (let c = 0; c < numClasses; c++) {
                const score = data[numPredictions * (c + 4) + i];
                if (score > maxScore) {
                    maxScore = score;
                    classId = c;
                }
            }
            
            if (maxScore > threshold) {
                const cx = data[numPredictions * 0 + i];
                const cy = data[numPredictions * 1 + i];
                const w = data[numPredictions * 2 + i];
                const h = data[numPredictions * 3 + i];
                
                // Rescale to image coords
                const x = (cx - w / 2 - pad.x) / ratio;
                const y = (cy - h / 2 - pad.y) / ratio;
                const width = w / ratio;
                const height = h / ratio;
                
                boxes.push({
                    id: Math.random(),
                    classId: classId,
                    x, y, width, height,
                    score: maxScore
                });
            }
        }
        
        return this.nonMaxSuppression(boxes, 0.45);
    }

    /**
     * Simple NMS implementation
     */
    nonMaxSuppression(boxes, iouThreshold) {
        boxes.sort((a, b) => b.score - a.score);
        const selected = [];
        const active = new Array(boxes.length).fill(true);
        
        for (let i = 0; i < boxes.length; i++) {
            if (!active[i]) continue;
            
            selected.push(boxes[i]);
            
            for (let j = i + 1; j < boxes.length; j++) {
                if (!active[j]) continue;
                
                if (this.calculateIoU(boxes[i], boxes[j]) > iouThreshold) {
                    active[j] = false;
                }
            }
        }
        
        return selected;
    }

    calculateIoU(box1, box2) {
        const x1 = Math.max(box1.x, box2.x);
        const y1 = Math.max(box1.y, box2.y);
        const x2 = Math.min(box1.x + box1.width, box2.x + box2.width);
        const y2 = Math.min(box1.y + box1.height, box2.y + box2.height);
        
        const width = Math.max(0, x2 - x1);
        const height = Math.max(0, y2 - y1);
        const intersection = width * height;
        
        const union = box1.width * box1.height + box2.width * box2.height - intersection;
        return intersection / union;
    }
}

export const ai = new AIEngine();

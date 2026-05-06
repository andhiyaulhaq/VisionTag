/**
 * SharpTensor AI Background Worker
 * Handles heavy MobileSAM Encoder and RT-DETR Detection to prevent UI freezing.
 */

importScripts('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/ort.min.js');

// Configure WASM paths
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/';

let samEncoderSession = null;
let rtdetrSession = null;

/**
 * Normalization logic for SAM
 */
function preprocessSAM(imageData) {
    const size = 1024;
    const pixelMean = [123.675, 116.28, 103.53];
    const pixelStd = [58.395, 57.12, 57.375];
    
    const floatData = new Float32Array(size * size * 3);
    const { data } = imageData;

    for (let i = 0; i < data.length / 4; i++) {
        floatData[i] = (data[i * 4] - pixelMean[0]) / pixelStd[0];
        floatData[i + size * size] = (data[i * 4 + 1] - pixelMean[1]) / pixelStd[1];
        floatData[i + size * size * 2] = (data[i * 4 + 2] - pixelMean[2]) / pixelStd[2];
    }
    
    return new ort.Tensor('float32', floatData, [1, 3, size, size]);
}

/**
 * Normalization logic for RT-DETR
 */
function preprocessDet(imageData) {
    const size = 640;
    const { data } = imageData;
    const floatData = new Float32Array(size * size * 3);
    
    for (let i = 0; i < data.length / 4; i++) {
        floatData[i] = data[i * 4] / 255.0;
        floatData[i + size * size] = data[i * 4 + 1] / 255.0;
        floatData[i + size * size * 2] = data[i * 4 + 2] / 255.0;
    }
    
    return new ort.Tensor('float32', floatData, [1, 3, size, size]);
}

function nonMaxSuppression(boxes, iouThreshold) {
    const sorted = boxes.sort((a, b) => b.score - a.score);
    const selected = [];
    const active = new Array(boxes.length).fill(true);

    for (let i = 0; i < sorted.length; i++) {
        if (!active[i]) continue;
        selected.push(sorted[i]);

        for (let j = i + 1; j < sorted.length; j++) {
            if (!active[j]) continue;
            if (calculateIoU(sorted[i], sorted[j]) > iouThreshold) {
                active[j] = false;
            }
        }
    }
    return selected;
}

function calculateIoU(box1, box2) {
    const x1 = Math.max(box1.x, box2.x);
    const y1 = Math.max(box1.y, box2.y);
    const x2 = Math.min(box1.x + box1.width, box2.x + box2.width);
    const y2 = Math.min(box1.y + box1.height, box2.y + box2.height);

    const w = Math.max(0, x2 - x1);
    const h = Math.max(0, y2 - y1);
    const inter = w * h;
    const area1 = box1.width * box1.height;
    const area2 = box2.width * box2.height;
    return inter / (area1 + area2 - inter);
}

self.onmessage = async (event) => {
    const { type, payload } = event.data;

    try {
        if (type === 'init') {
            const { samUrl, rtdetrUrl } = payload;
            const numThreads = self.navigator.hardwareConcurrency || 4;
            
            const initTasks = [];
            
            if (samUrl && !samEncoderSession) {
                initTasks.push((async () => {
                    const [modelBuf, dataBuf] = await Promise.all([
                        fetch(samUrl).then(r => r.arrayBuffer()),
                        fetch(samUrl + '.data').then(r => r.arrayBuffer())
                    ]);
                    samEncoderSession = await ort.InferenceSession.create(new Uint8Array(modelBuf), {
                        executionProviders: ['wasm'],
                        numThreads,
                        externalData: [{ path: 'mobilesam_encoder.onnx.data', data: new Uint8Array(dataBuf) }]
                    });
                })());
            }

            if (rtdetrUrl && !rtdetrSession) {
                initTasks.push((async () => {
                    rtdetrSession = await ort.InferenceSession.create(rtdetrUrl, {
                        executionProviders: ['wasm'],
                        numThreads
                    });
                })());
            }

            await Promise.all(initTasks);
            self.postMessage({ type: 'initialized' });
        }

        if (type === 'encode') {
            const { imageData, width, height, cacheKey } = payload;
            const start = performance.now();
            
            // Resize for SAM (1024x1024)
            const canvas = new OffscreenCanvas(1024, 1024);
            const ctx = canvas.getContext('2d');
            const bitmap = await createImageBitmap(imageData);
            
            // Calculate scale to fit
            const scale = 1024 / Math.max(height, width);
            const nw = width * scale;
            const nh = height * scale;
            
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, 1024, 1024);
            ctx.drawImage(bitmap, 0, 0, nw, nh);
            
            const samImageData = ctx.getImageData(0, 0, 1024, 1024);
            const input = preprocessSAM(samImageData);
            const outputs = await samEncoderSession.run({ images: input });
            const embeddings = outputs[samEncoderSession.outputNames[0]];
            
            self.postMessage({
                type: 'encoded',
                payload: { embeddings: embeddings.data, dims: embeddings.dims, cacheKey, latency: performance.now() - start }
            }, [embeddings.data.buffer]);
        }

        if (type === 'detect') {
            const { imageData, width, height, requestId } = payload;
            const start = performance.now();
            
            // Resize for RT-DETR (640x640)
            const canvas = new OffscreenCanvas(640, 640);
            const ctx = canvas.getContext('2d');
            const bitmap = await createImageBitmap(imageData);
            
            const r = Math.min(640 / width, 640 / height);
            const nw = width * r;
            const nh = height * r;
            const dw = (640 - nw) / 2;
            const dh = (640 - nh) / 2;
            
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, 640, 640);
            ctx.drawImage(bitmap, dw, dh, nw, nh);
            
            const detImageData = ctx.getImageData(0, 0, 640, 640);
            const input = preprocessDet(detImageData);
            const results = await rtdetrSession.run({ images: input });
            
            const logits = results[rtdetrSession.outputNames[0]].data;
            const boxesRaw = results[rtdetrSession.outputNames[1]].data;
            const numPredictions = results[rtdetrSession.outputNames[1]].dims[1];
            const numClasses = results[rtdetrSession.outputNames[0]].dims[2];
            
            const candidates = [];
            for (let i = 0; i < numPredictions; i++) {
                let maxScore = -1;
                let classId = -1;
                for (let c = 0; c < numClasses; c++) {
                    const score = 1 / (1 + Math.exp(-logits[i * numClasses + c]));
                    if (score > maxScore) { maxScore = score; classId = c; }
                }
                
                if (maxScore > 0.5) {
                    const cx = boxesRaw[i * 4] * 640;
                    const cy = boxesRaw[i * 4 + 1] * 640;
                    const w = boxesRaw[i * 4 + 2] * 640;
                    const h = boxesRaw[i * 4 + 3] * 640;
                    candidates.push({
                        id: Math.random(),
                        classId,
                        x: (cx - w/2 - dw) / r,
                        y: (cy - h/2 - dh) / r,
                        width: w / r,
                        height: h / r,
                        score: maxScore
                    });
                }
            }
            
            const finalDetections = nonMaxSuppression(candidates, 0.45);
            self.postMessage({
                type: 'detected',
                payload: { detections: finalDetections, requestId, latency: performance.now() - start }
            });
        }
    } catch (err) {
        self.postMessage({ type: 'error', payload: err.message });
    }
};

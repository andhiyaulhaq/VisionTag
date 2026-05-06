/**
 * MobileSAM Utilities
 * Ported from reference/src/main.py (Python) to JavaScript
 */

export class ResizeLongestSide {
    constructor(targetLength) {
        this.targetLength = targetLength;
    }

    /**
     * Get shape after resizing longest side
     */
    static getPreprocessShape(oldH, oldW, longSideLength) {
        const scale = longSideLength * 1.0 / Math.max(oldH, oldW);
        const newH = Math.floor(oldH * scale + 0.5);
        const newW = Math.floor(oldW * scale + 0.5);
        return [newH, newW];
    }

    applyCoords(coords, originalSize) {
        const [oldH, oldW] = originalSize;
        const [newH, newW] = ResizeLongestSide.getPreprocessShape(oldH, oldW, this.targetLength);
        
        // coords is array of [x, y]
        return coords.map(([x, y]) => [
            x * (newW / oldW),
            y * (newH / oldH)
        ]);
    }

    applyBoxes(boxes, originalSize) {
        // boxes is array of [x1, y1, x2, y2]
        const [oldH, oldW] = originalSize;
        const [newH, newW] = ResizeLongestSide.getPreprocessShape(oldH, oldW, this.targetLength);
        
        return boxes.map(b => [
            b[0] * (newW / oldW),
            b[1] * (newH / oldH),
            b[2] * (newW / oldW),
            b[3] * (newH / oldH)
        ]);
    }
}

export class PromptEncoder {
    constructor(weights) {
        this.peMatrix = weights['model.pe_layer.positional_encoding_gaussian_matrix'];
        this.pointEmbeddings = [
            weights['model.point_embeddings.0.weight'],
            weights['model.point_embeddings.1.weight'],
            weights['model.point_embeddings.2.weight'],
            weights['model.point_embeddings.3.weight']
        ];
        this.notAPointEmbed = weights['model.not_a_point_embed.weight'];
        this.noMaskEmbed = weights['model.no_mask_embed.weight'] || new Array(256).fill(0);
        
        this.embedDim = 256;
        this.inputImageSize = [1024, 1024];
        this.imageEmbeddingSize = [64, 64];
    }

    /**
     * Matrix multiplication for Positional Encoding
     */
    _peEncoding(coords) {
        // coords is [N, 2] normalized to [0, 1]
        const n = coords.length;
        const peCols = this.peMatrix[0].length;
        const encoded = new Float32Array(n * peCols * 2);

        for (let i = 0; i < n; i++) {
            const x = 2 * coords[i][0] - 1;
            const y = 2 * coords[i][1] - 1;

            for (let j = 0; j < peCols; j++) {
                const val = (x * this.peMatrix[0][j] + y * this.peMatrix[1][j]) * 2 * Math.PI;
                encoded[i * peCols * 2 + j] = Math.sin(val);
                encoded[i * peCols * 2 + j + peCols] = Math.cos(val);
            }
        }
        return encoded;
    }

    forwardWithCoords(coords, imageSize) {
        const normalized = coords.map(([x, y]) => [
            x / imageSize[1],
            y / imageSize[0]
        ]);
        return this._peEncoding(normalized);
    }

    encode(points, boxes) {
        const sparseEmbeddings = []; 
        
        if (points) {
            const { coords, labels } = points;
            let finalCoords = [...coords];
            let finalLabels = [...labels];
            
            if (!boxes) {
                finalCoords.push([0, 0]);
                finalLabels.push(-1);
            }

            const pe = this.forwardWithCoords(finalCoords.map(c => [c[0] + 0.5, c[1] + 0.5]), this.inputImageSize);
            const numPoints = finalCoords.length;
            const peCols = this.peMatrix[0].length * 2;

            for (let i = 0; i < numPoints; i++) {
                const label = finalLabels[i];
                let embedding = new Float32Array(this.embedDim);
                for (let j = 0; j < peCols; j++) embedding[j] = pe[i * peCols + j];
                
                let learned;
                if (label === -1) learned = this.notAPointEmbed[0];
                else if (label === 0) learned = this.pointEmbeddings[0][0];
                else if (label === 1) learned = this.pointEmbeddings[1][0];
                
                if (learned) {
                    for (let j = 0; j < this.embedDim; j++) embedding[j] += learned[j];
                }
                sparseEmbeddings.push(embedding);
            }
        }

        if (boxes) {
            const b = boxes[0];
            const corners = [[b[0] + 0.5, b[1] + 0.5], [b[2] + 0.5, b[3] + 0.5]];
            const pe = this.forwardWithCoords(corners, this.inputImageSize);
            const peCols = this.peMatrix[0].length * 2;

            for (let i = 0; i < 2; i++) {
                let embedding = new Float32Array(this.embedDim);
                for (let j = 0; j < peCols; j++) embedding[j] = pe[i * peCols + j];
                
                const learned = this.pointEmbeddings[i + 2][0];
                for (let j = 0; j < this.embedDim; j++) embedding[j] += learned[j];
                sparseEmbeddings.push(embedding);
            }
        }

        const flattenedSparse = new Float32Array(sparseEmbeddings.length * this.embedDim);
        for (let i = 0; i < sparseEmbeddings.length; i++) {
            flattenedSparse.set(sparseEmbeddings[i], i * this.embedDim);
        }

        const denseSize = this.imageEmbeddingSize[0] * this.imageEmbeddingSize[1] * 256;
        const denseEmbeddings = new Float32Array(denseSize);
        const noMask = this.noMaskEmbed[0];
        for (let i = 0; i < denseSize / 256; i++) {
            denseEmbeddings.set(noMask, i * 256);
        }

        return {
            sparse: flattenedSparse,
            sparseDims: [1, sparseEmbeddings.length, 256],
            dense: denseEmbeddings,
            denseDims: [1, 256, this.imageEmbeddingSize[0], this.imageEmbeddingSize[1]]
        };
    }
}

/**
 * ContourTracer
 * Converts binary mask to simplified polygon
 */
export class ContourTracer {
    /**
     * Trace the boundary of a mask and return a simplified polygon
     * @param {Uint8Array} mask 
     * @param {number} width 
     * @param {number} height 
     */
    static trace(mask, width, height) {
        // Find starting pixel
        let startIdx = -1;
        for (let i = 0; i < mask.length; i++) {
            if (mask[i] === 1) {
                startIdx = i;
                break;
            }
        }

        if (startIdx === -1) return null;

        const startX = startIdx % width;
        const startY = Math.floor(startIdx / width);

        // Moore-Neighbor Tracing
        const points = [];
        let currX = startX;
        let currY = startY;
        let prevX = startX - 1;
        let prevY = startY;

        const directions = [
            [0, -1], [1, -1], [1, 0], [1, 1],
            [0, 1], [-1, 1], [-1, 0], [-1, -1]
        ];

        let count = 0;
        const maxIter = mask.length; // Safety break

        while (count < maxIter) {
            points.push([currX, currY]);

            // Find index of previous neighbor
            let startDir = 0;
            for (let i = 0; i < 8; i++) {
                if (currX + directions[i][0] === prevX && currY + directions[i][1] === prevY) {
                    startDir = (i + 1) % 8;
                    break;
                }
            }

            let found = false;
            for (let i = 0; i < 8; i++) {
                const dirIdx = (startDir + i) % 8;
                const nextX = currX + directions[dirIdx][0];
                const nextY = currY + directions[dirIdx][1];

                if (nextX >= 0 && nextX < width && nextY >= 0 && nextY < height) {
                    if (mask[nextY * width + nextX] === 1) {
                        prevX = currX;
                        prevY = currY;
                        currX = nextX;
                        currY = nextY;
                        found = true;
                        break;
                    } else {
                        // Track last non-mask neighbor to know where to start next search
                        prevX = nextX;
                        prevY = nextY;
                    }
                }
            }

            if (!found || (currX === startX && currY === startY)) break;
            count++;
        }

        return this.simplify(points, 1.5);
    }

    /**
     * Douglas-Peucker simplification
     */
    static simplify(points, tolerance) {
        if (points.length <= 2) return points;

        const sqTolerance = tolerance * tolerance;
        const simplifyStep = (pts, first, last) => {
            let maxSqDist = 0;
            let index = 0;

            for (let i = first + 1; i < last; i++) {
                const sqDist = this.getSqSegDist(pts[i], pts[first], pts[last]);
                if (sqDist > maxSqDist) {
                    index = i;
                    maxSqDist = sqDist;
                }
            }

            if (maxSqDist > sqTolerance) {
                const res1 = simplifyStep(pts, first, index);
                const res2 = simplifyStep(pts, index, last);
                return res1.slice(0, res1.length - 1).concat(res2);
            } else {
                return [pts[first], pts[last]];
            }
        };

        return simplifyStep(points, 0, points.length - 1);
    }

    static getSqSegDist(p, p1, p2) {
        let x = p1[0], y = p1[1], dx = p2[0] - x, dy = p2[1] - y;
        if (dx !== 0 || dy !== 0) {
            let t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
            if (t > 1) {
                x = p2[0]; y = p2[1];
            } else if (t > 0) {
                x += dx * t; y += dy * t;
            }
        }
        dx = p[0] - x; dy = p[1] - y;
        return dx * dx + dy * dy;
    }
}

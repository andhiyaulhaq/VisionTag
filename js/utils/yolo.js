/**
 * YOLO Format Utilities
 * Handles normalization, serialization, and parsing.
 */

export const YoloHelper = {
    /**
     * Convert pixel coordinates to normalized YOLO format
     */
    toYolo(box, imgWidth, imgHeight) {
        const xCenter = (box.x + box.width / 2) / imgWidth;
        const yCenter = (box.y + box.height / 2) / imgHeight;
        const width = box.width / imgWidth;
        const height = box.height / imgHeight;

        return `${box.classId} ${xCenter.toFixed(6)} ${yCenter.toFixed(6)} ${width.toFixed(6)} ${height.toFixed(6)}`;
    },

    /**
     * Convert polygon to normalized YOLO segmentation format
     */
    toYoloSeg(box, imgWidth, imgHeight) {
        if (!box.polygon) return this.toYolo(box, imgWidth, imgHeight);
        
        const coords = box.polygon.map(([x, y]) => 
            `${(x / imgWidth).toFixed(6)} ${(y / imgHeight).toFixed(6)}`
        ).join(' ');
        
        return `${box.classId} ${coords}`;
    },

    /**
     * Parse a YOLO string back to pixel coordinates
     */
    fromYolo(line, imgWidth, imgHeight) {
        const parts = line.trim().split(/\s+/).map(Number);
        if (parts.length < 5) return null;

        const classId = parts[0];

        if (parts.length === 5) {
            // Standard Box
            const [, xCenter, yCenter, width, height] = parts;
            return {
                id: Date.now() + Math.random(),
                classId,
                x: (xCenter - width / 2) * imgWidth,
                y: (yCenter - height / 2) * imgHeight,
                width: width * imgWidth,
                height: height * imgHeight
            };
        } else {
            // Polygon (Segmentation)
            const coords = [];
            for (let i = 1; i < parts.length; i += 2) {
                coords.push([parts[i] * imgWidth, parts[i+1] * imgHeight]);
            }
            
            // Calculate bounding box for the polygon
            const xs = coords.map(p => p[0]);
            const ys = coords.map(p => p[1]);
            const x1 = Math.min(...xs);
            const y1 = Math.min(...ys);
            const x2 = Math.max(...xs);
            const y2 = Math.max(...ys);

            return {
                id: Date.now() + Math.random(),
                classId,
                x: x1,
                y: y1,
                width: x2 - x1,
                height: y2 - y1,
                polygon: coords
            };
        }
    },

    /**
     * Parse classes.txt
     */
    parseClasses(content) {
        return content.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map((name, id) => ({
                id,
                name,
                color: this.generateColor(id)
            }));
    },

    /**
     * Generate consistent colors for classes
     */
    generateColor(id) {
        const colors = [
            '#E7F243', '#A5D8FF', '#FFD1DC', '#E0BBE4', '#BFFCC6',
            '#FFCCAB', '#97E1D4', '#F3E5AB', '#D4F1F4', '#FFDFD3'
        ];
        return colors[id % colors.length];
    }
};

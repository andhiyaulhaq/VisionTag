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
        const hue = (id * 137.5) % 360;
        return `hsl(${hue}, 70%, 50%)`;
    },

    /**
     * Injects an alpha channel into any HEX or HSL color string.
     */
    withAlpha(color, alpha = 0.25) {
        if (!color) return `rgba(255, 255, 255, ${alpha})`;
        
        if (color.startsWith('hsl')) {
            // Convert hsl(...) to hsla(..., alpha)
            return color.replace('hsl', 'hsla').replace(')', `, ${alpha})`);
        }
        
        if (color.startsWith('#')) {
            // Convert hex to hex-alpha
            const hexAlpha = Math.round(alpha * 255).toString(16).padStart(2, '0');
            return `${color}${hexAlpha}`;
        }
        
        return color;
    },

    getContrastColor(hex) {
        if (!hex) return '#ffffff';
        
        // Handle HSL
        if (hex.startsWith('hsl')) {
            const match = hex.match(/hsla?\((\d+),\s*([\d.]+)%,\s*([\d.]+)%(?:,\s*([\d.]+))?\)/);
            if (match) {
                const l = parseFloat(match[3]);
                return l > 65 ? '#000000' : '#ffffff';
            }
        }

        // Handle HEX
        let r, g, b;
        if (hex.startsWith('#')) {
            const h = hex.replace('#', '');
            if (h.length === 3) {
                r = parseInt(h[0] + h[0], 16);
                g = parseInt(h[1] + h[1], 16);
                b = parseInt(h[2] + h[2], 16);
            } else {
                r = parseInt(h.substring(0, 2), 16);
                g = parseInt(h.substring(2, 4), 16);
                b = parseInt(h.substring(4, 6), 16);
            }
        } else {
            return '#ffffff'; // Default
        }

        // Perceived brightness formula
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness > 128 ? '#000000' : '#ffffff';
    }
};

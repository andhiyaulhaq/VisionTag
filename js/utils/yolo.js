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
     * Parse a YOLO string back to pixel coordinates
     */
    fromYolo(line, imgWidth, imgHeight) {
        const parts = line.trim().split(/\s+/).map(Number);
        if (parts.length !== 5) return null;

        const [classId, xCenter, yCenter, width, height] = parts;

        return {
            id: Date.now() + Math.random(),
            classId,
            x: (xCenter - width / 2) * imgWidth,
            y: (yCenter - height / 2) * imgHeight,
            width: width * imgWidth,
            height: height * imgHeight
        };
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
            '#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899',
            '#06b6d4', '#f97316', '#14b8a6', '#6366f1', '#3b82f6'
        ];
        return colors[id % colors.length];
    }
};

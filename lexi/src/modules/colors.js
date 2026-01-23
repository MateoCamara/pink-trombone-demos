// Color utilities for LEXI visualizations

/**
 * Convert HSL color values to RGB array
 * @param {number} h - Hue (0-360)
 * @param {number} s - Saturation (0-100)
 * @param {number} l - Lightness (0-100)
 * @returns {number[]} RGBA array [r, g, b, 255]
 */
export function HSLtoRGB(h, s, l) {
    h /= 360;
    s /= 100;
    l /= 100;
    let r, g, b;

    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }

    return [
        Math.round(r * 255),
        Math.round(g * 255),
        Math.round(b * 255),
        255
    ];
}

// Pre-computed color palette for spectrogram (performance optimization)
let cachedPalette = null;

/**
 * Get pre-computed color palette for spectrogram rendering
 * @param {number} steps - Number of color steps (default 256)
 * @returns {number[][]} Array of RGBA color arrays
 */
export function getColorPalette(steps = 256) {
    if (cachedPalette && cachedPalette.length === steps) {
        return cachedPalette;
    }

    cachedPalette = new Array(steps);
    for (let i = 0; i < steps; i++) {
        const normalizedValue = i / (steps - 1);
        // Map from blue (quiet) to red (loud)
        const hue = (1 - normalizedValue) * 240;
        cachedPalette[i] = HSLtoRGB(hue, 100, 50);
    }
    return cachedPalette;
}

/**
 * Get color for a normalized value (0-1)
 * Uses cached palette for better performance
 * @param {number} normalizedValue - Value between 0 and 1
 * @param {number[][]} palette - Optional pre-computed palette
 * @returns {number[]} RGBA color array
 */
export function getColor(normalizedValue, palette = null) {
    if (palette) {
        const index = Math.floor(normalizedValue * (palette.length - 1));
        return palette[Math.max(0, Math.min(palette.length - 1, index))];
    }
    // Fallback to direct computation
    const hue = (1 - normalizedValue) * 240;
    return HSLtoRGB(hue, 100, 50);
}

// Spectrogram visualization with FFT

import { FFT, createHannWindow } from './fft.js';
import { getColorPalette } from './colors.js';
import { FFT_SIZE, SPECTROGRAM_MIN_DB, SPECTROGRAM_MAX_DB } from './constants.js';

// Pre-computed window and palette for performance
let hannWindow = null;
let colorPalette = null;

/**
 * Draw spectrogram on canvas
 * @param {HTMLCanvasElement} canvas - Target canvas
 * @param {AudioBuffer} audioBuffer - Audio data
 * @param {AudioContext} audioContext - Audio context for sample rate
 */
export function drawSpectrogram(canvas, audioBuffer, audioContext) {
    const ctx = canvas.getContext('2d');
    const data = audioBuffer.getChannelData(0);
    const sampleRate = audioContext.sampleRate;
    const fftSize = FFT_SIZE;

    // Initialize cached resources
    if (!hannWindow || hannWindow.length !== fftSize) {
        hannWindow = createHannWindow(fftSize);
    }
    if (!colorPalette) {
        colorPalette = getColorPalette(256);
    }

    // Calculate hop size to match canvas width
    const desiredWidth = canvas.width;
    const maxHopSize = Math.floor((data.length - fftSize) / (desiredWidth - 1));
    const hopSize = Math.max(1, maxHopSize);
    const totalFrames = Math.ceil((data.length - fftSize) / hopSize) + 1;

    const imageHeight = fftSize / 2;

    // Configure canvas
    canvas.height = imageHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const fft = new FFT(fftSize);
    const imageData = ctx.createImageData(desiredWidth, imageHeight);

    // Reusable arrays to reduce allocations
    const real = new Float32Array(fftSize);
    const imag = new Float32Array(fftSize);

    const dbRange = SPECTROGRAM_MAX_DB - SPECTROGRAM_MIN_DB;

    // Process frames
    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
        const start = frameIndex * hopSize;
        const end = start + fftSize;
        if (end > data.length) break;

        // Apply window and copy to real array (avoid slice allocation)
        for (let i = 0; i < fftSize; i++) {
            real[i] = data[start + i] * hannWindow[i];
            imag[i] = 0;
        }

        fft.transform(real, imag);

        // Map to canvas column
        const xPos = Math.floor((frameIndex / totalFrames) * desiredWidth);

        for (let bin = 0; bin < imageHeight; bin++) {
            const magnitude = Math.sqrt(real[bin] ** 2 + imag[bin] ** 2);
            const dB = 20 * Math.log10(magnitude + 1e-6);
            const clampedDb = Math.min(Math.max(dB, SPECTROGRAM_MIN_DB), SPECTROGRAM_MAX_DB);
            const normalized = (clampedDb - SPECTROGRAM_MIN_DB) / dbRange;

            // Use pre-computed palette
            const colorIndex = Math.floor(normalized * 255);
            const color = colorPalette[Math.max(0, Math.min(255, colorIndex))];

            // Invert Y axis (low frequencies at bottom)
            const yPos = imageHeight - 1 - bin;
            const idx = (yPos * desiredWidth + xPos) * 4;

            if (idx + 3 < imageData.data.length) {
                imageData.data[idx] = color[0];
                imageData.data[idx + 1] = color[1];
                imageData.data[idx + 2] = color[2];
                imageData.data[idx + 3] = 255;
            }
        }
    }

    ctx.putImageData(imageData, 0, 0);
}

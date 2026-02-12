// Spectrogram visualization with FFT

import { FFT, createHannWindow } from './fft.js';
import { getColorPalette } from './colors.js';
import { FFT_SIZE, SPECTROGRAM_MIN_DB, SPECTROGRAM_MAX_DB, SPECTROGRAM_MAX_FREQ } from './constants.js';

// Pre-computed resources cache
let hannWindow = null;
let colorPalette = null;

const DISPLAY_HEIGHT = 300;

/**
 * Draw spectrogram on canvas
 * @param {HTMLCanvasElement} canvas - Target canvas
 * @param {AudioBuffer} audioBuffer - Audio data
 * @param {AudioContext} audioContext - Audio context for sample rate
 * @param {Object} options - Optional FFT parameters
 * @param {number} options.fftSize - FFT size (default from constants)
 * @param {number} options.minDb - Min dB (default from constants)
 * @param {number} options.maxDb - Max dB (default from constants)
 */
export function drawSpectrogram(canvas, audioBuffer, audioContext, options = {}) {
    const ctx = canvas.getContext('2d');
    const data = audioBuffer.getChannelData(0);
    const fftSize = options.fftSize || FFT_SIZE;
    const minDb = options.minDb != null ? options.minDb : SPECTROGRAM_MIN_DB;
    const maxDb = options.maxDb != null ? options.maxDb : SPECTROGRAM_MAX_DB;

    // Initialize cached resources (invalidate if fftSize changed)
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

    const halfFft = fftSize / 2;
    const maxFreq = options.maxFreq || SPECTROGRAM_MAX_FREQ;
    const sampleRate = audioContext.sampleRate || audioBuffer.sampleRate || 48000;
    const maxBin = Math.min(halfFft, Math.ceil(maxFreq / (sampleRate / fftSize)));
    const nativeHeight = maxBin;

    // Render to offscreen canvas at native FFT resolution, then scale to display height
    const offscreen = new OffscreenCanvas(desiredWidth, nativeHeight);
    const offCtx = offscreen.getContext('2d');

    const fft = new FFT(fftSize);
    const imageData = offCtx.createImageData(desiredWidth, nativeHeight);

    const real = new Float32Array(fftSize);
    const imag = new Float32Array(fftSize);
    const dbRange = maxDb - minDb;

    // Process frames
    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
        const start = frameIndex * hopSize;
        const end = start + fftSize;
        if (end > data.length) break;

        for (let i = 0; i < fftSize; i++) {
            real[i] = data[start + i] * hannWindow[i];
            imag[i] = 0;
        }

        fft.transform(real, imag);

        const xPos = Math.floor((frameIndex / totalFrames) * desiredWidth);

        for (let bin = 0; bin < nativeHeight; bin++) {
            const magnitude = Math.sqrt(real[bin] ** 2 + imag[bin] ** 2);
            const dB = 20 * Math.log10(magnitude + 1e-6);
            const clampedDb = Math.min(Math.max(dB, minDb), maxDb);
            const normalized = (clampedDb - minDb) / dbRange;

            const colorIndex = Math.floor(normalized * 255);
            const color = colorPalette[Math.max(0, Math.min(255, colorIndex))];

            // Invert Y axis (low frequencies at bottom)
            const yPos = nativeHeight - 1 - bin;
            const idx = (yPos * desiredWidth + xPos) * 4;

            if (idx + 3 < imageData.data.length) {
                imageData.data[idx] = color[0];
                imageData.data[idx + 1] = color[1];
                imageData.data[idx + 2] = color[2];
                imageData.data[idx + 3] = 255;
            }
        }
    }

    offCtx.putImageData(imageData, 0, 0);

    // Scale offscreen canvas to fixed display height
    canvas.height = DISPLAY_HEIGHT;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(offscreen, 0, 0, desiredWidth, nativeHeight, 0, 0, canvas.width, DISPLAY_HEIGHT);
}

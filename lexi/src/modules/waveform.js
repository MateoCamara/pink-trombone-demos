// Waveform (time domain) visualization

import { WAVEFORM_COLOR, WAVEFORM_LINE_WIDTH, VERTICAL_MARGIN_PERCENT } from './constants.js';

/**
 * Draw time domain waveform on canvas
 * @param {HTMLCanvasElement} canvas - Target canvas
 * @param {AudioBuffer} audioBuffer - Audio data
 */
export function drawTimeDomain(canvas, audioBuffer) {
    const ctx = canvas.getContext('2d');
    const data = audioBuffer.getChannelData(0);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();

    // Find global peak for normalization
    let globalPeak = 0;
    for (let i = 0; i < data.length; i++) {
        globalPeak = Math.max(globalPeak, Math.abs(data[i]));
    }
    if (globalPeak === 0) globalPeak = 1; // Avoid division by zero

    // Calculate scaling parameters
    const segmentWidth = data.length / canvas.width;
    const verticalScale = (canvas.height * VERTICAL_MARGIN_PERCENT) / (2 * globalPeak);

    // Draw min-max envelope per pixel column
    for (let x = 0; x < canvas.width; x++) {
        const start = Math.floor(x * segmentWidth);
        const end = Math.floor((x + 1) * segmentWidth);
        let max = -Infinity;
        let min = Infinity;

        for (let i = start; i < end && i < data.length; i++) {
            const val = data[i];
            max = Math.max(max, val);
            min = Math.min(min, val);
        }

        const yCenter = canvas.height / 2;
        const yMax = yCenter - (max * verticalScale);
        const yMin = yCenter - (min * verticalScale);

        ctx.moveTo(x, yMax);
        ctx.lineTo(x, yMin);
    }

    ctx.strokeStyle = WAVEFORM_COLOR;
    ctx.lineWidth = WAVEFORM_LINE_WIDTH;
    ctx.stroke();
}

// Waveform (time domain) visualization - filled gradient mirror style

import { VERTICAL_MARGIN_PERCENT } from './constants.js';

/**
 * Draw time domain waveform as a filled mirror waveform with gradient
 * @param {HTMLCanvasElement} canvas - Target canvas
 * @param {AudioBuffer} audioBuffer - Audio data
 */
export function drawTimeDomain(canvas, audioBuffer) {
    const ctx = canvas.getContext('2d');
    const data = audioBuffer.getChannelData(0);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Find global peak for normalization
    let globalPeak = 0;
    for (let i = 0; i < data.length; i++) {
        globalPeak = Math.max(globalPeak, Math.abs(data[i]));
    }
    if (globalPeak === 0) globalPeak = 1;

    const segmentWidth = data.length / canvas.width;
    const yCenter = canvas.height / 2;
    const verticalScale = (canvas.height * VERTICAL_MARGIN_PERCENT) / (2 * globalPeak);

    // Build upper (max) and lower (min) envelope arrays
    const maxVals = new Float32Array(canvas.width);
    const minVals = new Float32Array(canvas.width);

    for (let x = 0; x < canvas.width; x++) {
        const start = Math.floor(x * segmentWidth);
        const end = Math.floor((x + 1) * segmentWidth);
        let max = -Infinity;
        let min = Infinity;

        for (let i = start; i < end && i < data.length; i++) {
            max = Math.max(max, data[i]);
            min = Math.min(min, data[i]);
        }

        maxVals[x] = max;
        minVals[x] = min;
    }

    // Create upper path (positive envelope)
    const upperPath = new Path2D();
    upperPath.moveTo(0, yCenter);
    for (let x = 0; x < canvas.width; x++) {
        upperPath.lineTo(x, yCenter - maxVals[x] * verticalScale);
    }
    upperPath.lineTo(canvas.width - 1, yCenter);
    upperPath.closePath();

    // Create lower path (negative envelope)
    const lowerPath = new Path2D();
    lowerPath.moveTo(0, yCenter);
    for (let x = 0; x < canvas.width; x++) {
        lowerPath.lineTo(x, yCenter - minVals[x] * verticalScale);
    }
    lowerPath.lineTo(canvas.width - 1, yCenter);
    lowerPath.closePath();

    // Fill upper half with gradient (center -> top)
    const upperGrad = ctx.createLinearGradient(0, yCenter, 0, 0);
    upperGrad.addColorStop(0, 'rgba(99, 179, 237, 0.9)');
    upperGrad.addColorStop(0.5, 'rgba(66, 153, 225, 0.7)');
    upperGrad.addColorStop(1, 'rgba(49, 130, 206, 0.35)');

    ctx.fillStyle = upperGrad;
    ctx.fill(upperPath);

    // Fill lower half with gradient (center -> bottom)
    const lowerGrad = ctx.createLinearGradient(0, yCenter, 0, canvas.height);
    lowerGrad.addColorStop(0, 'rgba(99, 179, 237, 0.9)');
    lowerGrad.addColorStop(0.5, 'rgba(66, 153, 225, 0.7)');
    lowerGrad.addColorStop(1, 'rgba(49, 130, 206, 0.35)');

    ctx.fillStyle = lowerGrad;
    ctx.fill(lowerPath);

    // Thin outline stroke for crispness
    ctx.beginPath();
    for (let x = 0; x < canvas.width; x++) {
        const yMax = yCenter - maxVals[x] * verticalScale;
        if (x === 0) ctx.moveTo(x, yMax);
        else ctx.lineTo(x, yMax);
    }
    ctx.strokeStyle = 'rgba(99, 179, 237, 0.5)';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    ctx.beginPath();
    for (let x = 0; x < canvas.width; x++) {
        const yMin = yCenter - minVals[x] * verticalScale;
        if (x === 0) ctx.moveTo(x, yMin);
        else ctx.lineTo(x, yMin);
    }
    ctx.strokeStyle = 'rgba(99, 179, 237, 0.5)';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Nose overlay (ch1) — draw behind the combined outline
    if (audioBuffer.numberOfChannels >= 2) {
        const noseData = audioBuffer.getChannelData(1);
        const noseMax = new Float32Array(canvas.width);
        const noseMin = new Float32Array(canvas.width);

        for (let x = 0; x < canvas.width; x++) {
            const start = Math.floor(x * segmentWidth);
            const end = Math.floor((x + 1) * segmentWidth);
            let mx = -Infinity;
            let mn = Infinity;
            for (let i = start; i < end && i < noseData.length; i++) {
                mx = Math.max(mx, noseData[i]);
                mn = Math.min(mn, noseData[i]);
            }
            noseMax[x] = mx;
            noseMin[x] = mn;
        }

        // Upper nose envelope
        const noseUpper = new Path2D();
        noseUpper.moveTo(0, yCenter);
        for (let x = 0; x < canvas.width; x++) {
            noseUpper.lineTo(x, yCenter - noseMax[x] * verticalScale);
        }
        noseUpper.lineTo(canvas.width - 1, yCenter);
        noseUpper.closePath();

        // Lower nose envelope
        const noseLower = new Path2D();
        noseLower.moveTo(0, yCenter);
        for (let x = 0; x < canvas.width; x++) {
            noseLower.lineTo(x, yCenter - noseMin[x] * verticalScale);
        }
        noseLower.lineTo(canvas.width - 1, yCenter);
        noseLower.closePath();

        ctx.fillStyle = 'rgba(246, 173, 85, 0.35)';
        ctx.fill(noseUpper);
        ctx.fill(noseLower);

        // Nose outline
        ctx.beginPath();
        for (let x = 0; x < canvas.width; x++) {
            const y = yCenter - noseMax[x] * verticalScale;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = 'rgba(246, 173, 85, 0.6)';
        ctx.lineWidth = 0.8;
        ctx.stroke();

        ctx.beginPath();
        for (let x = 0; x < canvas.width; x++) {
            const y = yCenter - noseMin[x] * verticalScale;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = 'rgba(246, 173, 85, 0.6)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
    }

    // Subtle center line
    ctx.beginPath();
    ctx.moveTo(0, yCenter);
    ctx.lineTo(canvas.width, yCenter);
    ctx.strokeStyle = 'rgba(99, 179, 237, 0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();
}

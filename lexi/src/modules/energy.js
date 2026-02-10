// Energy plot: draws mouth vs nose airflow energy over time

/**
 * Draw mouth and nose energy curves on a canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {AudioBuffer} audioBuffer - if 2+ channels, ch0=combined, ch1=nose
 */
export function drawEnergyPlot(canvas, audioBuffer) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, width, height);

    if (!audioBuffer || audioBuffer.length === 0) return;

    const combined = audioBuffer.getChannelData(0);
    const hasNose = audioBuffer.numberOfChannels >= 2;
    const noseData = hasNose ? audioBuffer.getChannelData(1) : null;

    // Compute per-pixel RMS
    const samplesPerPixel = combined.length / width;
    const mouthRMS = new Float32Array(width);
    const noseRMS = new Float32Array(width);

    for (let px = 0; px < width; px++) {
        const start = Math.floor(px * samplesPerPixel);
        const end = Math.min(Math.floor((px + 1) * samplesPerPixel), combined.length);
        const count = end - start;
        if (count <= 0) continue;

        let combinedSumSq = 0;
        let noseSumSq = 0;

        for (let i = start; i < end; i++) {
            combinedSumSq += combined[i] * combined[i];
            if (noseData) noseSumSq += noseData[i] * noseData[i];
        }

        const combinedRms = Math.sqrt(combinedSumSq / count);
        const noseRms = noseData ? Math.sqrt(noseSumSq / count) : 0;

        // mouth = combined - nose (energy difference)
        mouthRMS[px] = hasNose ? Math.max(0, combinedRms - noseRms) : combinedRms;
        noseRMS[px] = noseRms;
    }

    // Find global peak for normalization
    let peak = 0;
    for (let px = 0; px < width; px++) {
        peak = Math.max(peak, mouthRMS[px], noseRMS[px]);
    }
    if (peak === 0) return;

    // Draw helpers
    function drawCurve(rmsArray, strokeColor, fillColor) {
        ctx.beginPath();
        ctx.moveTo(0, height);
        for (let px = 0; px < width; px++) {
            const y = height - (rmsArray[px] / peak) * (height - 4);
            ctx.lineTo(px, y);
        }
        ctx.lineTo(width, height);
        ctx.closePath();
        ctx.fillStyle = fillColor;
        ctx.fill();

        ctx.beginPath();
        for (let px = 0; px < width; px++) {
            const y = height - (rmsArray[px] / peak) * (height - 4);
            if (px === 0) ctx.moveTo(px, y);
            else ctx.lineTo(px, y);
        }
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    // Draw nose first (behind), then mouth on top
    if (hasNose) {
        drawCurve(noseRMS, '#f6ad55', 'rgba(246, 173, 85, 0.25)');
    }
    drawCurve(mouthRMS, '#63b3ed', 'rgba(99, 179, 237, 0.25)');

    // Labels
    ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = '#63b3ed';
    ctx.fillText('MOUTH', 6, 14);
    if (hasNose) {
        ctx.fillStyle = '#f6ad55';
        ctx.fillText('NOSE', 6, 26);
    }
}

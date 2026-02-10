// LEXI - Landmark Extraction and Visualization Interface
// Main coordinator module

import { getAudioContext, decodeAudio, downloadAudio as downloadAudioFile, detectSilenceOffset, detectSilenceEnd, trimAudioBufferRange, encodeWAV } from './modules/audio.js';
import { drawTimeDomain } from './modules/waveform.js';
import { drawSpectrogram } from './modules/spectrogram.js';
import { drawPhonemes } from './modules/phonemes.js';
import { drawLandmarks, downloadLandmarks as downloadLandmarksFile, getExportLandmarks, getLandmarkStore, resetLandmarkStore } from './modules/landmarks.js';
import { drawEnergyPlot } from './modules/energy.js';

// Centralized state
const state = {
    audioBuffer: null,        // trimmed AudioBuffer
    rawAudioBuffer: null,     // original untrimmed buffer
    currentAudioBlob: null,   // original ArrayBuffer from message
    phonemeData: null,
    messageCounter: 0,
    trimStart: 0,             // seconds trimmed from start
    trimEnd: 0,               // end time used for trim
    fftSize: 512,
    spectrogramMinDb: -100,
    spectrogramMaxDb: 0,
};

// Canvas elements
const waveformCanvas = document.getElementById('waveform');
const spectrogramCanvas = document.getElementById('spectrogram');
const energyCanvas = document.getElementById('energy-plot');

// Setup inter-module communication
const { onMessage } = setupConnection("lexi", handleMessage);

/**
 * Handle incoming messages from other modules
 */
async function handleMessage(message) {
    console.log('LEXI received:', message);

    try {
        if (message.type === "waveform") {
            state.messageCounter++;
            state.currentAudioBlob = message.data.slice(0);
            const audioContext = getAudioContext();
            state.rawAudioBuffer = await decodeAudio(message.data);
            renderAll();
        } else if (message.type === "message") {
            state.phonemeData = message.utterance;
            // Re-render everything: phoneme data changes the trim bounds
            if (state.rawAudioBuffer) {
                renderAll();
            }
        }
    } catch (error) {
        console.error('Error handling message:', error);
    }
}

/**
 * Compute trim bounds and render all visualizations.
 * Uses phoneme keyframe times when available (exact),
 * falls back to RMS silence detection otherwise.
 */
function renderAll() {
    const audioContext = getAudioContext();

    // Compute trim start: use first non-silent keyframe time if available
    if (state.phonemeData?.keyframes) {
        const firstPhoneme = state.phonemeData.keyframes.find(kf => kf.name !== '.');
        state.trimStart = firstPhoneme ? firstPhoneme.time : detectSilenceOffset(state.rawAudioBuffer);
    } else {
        state.trimStart = detectSilenceOffset(state.rawAudioBuffer);
    }

    // Compute trim end: detect where signal drops to silence from the tail
    state.trimEnd = detectSilenceEnd(state.rawAudioBuffer);

    // Trim audio to [trimStart, trimEnd]
    state.audioBuffer = trimAudioBufferRange(state.rawAudioBuffer, state.trimStart, state.trimEnd, audioContext);

    // Compute canvas width: use a minimum pixels-per-second so long utterances scroll
    const container = document.getElementById('container');
    const viewportWidth = container.clientWidth;
    const minPxPerSec = 800;
    const durationWidth = Math.ceil(state.audioBuffer.duration * minPxPerSec);
    const canvasWidth = Math.max(viewportWidth, durationWidth);

    // Sync all element widths (pixel buffer + CSS display size)
    waveformCanvas.width = canvasWidth;
    waveformCanvas.style.width = `${canvasWidth}px`;
    spectrogramCanvas.width = canvasWidth;
    spectrogramCanvas.style.width = `${canvasWidth}px`;
    document.querySelector('.fft-controls').style.width = `${canvasWidth}px`;
    document.getElementById('phoneme-timeline-container').style.width = `${canvasWidth}px`;
    document.getElementById('energy-plot-container').style.width = `${canvasWidth}px`;
    document.getElementById('landmarks-container').style.width = `${canvasWidth}px`;

    // Draw visualizations
    drawTimeDomain(waveformCanvas, state.audioBuffer);
    drawSpectrogram(spectrogramCanvas, state.audioBuffer, audioContext, {
        fftSize: state.fftSize,
        minDb: state.spectrogramMinDb,
        maxDb: state.spectrogramMaxDb,
    });

    // Draw energy plot
    energyCanvas.width = canvasWidth;
    energyCanvas.style.width = `${canvasWidth}px`;
    drawEnergyPlot(energyCanvas, state.audioBuffer);

    // Draw annotations if phoneme data available
    redrawAnnotations();
}

/**
 * Redraw phoneme and landmark annotations
 */
function redrawAnnotations() {
    if (state.phonemeData && state.audioBuffer) {
        // Adjust keyframe times by subtracting trim start
        const adjustedData = {
            ...state.phonemeData,
            keyframes: state.phonemeData.keyframes
                .map(kf => ({ ...kf, time: kf.time - state.trimStart }))
                .filter(kf => kf.time >= 0)
        };

        drawPhonemes(adjustedData, state.audioBuffer.duration, waveformCanvas.width);
        drawLandmarks(adjustedData, state.audioBuffer.duration, waveformCanvas.width, state.audioBuffer);
    }
}

/**
 * Re-render only the spectrogram (for FFT control changes)
 */
function reRenderSpectrogram() {
    if (!state.audioBuffer) return;
    const audioContext = getAudioContext();
    drawSpectrogram(spectrogramCanvas, state.audioBuffer, audioContext, {
        fftSize: state.fftSize,
        minDb: state.spectrogramMinDb,
        maxDb: state.spectrogramMaxDb,
    });
}

// Wire up FFT controls
const fftSizeSelect = document.getElementById('fft-size');
const minDbSlider = document.getElementById('min-db');
const maxDbSlider = document.getElementById('max-db');
const minDbValue = document.getElementById('min-db-value');
const maxDbValue = document.getElementById('max-db-value');

if (fftSizeSelect) {
    fftSizeSelect.value = state.fftSize;
    fftSizeSelect.addEventListener('change', (e) => {
        state.fftSize = parseInt(e.target.value, 10);
        reRenderSpectrogram();
    });
}

if (minDbSlider) {
    minDbSlider.value = state.spectrogramMinDb;
    minDbSlider.addEventListener('input', (e) => {
        state.spectrogramMinDb = parseInt(e.target.value, 10);
        if (minDbValue) minDbValue.textContent = `${state.spectrogramMinDb} dB`;
        reRenderSpectrogram();
    });
}

if (maxDbSlider) {
    maxDbSlider.value = state.spectrogramMaxDb;
    maxDbSlider.addEventListener('input', (e) => {
        state.spectrogramMaxDb = parseInt(e.target.value, 10);
        if (maxDbValue) maxDbValue.textContent = `${state.spectrogramMaxDb} dB`;
        reRenderSpectrogram();
    });
}

// Export download functions to global scope for onclick handlers
window.downloadAudio = function() {
    if (state.audioBuffer) {
        const wavBlob = encodeWAV(state.audioBuffer);
        downloadAudioFile(wavBlob);
    } else {
        downloadAudioFile(state.currentAudioBlob);
    }
};

window.downloadLandmarks = function() {
    const audioContext = getAudioContext();
    downloadLandmarksFile(
        audioContext?.sampleRate,
        state.audioBuffer?.duration
    );
};

/**
 * Save All: downloads WAV, waveform PNG, spectrogram PNG, and landmarks JSON
 * with a consistent timestamp prefix.
 */
window.saveAll = function() {
    if (!state.audioBuffer) {
        alert('No audio data available.');
        return;
    }

    const ts = new Date().toISOString().slice(0, 19).replace(/:/g, '-');

    function triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    }

    // 1. WAV
    const wavBlob = encodeWAV(state.audioBuffer);
    triggerDownload(wavBlob, `${ts}_audio.wav`);

    // 2. Waveform PNG
    waveformCanvas.toBlob(blob => {
        if (blob) triggerDownload(blob, `${ts}_waveform.png`);
    });

    // 3. Spectrogram PNG
    spectrogramCanvas.toBlob(blob => {
        if (blob) triggerDownload(blob, `${ts}_spectrogram.png`);
    });

    // 4. Landmarks JSON
    const audioContext = getAudioContext();
    const landmarks = getExportLandmarks();
    if (landmarks.length > 0) {
        const exportData = {
            version: "1.0",
            sampleRate: audioContext?.sampleRate || 44100,
            duration: state.audioBuffer?.duration || 0,
            landmarks
        };
        const jsonBlob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        triggerDownload(jsonBlob, `${ts}_landmarks.json`);
    }
};

// Expose data for batch extraction (Puppeteer)
window.getCurrentAudio = function() {
    if (state.audioBuffer) {
        return encodeWAV(state.audioBuffer);
    }
    return state.currentAudioBlob;
};

window.getCurrentLandmarks = function() {
    const audioContext = getAudioContext();
    return {
        version: "1.0",
        sampleRate: audioContext?.sampleRate || 44100,
        duration: state.audioBuffer?.duration || 0,
        landmarks: getExportLandmarks()
    };
};

window.isLexiReady = function() {
    return state.audioBuffer !== null && getLandmarkStore().length > 0;
};

window.getCalculatedLandmarks = function() {
    return getExportLandmarks();
};

window.resetLexi = function() {
    state.audioBuffer = null;
    state.rawAudioBuffer = null;
    state.currentAudioBlob = null;
    state.phonemeData = null;
    state.trimStart = 0;
    state.trimEnd = 0;
    state.fftSize = 512;
    state.spectrogramMinDb = -100;
    state.spectrogramMaxDb = 0;
    resetLandmarkStore();

    // Reset UI controls
    if (fftSizeSelect) fftSizeSelect.value = 512;
    if (minDbSlider) { minDbSlider.value = -100; if (minDbValue) minDbValue.textContent = '-100 dB'; }
    if (maxDbSlider) { maxDbSlider.value = 0; if (maxDbValue) maxDbValue.textContent = '0 dB'; }
};

window.getMessageCounter = function() {
    return state.messageCounter;
};

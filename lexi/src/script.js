// LEXI - Landmark Extraction and Visualization Interface
// Main coordinator module

import { getAudioContext, decodeAudio, downloadAudio as downloadAudioFile } from './modules/audio.js';
import { drawTimeDomain } from './modules/waveform.js';
import { drawSpectrogram } from './modules/spectrogram.js';
import { drawPhonemes } from './modules/phonemes.js';
import { drawLandmarks, downloadLandmarks as downloadLandmarksFile } from './modules/landmarks.js';

// State
let audioBuffer = null;
let currentAudioBlob = null;
let phonemeData = null;
let calculatedLandmarks = [];

// Canvas elements
const waveformCanvas = document.getElementById('waveform');
const spectrogramCanvas = document.getElementById('spectrogram');

// Setup inter-module communication
const { onMessage } = setupConnection("lexi", handleMessage);

/**
 * Handle incoming messages from other modules
 */
async function handleMessage(message) {
    console.log('LEXI received:', message);

    try {
        if (message.type === "waveform") {
            // Store original audio data
            currentAudioBlob = message.data.slice(0);
            await renderAudio(message.data);
        } else if (message.type === "message") {
            phonemeData = message.utterance;
            // Re-render annotations if audio already loaded
            if (audioBuffer) {
                redrawAnnotations();
            }
        }
    } catch (error) {
        console.error('Error handling message:', error);
    }
}

/**
 * Render audio visualizations
 */
async function renderAudio(arrayBuffer) {
    const audioContext = getAudioContext();
    audioBuffer = await decodeAudio(arrayBuffer);

    // Sync canvas widths
    waveformCanvas.width = waveformCanvas.offsetWidth;
    spectrogramCanvas.width = waveformCanvas.width;

    // Draw visualizations
    drawTimeDomain(waveformCanvas, audioBuffer);
    drawSpectrogram(spectrogramCanvas, audioBuffer, audioContext);

    // Draw annotations if phoneme data available
    redrawAnnotations();
}

/**
 * Redraw phoneme and landmark annotations
 */
function redrawAnnotations() {
    if (phonemeData && audioBuffer) {
        drawPhonemes(phonemeData, audioBuffer.duration, waveformCanvas.width);
        calculatedLandmarks = drawLandmarks(phonemeData, audioBuffer.duration, waveformCanvas.width);
    }
}

// Export download functions to global scope for onclick handlers
window.downloadAudio = function() {
    downloadAudioFile(currentAudioBlob);
};

window.downloadLandmarks = function() {
    const audioContext = getAudioContext();
    downloadLandmarksFile(
        calculatedLandmarks,
        audioContext?.sampleRate,
        audioBuffer?.duration
    );
};

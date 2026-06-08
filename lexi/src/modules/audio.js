// Audio context management, silence trimming, and download utilities

let audioContext = null;

/**
 * Get or create the audio context
 * @returns {AudioContext}
 */
export function getAudioContext() {
    if (!audioContext) {
        audioContext = new AudioContext();
    }
    return audioContext;
}

/**
 * Decode audio data from ArrayBuffer
 * @param {ArrayBuffer} arrayBuffer - Audio data
 * @returns {Promise<AudioBuffer>} Decoded audio buffer
 */
export async function decodeAudio(arrayBuffer) {
    const ctx = getAudioContext();
    try {
        return await ctx.decodeAudioData(arrayBuffer.slice(0));
    } catch (error) {
        console.error('Failed to decode audio:', error);
        throw new Error(`Audio decode failed: ${error.message}`);
    }
}

/**
 * Detect the time offset where audio signal first exceeds a threshold.
 * Uses RMS windowing for robust silence detection.
 * @param {AudioBuffer} audioBuffer - Audio to analyze
 * @param {number} threshold - RMS threshold (default 0.005)
 * @param {number} windowSize - Samples per RMS window (default 256)
 * @returns {number} Time in seconds where signal starts
 */
export function detectSilenceOffset(audioBuffer, threshold = 0.005, windowSize = 256) {
    const data = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;

    for (let i = 0; i < data.length - windowSize; i += windowSize) {
        let sumSquares = 0;
        for (let j = i; j < i + windowSize; j++) {
            sumSquares += data[j] * data[j];
        }
        const rms = Math.sqrt(sumSquares / windowSize);
        if (rms > threshold) {
            // Back up slightly to avoid clipping the onset
            const onsetSample = Math.max(0, i - windowSize);
            return onsetSample / sampleRate;
        }
    }
    return 0; // No silence detected
}

/**
 * Detect where audio signal drops below threshold scanning from the end.
 * @param {AudioBuffer} audioBuffer - Audio to analyze
 * @param {number} threshold - RMS threshold (default 0.005)
 * @param {number} windowSize - Samples per RMS window (default 256)
 * @returns {number} Time in seconds where signal ends
 */
export function detectSilenceEnd(audioBuffer, threshold = 0.005, windowSize = 256) {
    const data = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;

    for (let i = data.length - windowSize; i >= 0; i -= windowSize) {
        let sumSquares = 0;
        const end = Math.min(i + windowSize, data.length);
        for (let j = i; j < end; j++) {
            sumSquares += data[j] * data[j];
        }
        const rms = Math.sqrt(sumSquares / (end - i));
        if (rms > threshold) {
            // Add a small buffer after the last detected signal
            const endSample = Math.min(data.length, i + windowSize * 2);
            return endSample / sampleRate;
        }
    }
    return audioBuffer.duration;
}

/**
 * Create a new AudioBuffer from a time range [startSeconds, endSeconds].
 * @param {AudioBuffer} audioBuffer - Source buffer
 * @param {number} startSeconds - Start time to keep
 * @param {number} endSeconds - End time to keep
 * @param {AudioContext} ctx - Audio context for creating new buffer
 * @returns {AudioBuffer} Trimmed audio buffer
 */
export function trimAudioBufferRange(audioBuffer, startSeconds, endSeconds, ctx) {
    const startSample = Math.max(0, Math.floor(startSeconds * audioBuffer.sampleRate));
    const endSample = Math.min(audioBuffer.length, Math.ceil(endSeconds * audioBuffer.sampleRate));
    const newLength = endSample - startSample;
    if (newLength <= 0) return audioBuffer;

    const trimmed = ctx.createBuffer(
        audioBuffer.numberOfChannels,
        newLength,
        audioBuffer.sampleRate
    );

    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
        const src = audioBuffer.getChannelData(ch);
        const dst = trimmed.getChannelData(ch);
        for (let i = 0; i < newLength; i++) {
            dst[i] = src[i + startSample];
        }
    }
    return trimmed;
}

/**
 * Encode an AudioBuffer to a WAV Blob.
 * @param {AudioBuffer} audioBuffer - Audio buffer to encode
 * @returns {Blob} WAV file blob
 */
export function encodeWAV(audioBuffer, { mono = true } = {}) {
    const numChannels = mono ? 1 : audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const numSamples = audioBuffer.length;
    const dataLength = numSamples * numChannels * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);

    // WAV header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // subchunk1 size
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
    view.setUint16(32, numChannels * bytesPerSample, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    // Interleave channels and write samples
    const channels = [];
    for (let ch = 0; ch < numChannels; ch++) {
        channels.push(audioBuffer.getChannelData(ch));
    }

    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
        for (let ch = 0; ch < numChannels; ch++) {
            const sample = Math.max(-1, Math.min(1, channels[ch][i]));
            const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
            view.setInt16(offset, intSample, true);
            offset += 2;
        }
    }

    return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view, offset, str) {
    for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
    }
}

/**
 * Download audio blob as WAV file
 * @param {Blob|ArrayBuffer} audioBlob - Audio data (Blob or ArrayBuffer)
 * @param {string} filename - Optional filename
 * @returns {boolean} Success status
 */
export function downloadAudio(audioBlob, filename = null) {
    if (!audioBlob) {
        console.warn('No audio data available for download');
        alert('No audio available to download');
        return false;
    }

    try {
        const blob = audioBlob instanceof Blob
            ? audioBlob
            : new Blob([audioBlob], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename || `audio_${new Date().toISOString().slice(0, 19)}.wav`;
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);

        return true;
    } catch (error) {
        console.error('Download failed:', error);
        return false;
    }
}

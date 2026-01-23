// Audio context management and download utilities

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
        // Use slice to avoid detaching the original buffer
        return await ctx.decodeAudioData(arrayBuffer.slice(0));
    } catch (error) {
        console.error('Failed to decode audio:', error);
        throw new Error(`Audio decode failed: ${error.message}`);
    }
}

/**
 * Download audio blob as WAV file
 * @param {ArrayBuffer} audioBlob - Audio data
 * @param {string} filename - Optional filename
 * @returns {boolean} Success status
 */
export function downloadAudio(audioBlob, filename = null) {
    if (!audioBlob) {
        console.warn('No audio data available for download');
        alert('No hay audio para descargar');
        return false;
    }

    try {
        const blob = new Blob([audioBlob], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename || `audio_${new Date().toISOString().slice(0, 19)}.wav`;
        document.body.appendChild(a);
        a.click();

        // Cleanup
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

// Energy-based landmark position refinement
// Uses mouth/nose energy envelopes to place landmarks at actual articulatory events

/**
 * Compute smooth RMS energy envelopes from a 2-channel audio buffer.
 * @param {AudioBuffer} audioBuffer - ch0=combined, ch1=nose
 * @param {number} windowSize - RMS window in samples (default 512 ~11.6ms at 44.1kHz)
 * @param {number} hopSize - Hop between frames in samples (default 128 ~2.9ms at 44.1kHz)
 * @returns {{ mouth: Float32Array, nose: Float32Array, hopTime: number, length: number }}
 */
export function computeEnergyEnvelopes(audioBuffer, windowSize = 512, hopSize = 128) {
    const sampleRate = audioBuffer.sampleRate;
    const combined = audioBuffer.getChannelData(0);
    const hasNose = audioBuffer.numberOfChannels >= 2;
    const noseData = hasNose ? audioBuffer.getChannelData(1) : null;
    const totalSamples = combined.length;

    const numFrames = Math.floor((totalSamples - windowSize) / hopSize) + 1;
    if (numFrames <= 0) return { mouth: new Float32Array(0), nose: new Float32Array(0), hopTime: hopSize / sampleRate, length: 0 };

    const combinedRMS = new Float32Array(numFrames);
    const noseRMS = new Float32Array(numFrames);

    // Compute RMS per frame
    for (let f = 0; f < numFrames; f++) {
        const start = f * hopSize;
        const end = start + windowSize;

        let combinedSumSq = 0;
        let noseSumSq = 0;

        for (let i = start; i < end; i++) {
            combinedSumSq += combined[i] * combined[i];
            if (noseData) noseSumSq += noseData[i] * noseData[i];
        }

        combinedRMS[f] = Math.sqrt(combinedSumSq / windowSize);
        noseRMS[f] = noseData ? Math.sqrt(noseSumSq / windowSize) : 0;
    }

    // Derive mouth envelope: combined - nose
    const mouth = new Float32Array(numFrames);
    const nose = new Float32Array(numFrames);
    for (let f = 0; f < numFrames; f++) {
        mouth[f] = hasNose ? Math.max(0, combinedRMS[f] - noseRMS[f]) : combinedRMS[f];
        nose[f] = noseRMS[f];
    }

    // Zero-phase IIR smoothing (forward + backward pass)
    const alpha = 0.15;
    smoothInPlace(mouth, alpha);
    smoothInPlace(nose, alpha);

    return { mouth, nose, hopTime: hopSize / sampleRate, length: numFrames };
}

/**
 * Apply zero-phase IIR smoothing in place (forward then backward pass).
 */
function smoothInPlace(arr, alpha) {
    const len = arr.length;
    if (len < 2) return;

    // Forward pass
    for (let i = 1; i < len; i++) {
        arr[i] = alpha * arr[i] + (1 - alpha) * arr[i - 1];
    }
    // Backward pass
    for (let i = len - 2; i >= 0; i--) {
        arr[i] = alpha * arr[i] + (1 - alpha) * arr[i + 1];
    }
}

/**
 * Refine auto-generated landmark positions using energy envelope features.
 * Adjusts .time in place; does NOT touch .originalTime (preserving deletion tracking).
 *
 * @param {Array} landmarks - Array of landmark objects with { type, time, source, originalTime, ... }
 * @param {AudioBuffer} audioBuffer - 2-channel audio (ch0=combined, ch1=nose)
 * @param {number} audioDuration - Total audio duration in seconds
 */
export function refineLandmarkPositions(landmarks, audioBuffer, audioDuration) {
    // Early exit conditions
    if (!audioBuffer || audioBuffer.numberOfChannels < 2 || !landmarks || landmarks.length === 0) {
        return;
    }

    const envelopes = computeEnergyEnvelopes(audioBuffer);
    if (envelopes.length === 0) return;

    const { mouth, nose, hopTime } = envelopes;
    const numFrames = envelopes.length;

    // Compute first-difference derivatives
    const mouthDeriv = new Float32Array(numFrames);
    const noseDeriv = new Float32Array(numFrames);
    for (let i = 1; i < numFrames; i++) {
        mouthDeriv[i] = mouth[i] - mouth[i - 1];
        noseDeriv[i] = nose[i] - nose[i - 1];
    }

    // Sort landmarks by time for windowing
    landmarks.sort((a, b) => a.time - b.time);

    for (let idx = 0; idx < landmarks.length; idx++) {
        const lm = landmarks[idx];

        // Skip user-placed landmarks
        if (lm.source === 'user') continue;

        const type = lm.type;

        // V: search forward only from keyframe, wide enough to find peak energy of the vowel
        // G: tight radius (50ms)
        // Others: wider radius (150ms) for onset/offset detection
        const maxRadius = (type === 'V') ? 0.150 : (type === 'G') ? 0.050 : 0.150;

        // Compute search window: midpoint to neighbors, clamped to ±maxRadius
        const prevTime = idx > 0 ? landmarks[idx - 1].time : 0;
        const nextTime = idx < landmarks.length - 1 ? landmarks[idx + 1].time : audioDuration;

        // Vowels: search forward from keyframe time + 20ms to skip past preceding burst transient
        // and find the vowel's own peak energy (steady-state)
        const windowStart = (type === 'V')
            ? lm.time + 0.020
            : Math.max(lm.time - maxRadius, (prevTime + lm.time) / 2);
        const windowEnd = Math.min(lm.time + maxRadius, (lm.time + nextTime) / 2);

        // Convert time window to frame indices
        const startFrame = Math.max(1, Math.floor(windowStart / hopTime));
        const endFrame = Math.min(numFrames - 1, Math.ceil(windowEnd / hopTime));

        if (startFrame >= endFrame) continue;

        // Type-specific strategy
        let bestFrame = -1;

        if (type === 'V') {
            // Find peak mouth energy
            let bestVal = -Infinity;
            for (let f = startFrame; f <= endFrame; f++) {
                if (mouth[f] > bestVal) {
                    bestVal = mouth[f];
                    bestFrame = f;
                }
            }
        } else if (type === 'G') {
            // Glides transition between resonance states — find max |derivative|
            // (steepest rate of change in mouth energy, rising or falling)
            let bestVal = -Infinity;
            for (let f = startFrame; f <= endFrame; f++) {
                const absD = Math.abs(mouthDeriv[f]);
                if (absD > bestVal) {
                    bestVal = absD;
                    bestFrame = f;
                }
            }
        } else if (type === 'Nc') {
            // Find max positive nose derivative (steepest rise)
            let bestVal = -Infinity;
            for (let f = startFrame; f <= endFrame; f++) {
                if (noseDeriv[f] > bestVal) {
                    bestVal = noseDeriv[f];
                    bestFrame = f;
                }
            }
        } else if (type === 'Nr') {
            // Find max negative nose derivative (steepest drop)
            let bestVal = Infinity;
            for (let f = startFrame; f <= endFrame; f++) {
                if (noseDeriv[f] < bestVal) {
                    bestVal = noseDeriv[f];
                    bestFrame = f;
                }
            }
        } else if (type === 'Fc') {
            // Fricative closure = where energy rises most steeply (max positive gradient, low→high transition)
            let bestVal = -Infinity;
            for (let f = startFrame; f <= endFrame; f++) {
                if (mouthDeriv[f] > bestVal) {
                    bestVal = mouthDeriv[f];
                    bestFrame = f;
                }
            }
        } else if (type === 'Sc') {
            // Stop closure = max negative mouth gradient (steepest drop in oral energy)
            let bestVal = Infinity;
            for (let f = startFrame; f <= endFrame; f++) {
                if (mouthDeriv[f] < bestVal) {
                    bestVal = mouthDeriv[f];
                    bestFrame = f;
                }
            }
        } else if (type === 'Sr') {
            // Stop release = energy burst (max positive gradient, silence→energy explosion)
            let bestVal = -Infinity;
            for (let f = startFrame; f <= endFrame; f++) {
                if (mouthDeriv[f] > bestVal) {
                    bestVal = mouthDeriv[f];
                    bestFrame = f;
                }
            }
        } else if (type === 'Fr') {
            // Fricative release = where energy drops most steeply (max negative gradient, high→low transition)
            let bestVal = Infinity;
            for (let f = startFrame; f <= endFrame; f++) {
                if (mouthDeriv[f] < bestVal) {
                    bestVal = mouthDeriv[f];
                    bestFrame = f;
                }
            }
        }

        if (bestFrame >= 0) {
            lm.time = bestFrame * hopTime;
            // Perceptual offset: releases sound slightly after the mathematical gradient peak
            if (type === 'Sr' || type === 'Fr') {
                lm.time += 0.005;
            }
        }
    }

    // Post-validation: enforce minimum separation between adjacent landmarks
    const minSep = hopTime * 2;
    for (let i = 1; i < landmarks.length; i++) {
        if (landmarks[i].time - landmarks[i - 1].time < minSep) {
            landmarks[i].time = landmarks[i - 1].time + minSep;
        }
    }
}

// Phoneme display and parsing utilities

import { PHONEME_OVERLAP_THRESHOLD, LANDMARK_MAP } from './constants.js';

/**
 * Clean phoneme string, keeping only valid phoneme characters
 * @param {string} phoneme - Raw phoneme string
 * @returns {string} Cleaned phoneme
 */
export function cleanPhoneme(phoneme) {
    return phoneme.toLowerCase().replace(/[^a-zɪæʊuɔɑʌɚɹŋðʒθɛʃʧʤ]/g, '');
}

/**
 * Parse a phoneme name string to extract components
 * @param {string} name - Phoneme name (e.g., "{p(0)", "p]", "p}")
 * @returns {Object} Parsed components
 */
export function parsePhonemeName(name) {
    let leadingBrace = name.startsWith('{');
    let remaining = leadingBrace ? name.slice(1) : name;

    // Extract subphoneme index if present
    let subphoneme = null;
    const subMatch = remaining.match(/\((\d+)\)/);
    if (subMatch) {
        subphoneme = parseInt(subMatch[1], 10);
        remaining = remaining.replace(/\(\d+\)/, '');
    }

    // Extract base phoneme
    const baseMatch = remaining.match(/^[a-zɛɪæʊuɔɑʌɚɹŋðʒθʃʧʤ]+/i);
    let base = baseMatch ? baseMatch[0].toLowerCase() : '';
    remaining = remaining.slice(base.length);

    // Check for trailing markers
    const trailingEnd = remaining.includes('}');
    const trailingClosure = remaining.includes(']');

    return { base, subphoneme, leadingBrace, trailingEnd, trailingClosure };
}

/**
 * Get phoneme category for coloring
 * @param {string} basePhoneme - Base phoneme character
 * @returns {string} Category: 'vowel', 'stop', 'fricative', 'nasal', 'glide', 'affricate', or 'consonant'
 */
function getPhonemeCategory(basePhoneme) {
    const cleaned = cleanPhoneme(basePhoneme);

    for (const [type, phonemes] of Object.entries(LANDMARK_MAP)) {
        if (phonemes.includes(cleaned)) {
            switch (type) {
                case 'V': return 'vowel';
                case 'S': return 'stop';
                case 'F': return 'fricative';
                case 'N': return 'nasal';
                case 'G': return 'glide';
                case 'A': return 'affricate';
            }
        }
    }
    return 'consonant';
}

/**
 * Draw phoneme timeline bar with segments
 * @param {Object} phonemeData - Phoneme data with keyframes
 * @param {number} audioDuration - Total audio duration
 * @param {number} canvasWidth - Width of display canvas
 */
export function drawPhonemes(phonemeData, audioDuration, canvasWidth) {
    const container = document.getElementById('phoneme-timeline');
    container.innerHTML = '';

    if (!phonemeData?.keyframes) return;

    const sortedKeyframes = [...phonemeData.keyframes].sort((a, b) => a.time - b.time);

    sortedKeyframes.forEach((keyframe, index) => {
        const startTime = keyframe.time;
        const nextKeyframe = sortedKeyframes[index + 1];
        // Clamp endTime to audioDuration
        const endTime = Math.min(nextKeyframe ? nextKeyframe.time : audioDuration, audioDuration);
        const duration = endTime - startTime;

        if (duration <= 0) return;

        const leftPx = (startTime / audioDuration) * canvasWidth;
        let widthPx = (duration / audioDuration) * canvasWidth;

        // Clamp right edge to canvas bounds
        const clampedWidth = Math.min(widthPx, canvasWidth - leftPx);
        if (clampedWidth <= 0) return;

        const segment = document.createElement('div');
        segment.className = 'timeline-segment';

        const parsed = parsePhonemeName(keyframe.name);
        const category = getPhonemeCategory(parsed.base);

        segment.classList.add(category);

        if (parsed.trailingClosure || keyframe.isHold) {
            segment.classList.add('hold');
        }

        if (keyframe.isSilent || keyframe.intensity === 0 || keyframe.name === '.' || keyframe.name === '_') {
            segment.classList.remove(category);
            segment.classList.add('silent');
        }

        segment.style.left = `${leftPx}px`;
        segment.style.width = `${clampedWidth}px`;

        const displayName = keyframe.name
            .replace(/[\[\]{}]/g, '')
            .trim();
        segment.textContent = displayName;
        segment.title = `${keyframe.name}\nStart: ${(startTime * 1000).toFixed(0)}ms\nDuration: ${(duration * 1000).toFixed(0)}ms`;

        container.appendChild(segment);
    });
}

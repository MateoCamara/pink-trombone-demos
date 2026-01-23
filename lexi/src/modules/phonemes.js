// Phoneme display and parsing utilities

import { PHONEME_OVERLAP_THRESHOLD } from './constants.js';

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
 * Draw phoneme labels on the display
 * @param {Object} phonemeData - Phoneme data with keyframes
 * @param {number} audioDuration - Total audio duration
 * @param {number} canvasWidth - Width of display canvas
 */
export function drawPhonemes(phonemeData, audioDuration, canvasWidth) {
    const container = document.getElementById('phonemes');
    container.innerHTML = '';

    if (!phonemeData?.keyframes) return;

    // Sort by time
    const sortedKeyframes = [...phonemeData.keyframes].sort((a, b) => a.time - b.time);

    // Track last position to avoid overlap
    let lastPosition = -Infinity;

    sortedKeyframes.forEach(keyframe => {
        const time = keyframe.time;
        const position = Math.round((time / audioDuration) * canvasWidth);

        const label = document.createElement('div');
        label.className = 'phoneme-label';

        // Identify main phonemes (not subphonemes or hold markers)
        const isMain = !keyframe.isSubPhoneme && !/[\]}]/.test(keyframe.name);
        if (isMain) label.classList.add('main');

        // Clean the display name
        const cleanName = keyframe.name
            .replace(/[\[\]{}()0-9]/g, '')
            .trim();

        label.style.left = `${position}px`;
        label.textContent = cleanName;

        // Avoid overlap by alternating vertical position
        if (Math.abs(position - lastPosition) < PHONEME_OVERLAP_THRESHOLD) {
            label.style.top = '-20px';
            label.style.bottom = 'auto';
        }

        // Truncate long names
        if (cleanName.length > 4) {
            label.textContent = cleanName.substring(0, 4) + '…';
            label.title = cleanName;
        }

        container.appendChild(label);
        lastPosition = position;
    });
}

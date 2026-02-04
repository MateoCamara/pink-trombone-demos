// Acoustic landmark detection and display

import { LANDMARK_MAP, LANDMARK_EXPORT_VERSION } from './constants.js';
import { cleanPhoneme, parsePhonemeName } from './phonemes.js';

/**
 * Get landmark type for a phoneme
 * @param {string} basePhoneme - Base phoneme character
 * @returns {string|null} Landmark type (V, G, N, F, S, A) or null
 */
export function getLandmarkType(basePhoneme) {
    const cleaned = cleanPhoneme(basePhoneme);
    const exactMatch = Object.entries(LANDMARK_MAP).find(([_, phs]) =>
        phs.includes(cleaned)
    );
    if (exactMatch) return exactMatch[0];
    return null;
}

/**
 * Draw acoustic landmarks based on phoneme data
 * @param {Object} phonemeData - Phoneme data with keyframes
 * @param {number} audioDuration - Total audio duration
 * @param {number} canvasWidth - Width of display canvas
 * @returns {Array} Calculated landmarks array
 */
export function drawLandmarks(phonemeData, audioDuration, canvasWidth) {
    const container = document.getElementById('landmarks');
    container.innerHTML = '';

    const calculatedLandmarks = [];

    // Group consecutive phonemes by type
    const groups = [];
    let currentGroup = null;

    phonemeData.keyframes.forEach(kf => {
        if (kf.name === '.') return;

        const parsed = parsePhonemeName(kf.name);
        const baseType = getLandmarkType(parsed.base);
        if (!baseType) return;

        // Determine group key based on phoneme type
        let groupKey;
        if (['S', 'F', 'N'].includes(baseType)) {
            groupKey = `${baseType}-${parsed.base}`;
        } else if (baseType === 'G') {
            groupKey = `G-${parsed.base}`;
        } else {
            groupKey = `single-${kf.time}`;
        }

        // Start new group if key changes
        if (!currentGroup || currentGroup.key !== groupKey) {
            currentGroup = {
                key: groupKey,
                type: baseType,
                elements: [],
                parsed: []
            };
            groups.push(currentGroup);
        }

        currentGroup.elements.push(kf);
        currentGroup.parsed.push(parsed);
        if (parsed.leadingBrace) currentGroup.hasLeadingBrace = true;
    });

    // Track if we've seen a non-silence keyframe yet (for word-initial detection)
    const firstKeyframeTime = phonemeData.keyframes.find(kf => kf.name !== '.')?.time;

    // Process each group to generate landmarks
    groups.forEach(group => {
        const type = group.type;
        const elements = group.elements;
        const parsed = group.parsed;

        // Check if this is word-initial (first element is the first keyframe)
        const isWordInitial = elements[0].time === firstKeyframeTime;

        if (type === 'V') {
            // Vowels: single landmark at each vowel time
            elements.forEach(kf => createLandmark(kf.time, 'V', kf.name));
        } else if (type === 'G') {
            // Glides: single landmark at midpoint
            const start = elements[0].time;
            const end = elements[elements.length - 1].time;
            const mid = (start + end) / 2;
            createLandmark(mid, 'G', elements[0].name);
        } else if (['S', 'F', 'N'].includes(type)) {
            // Stops, Fricatives, Nasals: closure and release landmarks
            // Skip closure for word-initial stops (e.g., "tap" starts with t, no SC)
            if (!isWordInitial || type !== 'S') {
                const closureIdx = 0;
                const closureTime = elements[closureIdx].time;
                createLandmark(closureTime, `${type}c`, elements[closureIdx].name);
            }

            if (type === 'S') {
                // For stops: release at subphoneme 1 position (t(1) or p(1))
                const splitIndex = parsed.findIndex(p => p.subphoneme === 1);

                if (splitIndex > 0) {
                    // Use the first subphoneme 1 time directly
                    const releaseTime = elements[splitIndex].time;
                    createLandmark(releaseTime, `${type}r`, elements[splitIndex].name);
                } else {
                    // Fallback: use element with trailing } or last element
                    const releaseElement = elements.findLast(e =>
                        parsePhonemeName(e.name).trailingEnd
                    ) || elements[elements.length - 1];
                    createLandmark(releaseElement.time, `${type}r`, releaseElement.name);
                }
            } else {
                // For F and N: use trailing } marker
                const releaseElement = elements.findLast(e =>
                    parsePhonemeName(e.name).trailingEnd
                ) || elements[elements.length - 1];
                createLandmark(releaseElement.time, `${type}r`, releaseElement.name);
            }
        }
    });

    /**
     * Create and display a landmark
     */
    function createLandmark(time, type, name) {
        const position = (time / audioDuration) * canvasWidth;
        const landmark = document.createElement('div');
        landmark.className = `landmark ${type}`;
        landmark.style.left = `${position}px`;
        landmark.title = name;

        const bar = document.createElement('div');
        bar.className = 'landmark-bar';
        landmark.appendChild(bar);

        const label = document.createElement('div');
        label.className = 'landmark-label';
        label.textContent = type;
        landmark.appendChild(label);

        container.appendChild(landmark);

        // Store landmark data
        calculatedLandmarks.push({ type, time, name });
    }

    return calculatedLandmarks;
}

/**
 * Download landmarks as JSON file
 * @param {Array} landmarks - Calculated landmarks array
 * @param {number} sampleRate - Audio sample rate (optional)
 * @param {number} duration - Audio duration (optional)
 * @returns {boolean} Success status
 */
export function downloadLandmarks(landmarks, sampleRate = null, duration = null) {
    if (!landmarks || landmarks.length === 0) {
        alert('No landmarks calculated to download.');
        return false;
    }

    try {
        // Sort landmarks by time
        const sortedLandmarks = [...landmarks].sort((a, b) => a.time - b.time);

        // Create export object with metadata
        const exportData = {
            version: LANDMARK_EXPORT_VERSION,
            ...(sampleRate && { sampleRate }),
            ...(duration && { duration }),
            landmarks: sortedLandmarks
        };

        const landmarksJson = JSON.stringify(exportData, null, 2);
        const blob = new Blob([landmarksJson], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `landmarks_${new Date().toISOString().slice(0, 19)}.json`;
        document.body.appendChild(a);
        a.click();

        // Cleanup
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);

        return true;
    } catch (error) {
        console.error('Landmark download failed:', error);
        return false;
    }
}

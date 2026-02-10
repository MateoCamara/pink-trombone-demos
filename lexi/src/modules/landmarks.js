// Acoustic landmark detection, display, and interactive editing

import { LANDMARK_MAP, LANDMARK_EXPORT_VERSION, LANDMARK_TYPES } from './constants.js';
import { cleanPhoneme, parsePhonemeName } from './phonemes.js';
import { refineLandmarkPositions } from './energy-analysis.js';

// Landmark store: single source of truth for all landmarks
let landmarkStore = [];
let nextId = 1;
// Track deleted auto-landmark IDs so re-render doesn't recreate them
let deletedAutoIds = new Set();

// Current display params (cached for drag/add calculations)
let currentAudioDuration = 0;
let currentCanvasWidth = 0;

/**
 * Get the landmark store (for external access)
 */
export function getLandmarkStore() {
    return landmarkStore;
}

/**
 * Reset the landmark store
 */
export function resetLandmarkStore() {
    landmarkStore = [];
    deletedAutoIds = new Set();
    nextId = 1;
}

/**
 * Get landmark type for a phoneme
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
 * Draw acoustic landmarks based on phoneme data.
 * Populates auto-detected landmarks into the store, preserves user landmarks.
 * @param {Object} phonemeData - Phoneme data with keyframes
 * @param {number} audioDuration - Total audio duration
 * @param {number} canvasWidth - Width of display canvas
 * @param {AudioBuffer|null} audioBuffer - Optional audio buffer for energy-based refinement
 * @returns {Array} All landmarks in the store
 */
export function drawLandmarks(phonemeData, audioDuration, canvasWidth, audioBuffer = null) {
    const container = document.getElementById('landmarks');
    container.innerHTML = '';

    currentAudioDuration = audioDuration;
    currentCanvasWidth = canvasWidth;

    // Preserve user-added landmarks, clear auto-detected ones
    landmarkStore = landmarkStore.filter(lm => lm.source === 'user');

    // Generate auto-detected landmarks
    const autoLandmarks = generateAutoLandmarks(phonemeData, audioDuration);

    // Refine positions using energy envelopes (if audio available)
    if (audioBuffer) {
        refineLandmarkPositions(autoLandmarks, audioBuffer, audioDuration);
    }

    // Add auto-landmarks to store (skip if previously deleted)
    autoLandmarks.forEach(lm => {
        const autoKey = `${lm.type}-${lm.originalTime.toFixed(6)}`;
        if (!deletedAutoIds.has(autoKey)) {
            lm.id = nextId++;
            landmarkStore.push(lm);
        }
    });

    // Render all landmarks
    landmarkStore.forEach(lm => renderLandmarkElement(lm, container));

    // Setup container interactions (drag + double-click to add)
    setupContainerInteractions(container);

    return landmarkStore;
}

/**
 * Generate auto-detected landmarks from phoneme data (no DOM, pure data).
 * Uses articulatory state changes encoded in keyframe data to detect
 * closure and release events.
 */
function generateAutoLandmarks(phonemeData, audioDuration) {
    const landmarks = [];

    // Group consecutive keyframes by phoneme type and base
    const groups = [];
    let currentGroup = null;

    phonemeData.keyframes.forEach(kf => {
        if (kf.name === '.') return;

        const parsed = parsePhonemeName(kf.name);
        const baseType = getLandmarkType(parsed.base);
        if (!baseType) return;

        let groupKey;
        if (['S', 'F', 'N'].includes(baseType)) {
            groupKey = `${baseType}-${parsed.base}`;
        } else if (baseType === 'G') {
            groupKey = `G-${parsed.base}`;
        } else {
            groupKey = `single-${kf.time}`;
        }

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
    });

    groups.forEach((group, groupIndex) => {
        const type = group.type;
        const elements = group.elements;
        const parsed = group.parsed;

        if (type === 'V') {
            // Vowels: single landmark at keyframe time
            elements.forEach(kf => {
                landmarks.push({
                    type: 'V', time: kf.time, name: kf.name,
                    source: 'auto', originalTime: kf.time
                });
            });
        } else if (type === 'G') {
            // Glides: single landmark at midpoint
            const start = elements[0].time;
            const end = elements[elements.length - 1].time;
            const mid = (start + end) / 2;
            landmarks.push({
                type: 'G', time: mid, name: elements[0].name,
                source: 'auto', originalTime: mid
            });
        } else if (['S', 'F', 'N'].includes(type)) {
            const isMultiPhase = parsed.some(p => p.subphoneme !== null);
            // First consonant in utterance has no closure (nothing precedes it)
            const isUtteranceInitial = groupIndex === 0;

            if (isMultiPhase) {
                // Multi-phase consonants (stops b,d,g,p,t,k and velar nasal ŋ):
                // Closure = subphoneme 0 non-hold keyframe time
                // Release = subphoneme 1 non-hold keyframe time
                const closureKf = elements.find((_, i) =>
                    parsed[i].subphoneme === 0 && !parsed[i].trailingClosure
                );
                const releaseKf = elements.find((_, i) =>
                    parsed[i].subphoneme === 1 && !parsed[i].trailingClosure
                );

                if (closureKf && !isUtteranceInitial) {
                    landmarks.push({
                        type: `${type}c`, time: closureKf.time, name: closureKf.name,
                        source: 'auto', originalTime: closureKf.time
                    });
                }
                if (releaseKf) {
                    landmarks.push({
                        type: `${type}r`, time: releaseKf.time, name: releaseKf.name,
                        source: 'auto', originalTime: releaseKf.time
                    });
                }
            } else {
                // Single-phase consonants (nasals m,n and all fricatives):
                // Closure = first non-hold keyframe time
                // Release = hold keyframe ']' time
                const closureKf = elements.find((_, i) =>
                    !parsed[i].trailingClosure
                );
                const releaseKf = elements.find((_, i) =>
                    parsed[i].trailingClosure
                );

                if (closureKf && !isUtteranceInitial) {
                    landmarks.push({
                        type: `${type}c`, time: closureKf.time, name: closureKf.name,
                        source: 'auto', originalTime: closureKf.time
                    });
                }
                if (releaseKf) {
                    landmarks.push({
                        type: `${type}r`, time: releaseKf.time, name: releaseKf.name,
                        source: 'auto', originalTime: releaseKf.time
                    });
                }
            }
        }
    });

    return landmarks;
}

/**
 * Render a single landmark element into the container
 */
function renderLandmarkElement(lm, container) {
    const position = (lm.time / currentAudioDuration) * currentCanvasWidth;

    const landmark = document.createElement('div');
    landmark.className = `landmark ${lm.type}`;
    if (lm.source === 'user') landmark.classList.add('user-landmark');
    landmark.style.left = `${position}px`;
    landmark.title = lm.name;
    landmark.dataset.landmarkId = lm.id;

    const bar = document.createElement('div');
    bar.className = 'landmark-bar';
    landmark.appendChild(bar);

    const label = document.createElement('div');
    label.className = 'landmark-label';
    label.textContent = lm.source === 'user' ? `${lm.type}*` : lm.type;
    landmark.appendChild(label);

    // Delete button (visible on hover via CSS)
    const deleteBtn = document.createElement('div');
    deleteBtn.className = 'landmark-delete';
    deleteBtn.textContent = '\u00d7';
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteLandmark(lm.id);
        landmark.remove();
    });
    landmark.appendChild(deleteBtn);

    container.appendChild(landmark);
}

/**
 * Delete a landmark from the store
 */
function deleteLandmark(id) {
    const lm = landmarkStore.find(l => l.id === id);
    if (lm && lm.source === 'auto') {
        // Mark as deleted so re-render doesn't recreate
        const autoKey = `${lm.type}-${lm.originalTime.toFixed(6)}`;
        deletedAutoIds.add(autoKey);
    }
    landmarkStore = landmarkStore.filter(l => l.id !== id);
}

/**
 * Setup drag and double-click interactions on the landmarks container
 */
function setupContainerInteractions(container) {
    let dragTarget = null;
    let dragStartX = 0;
    let dragOriginalLeft = 0;

    // Drag: mousedown on landmark elements
    container.addEventListener('mousedown', (e) => {
        const landmarkEl = e.target.closest('.landmark');
        if (!landmarkEl || e.target.classList.contains('landmark-delete')) return;

        dragTarget = landmarkEl;
        dragStartX = e.clientX;
        dragOriginalLeft = parseFloat(landmarkEl.style.left);
        landmarkEl.classList.add('dragging');
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!dragTarget) return;
        const dx = e.clientX - dragStartX;
        let newLeft = dragOriginalLeft + dx;
        // Clamp to container bounds
        newLeft = Math.max(0, Math.min(newLeft, currentCanvasWidth));
        dragTarget.style.left = `${newLeft}px`;
    });

    document.addEventListener('mouseup', () => {
        if (!dragTarget) return;
        const newLeft = parseFloat(dragTarget.style.left);
        const newTime = (newLeft / currentCanvasWidth) * currentAudioDuration;

        // Update store
        const id = parseInt(dragTarget.dataset.landmarkId, 10);
        const lm = landmarkStore.find(l => l.id === id);
        if (lm) lm.time = newTime;

        dragTarget.classList.remove('dragging');
        dragTarget = null;
    });

    // Double-click to add new landmark
    container.addEventListener('dblclick', (e) => {
        // Only on empty space
        if (e.target.closest('.landmark')) return;

        const rect = container.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickTime = (clickX / currentCanvasWidth) * currentAudioDuration;

        showLandmarkPicker(clickX, e.clientY - rect.top, clickTime, container);
    });
}

/**
 * Show a popover to pick landmark type for adding a new landmark
 */
function showLandmarkPicker(x, y, time, container) {
    // Remove existing picker if any
    const existing = document.getElementById('landmark-picker');
    if (existing) existing.remove();

    const picker = document.createElement('div');
    picker.id = 'landmark-picker';
    picker.className = 'landmark-picker';
    picker.style.left = `${x}px`;
    picker.style.top = `${y - 60}px`;

    LANDMARK_TYPES.forEach(type => {
        const btn = document.createElement('button');
        btn.className = `picker-btn ${type}`;
        btn.textContent = type;
        btn.addEventListener('click', () => {
            addUserLandmark(type, time, container);
            picker.remove();
        });
        picker.appendChild(btn);
    });

    container.appendChild(picker);

    // Close picker on outside click
    const closeHandler = (e) => {
        if (!picker.contains(e.target)) {
            picker.remove();
            document.removeEventListener('click', closeHandler);
        }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
}

/**
 * Add a user-created landmark
 */
function addUserLandmark(type, time, container) {
    const lm = {
        id: nextId++,
        type,
        time,
        name: `user-${type}`,
        source: 'user',
        originalTime: time
    };
    landmarkStore.push(lm);
    renderLandmarkElement(lm, container);
}

/**
 * Get exportable landmarks (auto + user, minus deleted)
 * @returns {Array} Landmarks in export format {type, time, name}
 */
export function getExportLandmarks() {
    return landmarkStore
        .map(lm => ({ type: lm.type, time: lm.time, name: lm.name }))
        .sort((a, b) => a.time - b.time);
}

/**
 * Download landmarks as JSON file
 * @param {number} sampleRate - Audio sample rate (optional)
 * @param {number} duration - Audio duration (optional)
 * @returns {boolean} Success status
 */
export function downloadLandmarks(sampleRate = null, duration = null) {
    const landmarks = getExportLandmarks();
    if (landmarks.length === 0) {
        alert('No landmarks calculated to download.');
        return false;
    }

    try {
        const exportData = {
            version: LANDMARK_EXPORT_VERSION,
            ...(sampleRate && { sampleRate }),
            ...(duration && { duration }),
            landmarks
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

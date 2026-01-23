// Configuration constants for LEXI module

export const FFT_SIZE = 512;
export const WAVEFORM_COLOR = '#FF6B6B';
export const WAVEFORM_LINE_WIDTH = 1.5;
export const VERTICAL_MARGIN_PERCENT = 0.95; // 5% margin on each side

export const SPECTROGRAM_MIN_DB = -100;
export const SPECTROGRAM_MAX_DB = 0;

export const PHONEME_OVERLAP_THRESHOLD = 50; // pixels

// Acoustic landmark classification map
// Maps phoneme categories to their member phonemes
export const LANDMARK_MAP = {
    'V': ['i', 'ɛ', 'ɪ', 'æ', 'ʊ', 'u', 'ɔ', 'ɑ', 'ʌ', 'ɚ', 'o', 'a', 'e'], // Vowels
    'G': ['w', 'y', 'l', 'ɹ', 'h', 'j'], // Glides
    'N': ['m', 'n', 'ŋ'], // Nasals
    'F': ['v', 'ð', 'z', 'ʒ', 'f', 'θ', 's', 'ʃ'], // Fricatives
    'S': ['b', 'd', 'g', 'p', 't', 'k'], // Stops
    'A': ['ʧ', 'ʤ'] // Affricates
};

// Landmark export format version
export const LANDMARK_EXPORT_VERSION = '1.0';

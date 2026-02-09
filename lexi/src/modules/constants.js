// Configuration constants for LEXI module

export const FFT_SIZE = 512;
export const VERTICAL_MARGIN_PERCENT = 0.95; // 5% margin on each side

export const SPECTROGRAM_MIN_DB = -100;
export const SPECTROGRAM_MAX_DB = 0;

export const PHONEME_OVERLAP_THRESHOLD = 50; // pixels

// Acoustic landmark classification map
export const LANDMARK_MAP = {
    'V': ['i', 'ɛ', 'ɪ', 'æ', 'ʊ', 'u', 'ɔ', 'ɑ', 'ʌ', 'o', 'a', 'e'], // Vowels
    'G': ['w', 'y', 'l', 'ɹ', 'h', 'j', 'ʤ', 'dʒ', 'ɚ'], // Glides
    'N': ['m', 'n', 'ŋ'], // Nasals
    'F': ['v', 'ð', 'z', 'ʒ', 'f', 'θ', 's', 'ʃ', 'ʧ', 'tʃ'], // Fricatives
    'S': ['b', 'd', 'g', 'p', 't', 'k'], // Stops
    'A': ['ʧ', 'ʤ'] // Affricates
};

// Landmark export format version
export const LANDMARK_EXPORT_VERSION = '1.0';

// Landmark types available for manual addition
export const LANDMARK_TYPES = ['V', 'G', 'N', 'Nc', 'Nr', 'F', 'Fc', 'Fr', 'S', 'Sc', 'Sr'];

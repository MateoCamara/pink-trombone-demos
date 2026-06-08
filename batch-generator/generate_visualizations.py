"""
Generate waveform and spectrogram visualizations with landmarks for supervisor report
"""

import os
import json
import numpy as np
import librosa
import librosa.display
import matplotlib.pyplot as plt
from pathlib import Path

# Configuration
INPUT_DIR = Path("output/supervisor")
OUTPUT_DIR = Path("output/website")
SAMPLE_RATE = 44100

# Long vowel words (for duration pairs - only show one vowel landmark in middle)
LONG_VOWEL_WORDS = {'beat', 'seat', 'leak', 'peel', 'sheep'}

# Landmark colors
LANDMARK_COLORS = {
    'V': '#2ecc71',   # Green for vowels
    'Vc': '#27ae60',  # Darker green for vowel closure
    'Vr': '#2ecc71',  # Green for vowel release
    'Sc': '#e74c3c',  # Red for stop closure
    'Sr': '#c0392b',  # Darker red for stop release
    'Fc': '#3498db',  # Blue for fricative closure
    'Fr': '#2980b9',  # Darker blue for fricative release
    'Nc': '#9b59b6',  # Purple for nasal closure
    'Nr': '#8e44ad',  # Darker purple for nasal release
    'Gc': '#f39c12',  # Orange for glide closure
    'Gr': '#e67e22',  # Darker orange for glide release
    'Ac': '#1abc9c',  # Teal for affricate closure
    'Ar': '#16a085',  # Darker teal for affricate release
}

def get_landmark_color(landmark_type):
    """Get color for landmark type"""
    return LANDMARK_COLORS.get(landmark_type, '#95a5a6')

def load_audio(wav_path):
    """Load audio file"""
    y, sr = librosa.load(wav_path, sr=SAMPLE_RATE)
    return y, sr

def load_landmarks(json_path, word, duration):
    """Load landmarks from JSON file"""
    if not json_path.exists():
        return []

    with open(json_path) as f:
        landmarks = json.load(f)

    # For long vowel words, consolidate vowel landmarks to single middle one
    if word in LONG_VOWEL_WORDS:
        vowel_landmarks = [lm for lm in landmarks if lm.get('type', '').startswith('V')]
        other_landmarks = [lm for lm in landmarks if not lm.get('type', '').startswith('V')]

        if len(vowel_landmarks) >= 2:
            # Get the vowel times and find middle
            vowel_times = [lm['time'] for lm in vowel_landmarks]
            middle_time = (min(vowel_times) + max(vowel_times)) / 2

            # Create single vowel landmark at middle
            consolidated_vowel = {
                'type': 'V',
                'time': middle_time,
                'name': vowel_landmarks[0].get('name', 'V')
            }
            landmarks = other_landmarks + [consolidated_vowel]

    return landmarks

def generate_waveform(y, sr, landmarks, output_path, figsize=(10, 3)):
    """Generate waveform visualization with landmarks"""
    duration = len(y) / sr
    times = np.linspace(0, duration, len(y))

    fig, ax = plt.subplots(figsize=figsize)

    # Plot waveform
    ax.plot(times, y, color='#3498db', linewidth=0.5, alpha=0.8)
    ax.fill_between(times, y, alpha=0.3, color='#3498db')

    # Add landmarks
    for lm in landmarks:
        lm_time = lm.get('time', 0)
        lm_type = lm.get('type', '')
        color = get_landmark_color(lm_type)

        ax.axvline(x=lm_time, color=color, linestyle='--', linewidth=2, alpha=0.8)
        ax.text(lm_time, ax.get_ylim()[1] * 0.9, lm_type,
                color=color, fontsize=10, fontweight='bold',
                ha='center', va='top')

    ax.set_xlabel('Time (s)', fontsize=11)
    ax.set_ylabel('Amplitude', fontsize=11)
    ax.set_xlim(0, duration)
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight',
                facecolor='white', edgecolor='none')
    plt.close()

def generate_spectrogram(y, sr, landmarks, output_path, figsize=(10, 4)):
    """Generate spectrogram visualization with landmarks"""
    duration = len(y) / sr

    # Compute spectrogram
    n_fft = 2048
    hop_length = 512
    S = librosa.stft(y, n_fft=n_fft, hop_length=hop_length)
    S_db = librosa.amplitude_to_db(np.abs(S), ref=np.max)

    fig, ax = plt.subplots(figsize=figsize)

    # Plot spectrogram without colorbar
    img = librosa.display.specshow(S_db, sr=sr, hop_length=hop_length,
                                    x_axis='time', y_axis='hz', ax=ax,
                                    cmap='magma')

    # Set y-axis limit first so we know the range
    max_freq = 8000
    ax.set_ylim(0, max_freq)

    # Add landmarks - position labels inside the spectrogram area
    for lm in landmarks:
        lm_time = lm.get('time', 0)
        lm_type = lm.get('type', '')
        color = get_landmark_color(lm_type)

        # Draw vertical line across the spectrogram
        ax.axvline(x=lm_time, color=color, linestyle='--', linewidth=2.5, alpha=0.9)

        # Place label at top of spectrogram (inside the plot area)
        ax.text(lm_time, max_freq * 0.92, lm_type,
                color='white', fontsize=11, fontweight='bold',
                ha='center', va='top',
                bbox=dict(boxstyle='round,pad=0.3', facecolor=color, alpha=0.85, edgecolor='white', linewidth=1))

    ax.set_xlabel('Time (s)', fontsize=11)
    ax.set_ylabel('Frequency (Hz)', fontsize=11)

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight',
                facecolor='white', edgecolor='none')
    plt.close()

def process_category(category_dir, output_category_dir):
    """Process all words in a category"""
    output_category_dir.mkdir(parents=True, exist_ok=True)

    results = []

    # Find all WAV files
    wav_files = sorted(category_dir.glob("*.wav"))

    for wav_path in wav_files:
        word = wav_path.stem
        print(f"  Processing: {word}")

        # Load audio
        y, sr = load_audio(wav_path)
        duration = len(y) / sr

        # Load landmarks
        landmarks_path = category_dir / f"{word}_landmarks.json"
        landmarks = load_landmarks(landmarks_path, word, duration)

        # Generate visualizations
        waveform_path = output_category_dir / f"{word}_waveform.png"
        spectrogram_path = output_category_dir / f"{word}_spectrogram.png"

        generate_waveform(y, sr, landmarks, waveform_path)
        generate_spectrogram(y, sr, landmarks, spectrogram_path)

        # Copy WAV file
        import shutil
        shutil.copy(wav_path, output_category_dir / f"{word}.wav")

        results.append({
            'word': word,
            'duration': round(duration, 2),
            'landmarks': landmarks,
            'is_long_vowel': word in LONG_VOWEL_WORDS
        })

    return results

def main():
    """Main processing function"""
    print("Generating visualizations for supervisor report")
    print("=" * 50)

    # Create output directory
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    all_categories = {}

    # Process each category
    for category_dir in sorted(INPUT_DIR.iterdir()):
        if not category_dir.is_dir():
            continue

        category_name = category_dir.name
        print(f"\n[{category_name}]")

        output_category_dir = OUTPUT_DIR / category_name
        results = process_category(category_dir, output_category_dir)

        all_categories[category_name] = {
            'name': category_name,
            'words': results
        }

    # Save metadata for website
    metadata_path = OUTPUT_DIR / "metadata.json"
    with open(metadata_path, 'w') as f:
        json.dump(all_categories, f, indent=2)

    print(f"\n{'=' * 50}")
    print(f"Visualizations saved to: {OUTPUT_DIR}")
    print(f"Metadata saved to: {metadata_path}")

if __name__ == "__main__":
    main()

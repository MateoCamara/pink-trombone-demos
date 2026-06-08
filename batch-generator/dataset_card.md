# Dataset Card for **Pink Trombone English Phonetic & Landmark Dataset**

**Repository:** `mcamara/all-words-in-english-with-pink-trombone`
**Modality:** Audio + time-aligned events (landmarks) + articulatory keyframes
**Language:** English (IPA)
**Sampling rate:** 44,100 Hz (mono)
**Voices:** two synthetic voices — `M` (male) and `F` (female)

---

## Summary

A large-scale, *clean* synthetic speech dataset generated with the **Pink Trombone**
articulatory synthesizer. Every English dictionary word is synthesized in **two
voices** (male and female). Each example links a word to:

1. **audio** — the synthesized waveform (44.1 kHz, mono, WAV),
2. **utterance** — the articulatory keyframes driving the synthesis (`{name, keyframes}`),
3. **landmarks** — time-aligned acoustic landmarks detected from the audio.

## Fields

| Field | Type | Description |
|------|------|-------------|
| `id` | string | Orthographic word (e.g. `"hello"`). Repeats once per voice. |
| `audio` | Audio (44.1 kHz) | Synthesized mono waveform. |
| `utterance` | string (JSON) | `getUtterance()` output: `{ "name", "keyframes": [...] }` with per-phoneme articulatory parameters (tongue/constriction positions, tenseness, intensity, frequency, timing). |
| `landmarks` | string (JSON) | Array of `{ "type", "time", "name" }`. Landmark times are in seconds. |
| `sex` | string | `"M"` (male) or `"F"` (female). |

## Landmark types

| Type | Meaning |
|------|---------|
| `Sc` / `Sr` | Stop closure / release |
| `Fc` / `Fr` | Fricative closure / release |
| `Nc` / `Nr` | Nasal closure / release |
| `V` | Vowel (mid-frequency energy peak) |
| `G` | Glide (formant transition) |

## Voice parameters

| Voice | F0 | Vocal tract length |
|-------|-----|--------------------|
| `M` (male) | 140 Hz | 44 |
| `F` (female) | 220 Hz | 38 |

## Generation

Produced with the Pink Trombone web synthesizer driven headlessly via Playwright
(`pink-trombone-demos/batch-generator`). For each word: text → IPA → articulatory
keyframes (TTS module) → real-time synthesis + recording (Pink Trombone module) →
WAV + landmark extraction (LEXI module). Landmarks are detected from energy/articulatory
events. Audio is the synthesizer's native 44.1 kHz output (no resampling).

## Loading

```python
from datasets import load_dataset
ds = load_dataset("mcamara/all-words-in-english-with-pink-trombone", split="train")
ex = ds[0]
ex["audio"]      # {'array': ..., 'sampling_rate': 44100}
ex["id"], ex["sex"]
import json
json.loads(ex["landmarks"])
json.loads(ex["utterance"])

# filter one voice
male = ds.filter(lambda r: r["sex"] == "M")
```

## License

MIT.

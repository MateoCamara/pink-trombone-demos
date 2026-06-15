# Pink Trombone Demos — articulatory synthesis, landmark analysis & dataset generation

Browser-based demos built on the [Pink Trombone](https://dood.al/pinktrombone/)
articulatory speech synthesizer, extended with an acoustic **landmark** analysis
module (**LEXI**) and a headless **batch generator** that produces a large synthetic
speech + landmark dataset.

> 📄 This repository accompanies the paper
> **"An Acoustic Landmark Database of the English Lexicon via Articulatory Synthesis"** (2026).
> <!-- TODO: añadir autores, venue y DOI/enlace cuando estén disponibles. -->

It is a cleaned fork of [`zakaton/pink-trombone-demos`](https://github.com/zakaton/pink-trombone-demos)
by **Zack Qattan**, which builds on **Neil Thapen's** original Pink Trombone.

## Repository layout

| Path | What it is |
|------|------------|
| `pink-trombone/` | The Pink Trombone synthesizer (real-time vocal-tract animation + audio). |
| `tts/` | Text / phoneme → timed articulatory **keyframes**, sent to Pink Trombone. |
| `lexi/` | **L**andmark **EX**traction & **I**nspection: waveform, spectrogram and acoustic landmarks for the synthesized audio. |
| `batch-generator/` | Headless (Playwright) pipeline that runs the three modules to synthesize word lists → audio + utterance + landmarks. |
| `src/` | Shared code: phoneme tables (`utils.js`, `utils-v2.js`), Pink Trombone worklet, vendored libs, `english.txt` word list. |

## 1. Interactive demo (3 modules)

The `tts`, `pink-trombone` and `lexi` pages talk to each other through the
[BroadcastChannel API](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel),
so they must run from a local web server and be open simultaneously.

```bash
git clone https://github.com/MateoCamara/pink-trombone-demos.git
cd pink-trombone-demos
npm install -g live-server     # any static server works (Node.js required)
live-server                    # serves the repo; note the port it prints
```

Open these three pages in separate tabs (port may differ from `8080`):

- **TTS input:** `http://127.0.0.1:8080/tts/`
- **Pink Trombone:** `http://127.0.0.1:8080/pink-trombone/`
- **LEXI analysis:** `http://127.0.0.1:8080/lexi/`

Type a word or phoneme sequence in the TTS page and press *Play*: Pink Trombone
synthesizes and animates the vocal tract, and LEXI updates with the waveform,
spectrogram and acoustic landmarks. LEXI can export `audio.wav` and a
`landmarks.json` (`[{ type, time, name }]`).

## 2. Batch dataset generation

`batch-generator/` drives the same three modules **headlessly** with Playwright to
synthesize whole word lists, exporting per word: the audio (`.wav`), the articulatory
`utterance` keyframes, and the acoustic `landmarks`.

```bash
cd batch-generator
npm install                      # installs Playwright
npx playwright install chromium

# Terminal 1 — serve the demo modules (UTF-8 is required for IPA characters):
node serve.js                    # serves the repo root on http://localhost:8080

# Terminal 2 — generate:
node index.js --word hello       # single-word smoke test
node index.js --limit 50         # first 50 dictionary words
node index.js --voice M --resume # full run, male voice, resumable
```

**Useful flags** (see `index.js`): `--word`, `--words`, `--words-file`, `--limit`,
`--start`, `--count`, `--voice {M|F}`, `--browsers N`, `--resume`, `--filter-dict`.

Output is written under `batch-generator/output/` (plus `progress.json` for resume)
and is **not** versioned — see `.gitignore`. Two synthetic voices are produced:
`M` (140 Hz, tract length 44) and `F` (220 Hz, tract length 38), at 44.1 kHz mono.
The full schema is documented in [`batch-generator/dataset_card.md`](batch-generator/dataset_card.md).

### Generated dataset

The full corpus (every English dictionary word, both voices) is published on the
Hugging Face Hub:
**[`mcamara/all-words-in-english-with-pink-trombone`](https://huggingface.co/datasets/mcamara/all-words-in-english-with-pink-trombone)**.

```python
from datasets import load_dataset
ds = load_dataset("mcamara/all-words-in-english-with-pink-trombone", split="train")
```

## Credits & license

- **Pink Trombone** (original synthesizer): [Neil Thapen](https://dood.al/pinktrombone/).
- **Base demos** (fork source): [Zack Qattan](https://github.com/zakaton/pink-trombone-demos).
- **LEXI module, TTS keyframe generator, batch generator and this cleanup:** Mateo Cámara.

Released under the **MIT License** (see [`LICENSE`](LICENSE)). Upstream components
retain their original terms.

# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

Browser demos built on Pink Trombone (Neil Thapen), forked from Zack Qattan's
`pink-trombone-demos`, extended with the LEXI landmark module and a Playwright
batch generator. Accompanies a paper (see `README.md`). MIT licensed.

Only the paper-relevant modules are kept: `tts/`, `pink-trombone/`, `lexi/`,
`batch-generator/`, and shared `src/`. (Older experimental demos — 3d, knn,
machine-learning, lip-sync, etc. — and large generated datasets were removed and
purged from history; see the backup bundle if you need them.)

## Structure

- `src/` — shared code: phoneme tables (`utils.js` + `utils-v2.js`), Pink Trombone
  worklet, vendored libs (`ml5.min.js`, `essentia-wasm.umd.js`), `english.txt`.
- `tts/` — text/phoneme → timed keyframes (`tts/src/script.js`).
- `pink-trombone/` — synthesizer + vocal-tract animation; exposes the recording hooks.
- `lexi/` — waveform/spectrogram/landmark extraction; exports `.wav` + `landmarks.json`.
- `batch-generator/` — headless dataset pipeline (Playwright). Generated output goes
  to `batch-generator/output/` and is **gitignored** (published on HF instead).

The three web modules coordinate via the **BroadcastChannel API** and must be served
(not opened as `file://`) and open simultaneously. The batch generator's `serve.js`
serves the repo root with `charset=utf-8` (required so IPA characters in
`src/utils-v2.js` decode correctly).

## Changing phoneme parameters

Phoneme definitions live in both `src/utils.js` and `src/utils-v2.js`. Changes must
be made in BOTH files.

**IMPORTANT:** For word-initial consonants (first consonant in a word), the TTS
keyframe generator in `tts/src/script.js` applies **coarticulation** (~line 541+)
that overwrites the consonant's **tongue body** position with the following vowel's
tongue values. This only applies to `actualPhonemeIndex === 0`.

The coarticulation must ONLY apply tongue properties (`tongue.index`,
`tongue.diameter`). It must NEVER overwrite `frontConstriction.*` or
`backConstriction.*` — those produce the consonant's articulatory mechanism (stop
closure, frication noise, etc.). Overwriting them destroys the consonant (e.g.,
"too" → "who" when `t`'s front closure was replaced by the vowel's).

## Constriction slots

The Pink Trombone worklet has `numberOfConstrictions = 4` (indices 0-3). They are
claimed in order:
- Slot 0: frontConstriction
- Slot 1: backConstriction
- Slot 2: noseConstriction
- Slot 3: UI touch interaction

Any code referencing `_constrictions[N]` must use the correct slot index.

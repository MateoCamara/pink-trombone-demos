# Project Notes

## Changing phoneme parameters

Phoneme definitions live in both `src/utils.js` and `src/utils-v2.js`. Changes must be made in BOTH files.

**IMPORTANT:** For word-initial consonants (first consonant in a word), the TTS keyframe generator in `tts/src/script.js` applies **coarticulation** (~line 541+) that overwrites the consonant's **tongue body** position with the following vowel's tongue values. This only applies to `actualPhonemeIndex === 0`.

The coarticulation must ONLY apply tongue properties (`tongue.index`, `tongue.diameter`). It must NEVER overwrite `frontConstriction.*` or `backConstriction.*` — those produce the consonant's articulatory mechanism (stop closure, frication noise, etc.). Overwriting them destroys the consonant (e.g., "too" → "who" when `t`'s front closure was replaced by the vowel's).

## Constriction slots

The Pink Trombone worklet has `numberOfConstrictions = 4` (indices 0-3). They are claimed in order:
- Slot 0: frontConstriction
- Slot 1: backConstriction
- Slot 2: noseConstriction
- Slot 3: UI touch interaction

Any code referencing `_constrictions[N]` must use the correct slot index.

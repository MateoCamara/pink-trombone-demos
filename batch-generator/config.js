module.exports = {
  voices: {
    male: {
      frequency: 140,
      tractLength: 44,
      label: 'male'
    },
    female: {
      frequency: 220,
      tractLength: 38,
      label: 'female'
    }
  },

  // Number of parallel browser instances. Synthesis is real-time-bound (each
  // word records for ~its duration), so throughput scales with this until CPU
  // saturates. Headless browsers are light; on a many-core box 12-16 is a good
  // default. Override per-run with `--browsers N`.
  parallelBrowsers: 12,

  // Max times a worker will relaunch its browser after a crash before giving
  // up its remaining words (protects long full-dataset runs).
  maxBrowserRelaunches: 5,

  // Output directory (relative to batch-generator folder)
  outputDir: './output',

  // Server URL (must be running live-server or similar)
  serverUrl: 'http://localhost:8080',

  // Path to dictionary file (relative to batch-generator folder)
  dictionaryPath: '../src/english.txt',

  // Progress file for resume support
  progressFile: './progress.json',

  // --- Timing / robustness knobs ---

  // Run browsers headless. Current Chromium's headless mode records Web Audio
  // fine (verified: byte-for-byte comparable WAVs to headed), and it needs no
  // display and packs more instances per machine. Flip to false to watch.
  headless: true,

  // Max wait for LEXI to receive the synthesized audio (ms)
  synthesisTimeout: 15000,

  // Pause after the audio context is started, to let everything settle (ms)
  warmupDelay: 1000,

  // Delay between words to avoid overwhelming the audio pipeline (ms)
  delayBetweenWords: 50,

  // Delay after resetting LEXI before the next synthesis (ms)
  resetDelay: 100,

  // Per-word retry attempts on transient browser errors
  wordRetries: 3,

  // Audio extraction: poll attempts and gap, since the WAV can lag the
  // isLexiReady() signal by a few hundred ms
  audioExtractAttempts: 8,
  audioExtractDelay: 300,

  // Minimum byte length for a WAV to be considered valid (header is 44 bytes)
  minWavBytes: 1000
};

const { Worker } = require('worker_threads');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { sanitizeFilename, log } = require('./util');

const workerFile = './playwright-worker.js';

// --- CLI parsing -----------------------------------------------------------

function getOpt(args, name) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : undefined;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  return {
    voice: getOpt(args, '--voice') || null,
    resume: args.includes('--resume'),
    filterDict: args.includes('--filter-dict'),
    browsers: getOpt(args, '--browsers') ? parseInt(getOpt(args, '--browsers'), 10) : null,

    // Word source / selection
    wordsFile: getOpt(args, '--words-file') || null,
    limit: getOpt(args, '--limit') ? parseInt(getOpt(args, '--limit'), 10) : null,
    start: getOpt(args, '--start') ? parseInt(getOpt(args, '--start'), 10) : 0,
    count: getOpt(args, '--count') ? parseInt(getOpt(args, '--count'), 10) : null,
    word: getOpt(args, '--word') || null,
    words: getOpt(args, '--words') || null,

    // Back-compat shortcuts
    test: getOpt(args, '--test') || null,
    testBatch: getOpt(args, '--test-batch') ? parseInt(getOpt(args, '--test-batch'), 10) : null
  };
}

// --- Word list -------------------------------------------------------------

function loadWordList(wordsFile) {
  const dictPath = wordsFile
    ? path.resolve(__dirname, wordsFile)
    : path.join(__dirname, config.dictionaryPath);
  const content = fs.readFileSync(dictPath, 'utf-8');
  const words = new Set();

  content.split('\n').forEach(line => {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 1 && parts[0]) {
      // Strip pronunciation variant markers like "word(1)"
      const word = parts[0].split('(')[0].toLowerCase();
      if (word) words.add(word);
    }
  });

  return Array.from(words).sort();
}

// Resolve the final list of words from the CLI options.
function resolveWords(opts) {
  // Explicit list / single word win over the dictionary.
  if (opts.word) return [opts.word.toLowerCase()];
  if (opts.words) {
    return opts.words.split(',').map(w => w.trim().toLowerCase()).filter(Boolean);
  }
  if (opts.test) return [opts.test.toLowerCase()];

  let words = loadWordList(opts.wordsFile);

  // Range (pagination) then limit.
  if (opts.start || opts.count != null) {
    const end = opts.count != null ? opts.start + opts.count : undefined;
    words = words.slice(opts.start, end);
  }
  const limit = opts.testBatch != null ? opts.testBatch : opts.limit;
  if (limit != null) words = words.slice(0, limit);

  return words;
}

// Keep only words present in the live TTS dictionary, to avoid wasted
// synthesis attempts on out-of-vocabulary words.
async function filterAgainstDictionary(words) {
  log('Fetching live dictionary for --filter-dict...');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`${config.serverUrl}/tts/`, { waitUntil: 'networkidle' });
    await page.waitForFunction('window.isTTSReady && window.isTTSReady()', { timeout: 30000 });
    const dict = await page.evaluate(() => window.getWordList());
    const dictSet = new Set(dict.map(w => w.toLowerCase()));
    const filtered = words.filter(w => dictSet.has(w));
    log(`Dictionary has ${dictSet.size} words; ${filtered.length}/${words.length} requested words are valid`);
    return filtered;
  } finally {
    await browser.close();
  }
}

// --- Resume (file-based) ---------------------------------------------------

// A word is "done" for a voice if its WAV already exists and is non-trivial.
function isWordDone(voiceName, word) {
  const wavPath = path.join(__dirname, config.outputDir, voiceName, 'wav', `${sanitizeFilename(word)}.wav`);
  try {
    return fs.statSync(wavPath).size >= config.minWavBytes;
  } catch (e) {
    return false;
  }
}

function splitIntoChunks(array, numChunks) {
  const chunks = Array.from({ length: numChunks }, () => []);
  array.forEach((item, index) => {
    chunks[index % numChunks].push(item);
  });
  return chunks;
}

function loadProgress() {
  const progressPath = path.join(__dirname, config.progressFile);
  try {
    if (fs.existsSync(progressPath)) {
      return JSON.parse(fs.readFileSync(progressPath, 'utf-8'));
    }
  } catch (e) {
    log(`Warning: Could not load progress file: ${e.message}`);
  }
  return {};
}

function saveProgress(progress) {
  const progressPath = path.join(__dirname, config.progressFile);
  fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
}

function printProgress(stats, voiceName) {
  const total = Object.values(stats).reduce((sum, s) => sum + s.total, 0);
  const processed = Object.values(stats).reduce((sum, s) => sum + s.processed, 0);
  const errors = Object.values(stats).reduce((sum, s) => sum + s.errors, 0);
  const percent = total ? ((processed / total) * 100).toFixed(1) : '0.0';
  process.stdout.write(`\r[${voiceName}] Progress: ${processed}/${total} (${percent}%) | Errors: ${errors}    `);
}

// --- Main ------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv);

  log('Pink Trombone Batch Generator (Playwright)');
  log('==========================================');

  // Resolve the word list from CLI options.
  let wordsToProcess = resolveWords(opts);
  log(`Selected ${wordsToProcess.length} words`);

  if (opts.filterDict) {
    wordsToProcess = await filterAgainstDictionary(wordsToProcess);
  }

  if (wordsToProcess.length === 0) {
    log('No words to process.');
    return;
  }

  // Determine which voices to process
  const voices = opts.voice
    ? { [opts.voice]: config.voices[opts.voice] }
    : config.voices;

  if (opts.voice && !config.voices[opts.voice]) {
    log(`Error: Voice "${opts.voice}" not found`);
    process.exit(1);
  }

  const progress = loadProgress();
  const browsers = opts.browsers || config.parallelBrowsers;

  for (const [voiceName, voiceConfig] of Object.entries(voices)) {
    log(`\nProcessing voice: ${voiceName} (F0=${voiceConfig.frequency}Hz, tractLength=${voiceConfig.tractLength})`);

    // Resume = skip words whose WAV is already on disk (source of truth).
    let pendingWords = wordsToProcess;
    if (opts.resume) {
      const before = pendingWords.length;
      pendingWords = pendingWords.filter(w => !isWordDone(voiceName, w));
      log(`Resume: skipping ${before - pendingWords.length} words already generated`);
    }

    if (pendingWords.length === 0) {
      log(`All words already processed for ${voiceName}`);
      continue;
    }

    log(`Processing ${pendingWords.length} words with ${browsers} parallel browsers`);

    const chunks = splitIntoChunks(pendingWords, browsers);

    const outputBase = path.join(__dirname, config.outputDir, voiceName);
    fs.mkdirSync(path.join(outputBase, 'wav'), { recursive: true });
    fs.mkdirSync(path.join(outputBase, 'landmarks'), { recursive: true });

    const workers = [];
    const workerStats = {};
    const completedWords = []; // only words the workers actually wrote

    for (let i = 0; i < chunks.length; i++) {
      if (chunks[i].length === 0) continue;

      const worker = new Worker(workerFile, {
        workerData: {
          workerId: i,
          words: chunks[i],
          voiceConfig: { ...voiceConfig, label: voiceName }
        }
      });

      workerStats[i] = { processed: 0, errors: 0, total: chunks[i].length };

      worker.on('message', (msg) => {
        if (msg.type === 'progress') {
          workerStats[msg.workerId] = {
            processed: msg.processed,
            errors: msg.errors,
            total: msg.total
          };
          printProgress(workerStats, voiceName);
        } else if (msg.type === 'word-done') {
          completedWords.push(msg.word);
        } else if (msg.type === 'complete') {
          log(`\nWorker ${msg.workerId} complete: ${msg.processed} processed, ${msg.errors} errors`);
        } else if (msg.type === 'error') {
          log(`\nWorker ${msg.workerId} error: ${msg.error}`);
        }
      });

      worker.on('error', (err) => {
        log(`\nWorker ${i} crashed: ${err.message}`);
      });

      workers.push(worker);
    }

    // Wait for all workers to complete
    await Promise.all(workers.map(w => new Promise((resolve) => {
      w.on('exit', resolve);
    })));

    // Persist only the words that genuinely produced output.
    if (!progress[voiceName]) progress[voiceName] = { completed: [] };
    progress[voiceName].completed = [
      ...new Set([...progress[voiceName].completed, ...completedWords])
    ];
    saveProgress(progress);

    const totalProcessed = Object.values(workerStats).reduce((sum, s) => sum + s.processed, 0);
    const totalErrors = Object.values(workerStats).reduce((sum, s) => sum + s.errors, 0);
    log(`Voice "${voiceName}" complete: ${totalProcessed} processed, ${totalErrors} errors`);
  }

  log('\nBatch generation complete!');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

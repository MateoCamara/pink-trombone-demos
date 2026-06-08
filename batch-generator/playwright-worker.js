const { parentPort, workerData } = require('worker_threads');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { sanitizeFilename, delay, log } = require('./util');

const { workerId, words, voiceConfig } = workerData;

const FATAL_PATTERNS = [
  'Target closed', 'Target page, context or browser has been closed',
  'browser has been closed', 'context was destroyed', 'Connection closed',
  'crashed', 'Browser closed', 'has been closed'
];
const isFatal = (msg) => FATAL_PATTERNS.some(p => msg.includes(p));

// Launch a browser with the three coordinated pages (TTS -> pink-trombone
// records -> lexi extracts) and wait until all are ready to synthesize.
async function launchAndReady() {
  const browser = await chromium.launch({
    headless: config.headless,
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--disable-features=AudioServiceOutOfProcess',
      '--use-fake-ui-for-media-stream'
    ]
  });
  const context = await browser.newContext({
    permissions: ['microphone'],
    bypassCSP: true
  });

  const ttsPage = await context.newPage();
  const pinkTrombonePage = await context.newPage();
  const lexiPage = await context.newPage();

  await Promise.all([
    ttsPage.goto(`${config.serverUrl}/tts/`, { waitUntil: 'networkidle' }),
    pinkTrombonePage.goto(`${config.serverUrl}/pink-trombone/`, { waitUntil: 'networkidle' }),
    lexiPage.goto(`${config.serverUrl}/lexi/`, { waitUntil: 'networkidle' })
  ]);

  await ttsPage.waitForFunction('window.isTTSReady && window.isTTSReady()', { timeout: 30000 });

  await pinkTrombonePage.waitForSelector('pink-trombone', { timeout: 30000 });
  await pinkTrombonePage.click('pink-trombone');
  await delay(500);
  // `frontConstriction` is set at the end of the page's setup, right after the
  // MediaRecorder is wired up. (The old `recordingOutput` check was stale and
  // never satisfied, so the worker hung.)
  await pinkTrombonePage.waitForFunction(() => {
    const pt = document.querySelector('pink-trombone');
    return pt && pt.pinkTrombone && pt.frontConstriction;
  }, { timeout: 30000 });

  await delay(config.warmupDelay);
  return { browser, ttsPage, lexiPage };
}

async function processWords() {
  const wavDir = path.join(__dirname, config.outputDir, voiceConfig.label, 'wav');
  const landmarksDir = path.join(__dirname, config.outputDir, voiceConfig.label, 'landmarks');
  const utteranceDir = path.join(__dirname, config.outputDir, voiceConfig.label, 'utterance');
  fs.mkdirSync(wavDir, { recursive: true });
  fs.mkdirSync(landmarksDir, { recursive: true });
  fs.mkdirSync(utteranceDir, { recursive: true });

  let i = 0;            // index of the next word to process
  let processed = 0;
  let errors = 0;
  let relaunches = 0;

  while (i < words.length) {
    let browser;
    try {
      const ready = await launchAndReady();
      browser = ready.browser;
      const { ttsPage, lexiPage } = ready;
      log(`Worker ${workerId}: browser ready, processing from word ${i + 1}/${words.length}`);

      // Inner loop: process words until the chunk is done or the browser dies.
      for (; i < words.length; i++) {
        const word = words[i];
        try {
          const result = await processWord(ttsPage, lexiPage, word, voiceConfig);
          if (result) {
            const safe = sanitizeFilename(word);
            fs.writeFileSync(path.join(wavDir, `${safe}.wav`), result.audio);
            fs.writeFileSync(path.join(landmarksDir, `${safe}.json`),
              JSON.stringify(result.landmarks, null, 2));
            if (result.utterance) {
              fs.writeFileSync(path.join(utteranceDir, `${safe}.json`),
                JSON.stringify(result.utterance));
            }
            processed++;
            parentPort.postMessage({ type: 'word-done', workerId, word });
          } else {
            errors++;
          }
        } catch (err) {
          if (isFatal(err.message)) throw err; // bubble up to relaunch the browser
          log(`Worker ${workerId}: error on "${word}": ${err.message}`);
          errors++;
        }

        parentPort.postMessage({ type: 'progress', workerId, processed, errors, total: words.length });
        await delay(config.delayBetweenWords);
      }
    } catch (fatal) {
      relaunches++;
      log(`Worker ${workerId}: browser died (${fatal.message.split('\n')[0]}); relaunch ${relaunches}/${config.maxBrowserRelaunches}`);
      if (relaunches > config.maxBrowserRelaunches) {
        parentPort.postMessage({ type: 'error', workerId, error: `gave up after ${relaunches} relaunches: ${fatal.message}` });
        break;
      }
      // Skip the word that triggered the crash so a poison word can't loop forever.
      i++;
      await delay(1000);
    } finally {
      if (browser) { try { await browser.close(); } catch (e) { /* ignore */ } }
    }
  }

  parentPort.postMessage({ type: 'complete', workerId, processed, errors, total: words.length });
}

async function processWord(ttsPage, lexiPage, word, voiceConfig) {
  for (let attempt = 1; attempt <= config.wordRetries; attempt++) {
    try {
      return await processWordAttempt(ttsPage, lexiPage, word, voiceConfig);
    } catch (e) {
      const transient = e.message.includes('context was destroyed') || e.message.includes('closed');
      if (attempt < config.wordRetries && transient) {
        await delay(1000);
        continue;
      }
      throw e;
    }
  }
}

async function processWordAttempt(ttsPage, lexiPage, word, voiceConfig) {
  // Reset LEXI state so isLexiReady() reflects only this word
  await lexiPage.evaluate(() => {
    if (window.resetLexi) window.resetLexi();
  });
  await delay(config.resetDelay);

  // Synthesize the word via TTS
  const voiceParams = { frequency: voiceConfig.frequency, tractLength: voiceConfig.tractLength };
  const synthResult = await ttsPage.evaluate(async ({ word, config }) => {
    try {
      const r = await window.synthesizeWord(word, config);
      // Capture the articulatory keyframes (the dataset's `utterance` field).
      // getUtterance is a global function on the TTS page, not on `window`.
      const utterance = (typeof getUtterance !== 'undefined') ? getUtterance() : null;
      return { ...r, utterance };
    } catch (e) {
      return { error: e.message };
    }
  }, { word, config: voiceParams });

  if (synthResult && synthResult.error) {
    return null; // word not in dictionary etc. — not retryable, no output
  }
  const utterance = synthResult ? synthResult.utterance : null;

  // Wait for LEXI to receive the recorded audio
  try {
    await lexiPage.waitForFunction('window.isLexiReady && window.isLexiReady()', {
      timeout: config.synthesisTimeout
    });
  } catch (e) {
    return null;
  }

  // Extract audio + landmarks. getCurrentAudio() is ASYNC and MUST be awaited;
  // the WAV can also lag the isLexiReady() signal slightly, so poll briefly.
  let audio = null;
  let landmarks = null;
  for (let i = 0; i < config.audioExtractAttempts; i++) {
    if (i > 0) await delay(config.audioExtractDelay);
    const data = await lexiPage.evaluate(async () => {
      const audioBuffer = await window.getCurrentAudio();
      const lm = window.getCurrentLandmarks();
      const audioArray = audioBuffer ? Array.from(new Uint8Array(audioBuffer)) : null;
      return { audio: audioArray, len: audioArray ? audioArray.length : 0, landmarks: lm };
    });
    if (data.audio && data.len >= config.minWavBytes) {
      audio = Buffer.from(data.audio);
      landmarks = data.landmarks;
      break;
    }
  }

  if (!audio) return null;
  return { audio, landmarks, utterance };
}

processWords().catch(error => {
  parentPort.postMessage({ type: 'error', workerId, error: error.message });
  process.exit(1);
});

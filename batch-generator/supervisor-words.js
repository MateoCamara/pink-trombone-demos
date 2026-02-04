/**
 * Supervisor Words Generator
 * Generates WAV + Spectrogram PNG + Waveform PNG for specific words
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const config = {
  serverUrl: 'http://localhost:8081',
  voice: { frequency: 140, tractLength: 44 },
  outputDir: './output/supervisor',
  synthesisTimeout: 15000,
  overwrite: false  // Only generate missing files
};

// Word list organized by category (from supervisor's email)
const wordCategories = [
  {
    name: '1_stop_consonants',
    description: 'Closure and release landmarks',
    words: ['cat', 'tub', 'pat', 'tap', 'bat', 'dip', 'gap']
  },
  {
    name: '2_fricatives',
    description: 'Onset and offset of frication',
    words: ['sip', 'zip', 'fan', 'van', 'see', 'zoo']
  },
  {
    name: '3_nasals',
    description: 'Nasal coupling landmarks',
    words: ['mat', 'man', 'net', 'sing']
  },
  {
    name: '4_affricates',
    description: 'Compound landmarks',
    words: ['chip', 'jam', 'truth']
  },
  {
    name: '5_vowels',
    description: 'Vowel extrema landmarks',
    words: ['butter', 'see', 'say', 'sat', 'spa', 'law', 'too']
  },
  {
    name: '6_syllabic_structure',
    description: 'Stress and prosodic organization',
    words: ['attack', 'about', 'permit']
  },
  {
    name: '7_duration_pairs',
    description: 'Vowel length contrasts',
    words: ['beat', 'bit', 'seat', 'sit', 'leak', 'lick', 'peel', 'pill', 'sheep', 'ship']
  }
];

async function main() {
  console.log('Supervisor Words Generator');
  console.log('==========================\n');

  // Count total words
  const totalWords = wordCategories.reduce((sum, cat) => sum + cat.words.length, 0);
  console.log(`Processing ${totalWords} words across ${wordCategories.length} categories\n`);

  const browser = await chromium.launch({
    headless: false,
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--disable-features=AudioServiceOutOfProcess'
    ]
  });

  const context = await browser.newContext({
    permissions: ['microphone'],
    bypassCSP: true
  });

  const ttsPage = await context.newPage();
  const pinkTrombonePage = await context.newPage();
  const lexiPage = await context.newPage();

  try {
    // Navigate all pages
    console.log('Opening modules...');
    await Promise.all([
      ttsPage.goto(`${config.serverUrl}/tts/`, { waitUntil: 'networkidle' }),
      pinkTrombonePage.goto(`${config.serverUrl}/pink-trombone/`, { waitUntil: 'networkidle' }),
      lexiPage.goto(`${config.serverUrl}/lexi/`, { waitUntil: 'networkidle' })
    ]);

    // Wait for TTS
    await ttsPage.waitForFunction('window.isTTSReady && window.isTTSReady()', { timeout: 30000 });
    console.log('TTS ready');

    // Initialize Pink Trombone
    await pinkTrombonePage.waitForSelector('pink-trombone', { timeout: 30000 });
    await pinkTrombonePage.click('pink-trombone');
    await delay(500);
    await pinkTrombonePage.waitForFunction(() => {
      const pt = document.querySelector('pink-trombone');
      return pt && pt.pinkTrombone && pt.recordingOutput;
    }, { timeout: 30000 });

    // Enable voice (it starts disabled now)
    await pinkTrombonePage.evaluate(() => {
      const pt = document.querySelector('pink-trombone');
      if (pt && pt.intensity) {
        pt.intensity.value = 1;
      }
    });
    console.log('Pink Trombone ready (voice enabled)');

    await delay(1000);
    console.log('All modules ready!\n');

    let processed = 0;
    let errors = 0;

    // Process each category
    for (const category of wordCategories) {
      console.log(`\n[${category.name}] ${category.description}`);
      console.log('-'.repeat(50));

      // Create category directory
      const categoryDir = path.join(__dirname, config.outputDir, category.name);
      fs.mkdirSync(categoryDir, { recursive: true });

      for (const word of category.words) {
        // Check if both WAV and landmarks exist (skip if complete, unless overwrite is true)
        const wavPath = path.join(categoryDir, `${word}.wav`);
        const landmarksPath = path.join(categoryDir, `${word}_landmarks.json`);
        if (!config.overwrite && fs.existsSync(wavPath) && fs.existsSync(landmarksPath)) {
          console.log(`  - ${word} (already complete, skipping)`);
          processed++;
          continue;
        }

        try {
          await processWord(ttsPage, lexiPage, word, categoryDir);
          processed++;
          console.log(`  ✓ ${word}`);
        } catch (e) {
          errors++;
          console.log(`  ✗ ${word}: ${e.message}`);
        }
        // Delay between words to let pages stabilize
        await delay(1000);
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log(`Complete! Processed: ${processed}, Errors: ${errors}`);
    console.log(`Output: ${path.join(__dirname, config.outputDir)}`);

  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    await browser.close();
  }
}

async function processWord(ttsPage, lexiPage, word, outputDir, retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await processWordAttempt(ttsPage, lexiPage, word, outputDir);
    } catch (e) {
      if (attempt < retries && e.message.includes('context was destroyed')) {
        await delay(1000); // Wait longer before retry
        continue;
      }
      throw e;
    }
  }
}

async function processWordAttempt(ttsPage, lexiPage, word, outputDir) {
  // Reload LEXI to ensure clean state, then wait for BroadcastChannel to be ready
  await lexiPage.reload({ waitUntil: 'networkidle' });
  await delay(1000); // Wait for scripts to initialize and BroadcastChannel to connect

  // Synthesize via TTS - this sends the utterance to Pink Trombone
  const voiceParams = { frequency: config.voice.frequency, tractLength: config.voice.tractLength };
  const result = await ttsPage.evaluate(async ({ word, config }) => {
    try {
      const r = await window.synthesizeWord(word, config);
      // Also return the utterance duration if available
      const utterance = window.getUtterance && window.getUtterance();
      const keyframes = utterance?.keyframes;
      const duration = keyframes?.length > 0 ? keyframes[keyframes.length - 1].time : 1;
      return { ...r, duration };
    } catch (e) {
      return { error: e.message };
    }
  }, { word, config: voiceParams });

  if (result && result.error) {
    throw new Error(result.error);
  }

  // Wait for audio playback + recording + BroadcastChannel transmission
  const audioDuration = (result?.duration || 1) * 1000;
  await delay(audioDuration + 2500);

  // Poll for LEXI to be ready (audio received and landmarks calculated)
  let lexiReady = false;
  for (let i = 0; i < 30 && !lexiReady; i++) {
    lexiReady = await lexiPage.evaluate(() => {
      return window.isLexiReady && window.isLexiReady();
    });
    if (!lexiReady) {
      await delay(200);
    }
  }

  if (!lexiReady) {
    console.log(`    (LEXI not ready for ${word})`);
  }

  // Screenshot waveform canvas
  try {
    const waveformCanvas = await lexiPage.$('#waveform');
    if (waveformCanvas) {
      await waveformCanvas.screenshot({
        path: path.join(outputDir, `${word}_waveform.png`)
      });
    }
  } catch (e) {
    // Ignore screenshot errors
  }

  // Screenshot spectrogram canvas
  try {
    const spectrogramCanvas = await lexiPage.$('#spectrogram');
    if (spectrogramCanvas) {
      await spectrogramCanvas.screenshot({
        path: path.join(outputDir, `${word}_spectrogram.png`)
      });
    }
  } catch (e) {
    // Ignore screenshot errors
  }

  // Extract and save audio with retries
  const wavPath = path.join(outputDir, `${word}.wav`);
  let audioSaved = false;

  for (let audioAttempt = 0; audioAttempt < 8 && !audioSaved; audioAttempt++) {
    try {
      if (audioAttempt > 0) {
        await delay(300); // Wait between retries
      }

      const audioData = await lexiPage.evaluate(() => {
        const blob = window.getCurrentAudio();
        if (!blob) return { data: null, len: 0 };
        const arr = new Uint8Array(blob);
        return { data: Array.from(arr), len: arr.length };
      });

      if (audioData.data && audioData.len > 1000) { // Ensure we have real audio data (at least 1KB)
        fs.writeFileSync(wavPath, Buffer.from(audioData.data));
        audioSaved = true;
      }
    } catch (e) {
      // Continue to next retry
    }
  }

  if (!audioSaved) {
    console.log(`    (audio extraction failed for ${word})`);
  }

  // Save landmarks with retries
  let landmarksSaved = false;
  for (let lmAttempt = 0; lmAttempt < 5 && !landmarksSaved; lmAttempt++) {
    try {
      if (lmAttempt > 0) {
        await delay(300);
      }

      const landmarks = await lexiPage.evaluate(() => {
        return window.getCalculatedLandmarks ? window.getCalculatedLandmarks() : null;
      });
      if (landmarks && landmarks.length > 0) {
        const landmarksPath = path.join(outputDir, `${word}_landmarks.json`);
        fs.writeFileSync(landmarksPath, JSON.stringify(landmarks, null, 2));
        landmarksSaved = true;
      }
    } catch (e) {
      // Continue to next retry
    }
  }

  if (!landmarksSaved) {
    console.log(`    (no landmarks for ${word})`);
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);

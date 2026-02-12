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
  outputDir: './website',
  synthesisTimeout: 15000,
  overwrite: true  // Regenerate all files with landmarks on images
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
  },
  {
    name: '8_diphthongs_ai',
    description: 'Diphthong /aɪ/',
    words: ['time', 'buy', 'ride']
  },
  {
    name: '9_diphthongs_au',
    description: 'Diphthong /aʊ/',
    words: ['now', 'house', 'loud']
  },
  {
    name: '10_diphthongs_oi',
    description: 'Diphthong /ɔɪ/',
    words: ['boy', 'choice', 'toy']
  }
];

/**
 * Launch a fresh browser session with TTS, Pink Trombone, and LEXI pages
 */
async function launchSession() {
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--disable-features=AudioServiceOutOfProcess',
      '--no-sandbox'
    ]
  });

  const context = await browser.newContext({
    permissions: ['microphone'],
    bypassCSP: true
  });

  const ttsPage = await context.newPage();
  const pinkTrombonePage = await context.newPage();
  const lexiPage = await context.newPage();

  // Navigate all pages
  await Promise.all([
    ttsPage.goto(`${config.serverUrl}/tts/`, { waitUntil: 'load', timeout: 60000 }),
    pinkTrombonePage.goto(`${config.serverUrl}/pink-trombone/`, { waitUntil: 'load', timeout: 60000 }),
    lexiPage.goto(`${config.serverUrl}/lexi/`, { waitUntil: 'load', timeout: 60000 })
  ]);
  await delay(5000);

  // Wait for TTS dictionary
  await ttsPage.waitForFunction('window.isTTSReady && window.isTTSReady()', { timeout: 60000 });

  // Initialize Pink Trombone
  await pinkTrombonePage.waitForSelector('pink-trombone', { timeout: 60000 });
  await pinkTrombonePage.click('pink-trombone');
  await delay(500);
  await pinkTrombonePage.waitForFunction(() => {
    const pt = document.querySelector('pink-trombone');
    return pt && pt.pinkTrombone && pt.recordingOutput;
  }, { timeout: 60000 });

  // Enable voice
  await pinkTrombonePage.evaluate(() => {
    const pt = document.querySelector('pink-trombone');
    if (pt && pt.intensity) pt.intensity.value = 1;
  });

  await delay(1000);
  return { browser, ttsPage, lexiPage };
}

async function main() {
  console.log('Supervisor Words Generator');
  console.log('==========================\n');

  const totalWords = wordCategories.reduce((sum, cat) => sum + cat.words.length, 0);
  console.log(`Processing ${totalWords} words across ${wordCategories.length} categories\n`);

  let processed = 0;
  let errors = 0;

  // Process each category with a fresh browser session
  for (const category of wordCategories) {
    console.log(`\n[${category.name}] ${category.description}`);
    console.log('-'.repeat(50));

    const categoryDir = path.join(__dirname, config.outputDir, category.name);
    fs.mkdirSync(categoryDir, { recursive: true });

    let session = null;
    try {
      console.log('  Starting browser session...');
      session = await launchSession();
      console.log('  Session ready');

      for (const word of category.words) {
        const wavPath = path.join(categoryDir, `${word}.wav`);
        const landmarksPath = path.join(categoryDir, `${word}_landmarks.json`);
        if (!config.overwrite && fs.existsSync(wavPath) && fs.existsSync(landmarksPath)) {
          console.log(`  - ${word} (already complete, skipping)`);
          processed++;
          continue;
        }

        try {
          await processWord(session.ttsPage, session.lexiPage, word, categoryDir);
          processed++;
          console.log(`  + ${word}`);
        } catch (e) {
          errors++;
          console.log(`  x ${word}: ${e.message}`);
        }
        await delay(500);
      }
    } catch (e) {
      console.log(`  Session error: ${e.message}`);
      // Mark all remaining words in this category as errors
      errors += category.words.length;
    } finally {
      if (session) {
        try { await session.browser.close(); } catch (e) { /* ignore */ }
      }
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`Complete! Processed: ${processed}, Errors: ${errors}`);

  // Build website metadata
  buildWebsiteMetadata();
}

async function processWord(ttsPage, lexiPage, word, outputDir, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await processWordAttempt(ttsPage, lexiPage, word, outputDir);
    } catch (e) {
      if (attempt < retries && (e.message.includes('context was destroyed') || e.message.includes('closed'))) {
        await delay(1000);
        continue;
      }
      throw e;
    }
  }
}

async function processWordAttempt(ttsPage, lexiPage, word, outputDir) {
  // Reload LEXI to ensure clean state
  await lexiPage.reload({ waitUntil: 'load', timeout: 30000 });
  await delay(1500);

  // Synthesize via TTS
  const voiceParams = { frequency: config.voice.frequency, tractLength: config.voice.tractLength };
  const result = await ttsPage.evaluate(async ({ word, config }) => {
    try {
      const r = await window.synthesizeWord(word, config);
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

  // Wait for audio playback + recording + BroadcastChannel
  const audioDuration = (result?.duration || 1) * 1000;
  await delay(audioDuration + 2500);

  // Poll for LEXI ready
  let lexiReady = false;
  for (let i = 0; i < 30 && !lexiReady; i++) {
    lexiReady = await lexiPage.evaluate(() => {
      return window.isLexiReady && window.isLexiReady();
    });
    if (!lexiReady) await delay(200);
  }

  if (!lexiReady) {
    console.log(`    (LEXI not ready for ${word})`);
  }

  // Draw landmarks on canvases before taking screenshots
  await lexiPage.evaluate(() => {
    const landmarks = window.getCalculatedLandmarks ? window.getCalculatedLandmarks() : [];
    if (!landmarks || landmarks.length === 0) return;

    const colors = {
      'V': '#FF6B6B', 'G': '#4ECDC4',
      'Nc': '#1c50d3', 'Nr': '#80a0ff',
      'Sc': '#ec00ff', 'Sr': '#f9afff',
      'Fc': '#ffd900', 'Fr': '#fff4c3'
    };

    function drawLandmarksOnCanvas(canvasId) {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;

      // Get audio duration from the trimmed buffer
      const duration = window.__lexiAudioDuration || 1;

      landmarks.forEach(lm => {
        const x = (lm.time / duration) * w;
        const color = colors[lm.type] || '#ffffff';

        // Vertical line
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label background + text at top
        const label = lm.type;
        ctx.font = 'bold 11px sans-serif';
        const textWidth = ctx.measureText(label).width;
        const padding = 3;
        const labelX = x - textWidth / 2 - padding;
        const labelY = 2;
        const labelH = 14;

        ctx.fillStyle = color;
        ctx.fillRect(labelX, labelY, textWidth + padding * 2, labelH);

        // Text color: dark for light backgrounds, white for dark
        const lightBg = ['#f9afff', '#ffd900', '#fff4c3', '#80a0ff'].includes(color);
        ctx.fillStyle = lightBg ? '#333' : '#fff';
        ctx.fillText(label, x - textWidth / 2, labelY + 11);
      });
    }

    drawLandmarksOnCanvas('waveform');
    drawLandmarksOnCanvas('spectrogram');
  });

  // Screenshot waveform
  try {
    const waveformCanvas = await lexiPage.$('#waveform');
    if (waveformCanvas) {
      await waveformCanvas.screenshot({ path: path.join(outputDir, `${word}_waveform.png`) });
    }
  } catch (e) { /* ignore */ }

  // Screenshot spectrogram
  try {
    const spectrogramCanvas = await lexiPage.$('#spectrogram');
    if (spectrogramCanvas) {
      await spectrogramCanvas.screenshot({ path: path.join(outputDir, `${word}_spectrogram.png`) });
    }
  } catch (e) { /* ignore */ }

  // Extract audio
  const wavPath = path.join(outputDir, `${word}.wav`);
  let audioSaved = false;
  for (let i = 0; i < 8 && !audioSaved; i++) {
    try {
      if (i > 0) await delay(300);
      const audioData = await lexiPage.evaluate(async () => {
        const buf = await window.getCurrentAudio();
        if (!buf) return { data: null, len: 0 };
        const arr = new Uint8Array(buf);
        return { data: Array.from(arr), len: arr.length };
      });
      if (audioData.data && audioData.len > 1000) {
        fs.writeFileSync(wavPath, Buffer.from(audioData.data));
        audioSaved = true;
      }
    } catch (e) { /* retry */ }
  }
  if (!audioSaved) {
    console.log(`    (audio extraction failed for ${word})`);
  }

  // Save landmarks
  let landmarksSaved = false;
  for (let i = 0; i < 5 && !landmarksSaved; i++) {
    try {
      if (i > 0) await delay(300);
      const landmarks = await lexiPage.evaluate(() => {
        return window.getCalculatedLandmarks ? window.getCalculatedLandmarks() : null;
      });
      if (landmarks && landmarks.length > 0) {
        fs.writeFileSync(path.join(outputDir, `${word}_landmarks.json`), JSON.stringify(landmarks, null, 2));
        landmarksSaved = true;
      }
    } catch (e) { /* retry */ }
  }
  if (!landmarksSaved) {
    console.log(`    (no landmarks for ${word})`);
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Build website metadata from generated landmarks JSON files
 */
function buildWebsiteMetadata() {
  console.log('\nBuilding website metadata...');
  const websiteDir = path.join(__dirname, 'website');
  const metadata = {};
  const longVowelWords = new Set(['beat', 'seat', 'leak', 'peel', 'sheep']);

  for (const category of wordCategories) {
    const categoryDir = path.join(websiteDir, category.name);
    const catData = { name: category.name, words: [] };

    for (const word of category.words) {
      const wavPath = path.join(categoryDir, `${word}.wav`);
      const landmarksPath = path.join(categoryDir, `${word}_landmarks.json`);

      let landmarks = [];
      if (fs.existsSync(landmarksPath)) {
        try {
          landmarks = JSON.parse(fs.readFileSync(landmarksPath, 'utf-8'));
        } catch (e) {
          console.log(`  Warning: could not parse landmarks for ${word}`);
        }
      }

      let duration = 0;
      if (fs.existsSync(wavPath)) {
        try {
          const wavBuf = fs.readFileSync(wavPath);
          if (wavBuf.length > 44) {
            const sampleRate = wavBuf.readUInt32LE(24);
            const bitsPerSample = wavBuf.readUInt16LE(34);
            const numChannels = wavBuf.readUInt16LE(22);
            const dataSize = wavBuf.readUInt32LE(40);
            duration = parseFloat((dataSize / (sampleRate * numChannels * (bitsPerSample / 8))).toFixed(2));
          }
        } catch (e) { /* fallback */ }
      }

      catData.words.push({
        word,
        duration,
        landmarks: landmarks.map(lm => ({
          type: lm.type,
          time: parseFloat(lm.time.toFixed(3)),
          name: lm.name
        })),
        is_long_vowel: longVowelWords.has(word)
      });
    }

    metadata[category.name] = catData;
  }

  // Save metadata.json
  fs.writeFileSync(path.join(websiteDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
  console.log('  Saved metadata.json');

  // Embed metadata into index.html
  const indexPath = path.join(websiteDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    let html = fs.readFileSync(indexPath, 'utf-8');
    const metadataStr = JSON.stringify(metadata);
    html = html.replace(
      /const METADATA = .+?;/s,
      `const METADATA = ${metadataStr};`
    );
    fs.writeFileSync(indexPath, html);
    console.log('  Embedded metadata into index.html');
  }

  console.log('Website metadata build complete!');
}

main().catch(console.error);

/**
 * Duration Pairs - Long Vowels Generator
 * Regenerates duration pairs with long vowels having 2x duration
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const config = {
  serverUrl: 'http://localhost:8081',
  voice: { frequency: 140, tractLength: 44 },
  outputDir: './output/supervisor/7_duration_pairs',
};

// Long vowel words get 2x duration (speed 0.5), short vowels normal (speed 1)
const words = [
  { word: 'beat', speed: 0.5 },  // long
  { word: 'bit', speed: 1 },     // short
  { word: 'seat', speed: 0.5 },  // long
  { word: 'sit', speed: 1 },     // short
  { word: 'leak', speed: 0.5 },  // long
  { word: 'lick', speed: 1 },    // short
  { word: 'peel', speed: 0.5 },  // long
  { word: 'pill', speed: 1 },    // short
  { word: 'sheep', speed: 0.5 }, // long
  { word: 'ship', speed: 1 },    // short
];

async function main() {
  console.log('Duration Pairs - Long Vowels Generator');
  console.log('======================================\n');
  console.log('Long vowels (beat, seat, leak, peel, sheep) will have 2x duration\n');

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
    console.log('Opening modules...');
    await Promise.all([
      ttsPage.goto(`${config.serverUrl}/tts/`, { waitUntil: 'networkidle' }),
      pinkTrombonePage.goto(`${config.serverUrl}/pink-trombone/`, { waitUntil: 'networkidle' }),
      lexiPage.goto(`${config.serverUrl}/lexi/`, { waitUntil: 'networkidle' })
    ]);

    await ttsPage.waitForFunction('window.isTTSReady && window.isTTSReady()', { timeout: 30000 });
    console.log('TTS ready');

    await pinkTrombonePage.waitForSelector('pink-trombone', { timeout: 30000 });
    await pinkTrombonePage.click('pink-trombone');
    await delay(500);
    await pinkTrombonePage.waitForFunction(() => {
      const pt = document.querySelector('pink-trombone');
      return pt && pt.pinkTrombone && pt.recordingOutput;
    }, { timeout: 30000 });

    await pinkTrombonePage.evaluate(() => {
      const pt = document.querySelector('pink-trombone');
      if (pt && pt.intensity) {
        pt.intensity.value = 1;
      }
    });
    console.log('Pink Trombone ready');

    await delay(1000);
    console.log('All modules ready!\n');

    // Create output directory
    const outputDir = path.join(__dirname, config.outputDir);
    fs.mkdirSync(outputDir, { recursive: true });

    for (const { word, speed } of words) {
      console.log(`Processing: ${word} (speed: ${speed}, ${speed === 0.5 ? 'LONG' : 'short'})`);

      try {
        await processWord(ttsPage, lexiPage, word, speed, outputDir);
        console.log(`  ✓ ${word}`);
      } catch (e) {
        console.log(`  ✗ ${word}: ${e.message}`);
      }

      await delay(1000);
    }

    console.log('\nComplete!');
    console.log(`Output: ${outputDir}`);

  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    await browser.close();
  }
}

async function processWord(ttsPage, lexiPage, word, speed, outputDir) {
  // Reload LEXI for clean state
  await lexiPage.reload({ waitUntil: 'networkidle' });
  await delay(1000);

  // Set speed and synthesize
  const result = await ttsPage.evaluate(async ({ word, speed, voiceConfig }) => {
    try {
      // Set the speed slider
      const speedInput = document.getElementById('speed');
      if (speedInput) {
        speedInput.value = speed;
        speedInput.dispatchEvent(new Event('input'));
      }

      // Set voice parameters
      const freqInput = document.getElementById('initialFrequency');
      const tractInput = document.getElementById('initialTractLength');
      if (freqInput) freqInput.value = voiceConfig.frequency;
      if (tractInput) tractInput.value = voiceConfig.tractLength;

      // Input the word and synthesize
      const textInput = document.getElementById('text');
      textInput.value = word;
      textInput.dispatchEvent(new Event('input'));

      await new Promise(r => setTimeout(r, 100));

      const playButton = document.getElementById('play');
      if (playButton && !playButton.disabled) {
        playButton.click();

        // Get utterance duration
        const utterance = window.getUtterance && window.getUtterance();
        const keyframes = utterance?.keyframes;
        const duration = keyframes?.length > 0 ? keyframes[keyframes.length - 1].time : 1;
        return { success: true, duration };
      }
      return { error: 'Play button disabled' };
    } catch (e) {
      return { error: e.message };
    }
  }, { word, speed, voiceConfig: config.voice });

  if (result.error) {
    throw new Error(result.error);
  }

  // Wait for audio playback
  const audioDuration = (result.duration || 1) * 1000 + 2500;
  await delay(audioDuration);

  // Wait for LEXI
  let lexiReady = false;
  for (let i = 0; i < 30 && !lexiReady; i++) {
    lexiReady = await lexiPage.evaluate(() => {
      return window.isLexiReady && window.isLexiReady();
    });
    if (!lexiReady) await delay(200);
  }

  await delay(500);

  // Save waveform
  const waveformCanvas = await lexiPage.$('#waveform');
  if (waveformCanvas) {
    await waveformCanvas.screenshot({
      path: path.join(outputDir, `${word}_waveform.png`)
    });
  }

  // Save spectrogram
  const spectrogramCanvas = await lexiPage.$('#spectrogram');
  if (spectrogramCanvas) {
    await spectrogramCanvas.screenshot({
      path: path.join(outputDir, `${word}_spectrogram.png`)
    });
  }

  // Save WAV
  const audioData = await lexiPage.evaluate(() => {
    const blob = window.getCurrentAudio();
    if (!blob) return null;
    return Array.from(new Uint8Array(blob));
  });

  if (audioData && audioData.length > 1000) {
    fs.writeFileSync(path.join(outputDir, `${word}.wav`), Buffer.from(audioData));
  } else {
    console.log(`    (audio extraction failed)`);
  }

  // Save landmarks
  const landmarks = await lexiPage.evaluate(() => {
    return window.getCalculatedLandmarks ? window.getCalculatedLandmarks() : null;
  });

  if (landmarks && landmarks.length > 0) {
    fs.writeFileSync(
      path.join(outputDir, `${word}_landmarks.json`),
      JSON.stringify(landmarks, null, 2)
    );
  } else {
    console.log(`    (no landmarks)`);
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);

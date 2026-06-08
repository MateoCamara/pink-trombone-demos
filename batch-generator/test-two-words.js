/**
 * Quick test: regenerate only "gap" and "see" to verify phoneme changes
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const config = {
  serverUrl: 'http://localhost:8081',
  voice: { frequency: 140, tractLength: 44 },
};

const testWords = [
  { word: 'gap', outputDir: path.join(__dirname, 'website', '1_stop_consonants') },
  { word: 'see', outputDir: path.join(__dirname, 'website', '2_fricatives') },
];

async function launchSession() {
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--disable-features=AudioServiceOutOfProcess',
      '--no-sandbox'
    ]
  });
  const context = await browser.newContext({ permissions: ['microphone'], bypassCSP: true });
  const ttsPage = await context.newPage();
  const pinkTrombonePage = await context.newPage();
  const lexiPage = await context.newPage();

  await Promise.all([
    ttsPage.goto(`${config.serverUrl}/tts/`, { waitUntil: 'load', timeout: 60000 }),
    pinkTrombonePage.goto(`${config.serverUrl}/pink-trombone/`, { waitUntil: 'load', timeout: 60000 }),
    lexiPage.goto(`${config.serverUrl}/lexi/`, { waitUntil: 'load', timeout: 60000 })
  ]);
  await delay(5000);
  await ttsPage.waitForFunction('window.isTTSReady && window.isTTSReady()', { timeout: 60000 });
  await pinkTrombonePage.waitForSelector('pink-trombone', { timeout: 60000 });
  await pinkTrombonePage.click('pink-trombone');
  await delay(500);
  await pinkTrombonePage.waitForFunction(() => {
    const pt = document.querySelector('pink-trombone');
    return pt && pt.pinkTrombone && pt.recordingOutput;
  }, { timeout: 60000 });
  await pinkTrombonePage.evaluate(() => {
    const pt = document.querySelector('pink-trombone');
    if (pt && pt.intensity) pt.intensity.value = 1;
  });
  await delay(1000);
  return { browser, ttsPage, lexiPage };
}

async function processWord(ttsPage, lexiPage, word, outputDir) {
  await lexiPage.reload({ waitUntil: 'load', timeout: 30000 });
  await delay(1500);

  const voiceParams = { frequency: config.voice.frequency, tractLength: config.voice.tractLength };
  const result = await ttsPage.evaluate(async ({ word, config }) => {
    try {
      const r = await window.synthesizeWord(word, config);
      const utterance = window.getUtterance && window.getUtterance();
      const keyframes = utterance?.keyframes;
      const duration = keyframes?.length > 0 ? keyframes[keyframes.length - 1].time : 1;
      return { ...r, duration };
    } catch (e) { return { error: e.message }; }
  }, { word, config: voiceParams });

  if (result && result.error) throw new Error(result.error);

  const audioDuration = (result?.duration || 1) * 1000;
  await delay(audioDuration + 2500);

  let lexiReady = false;
  for (let i = 0; i < 30 && !lexiReady; i++) {
    lexiReady = await lexiPage.evaluate(() => window.isLexiReady && window.isLexiReady());
    if (!lexiReady) await delay(200);
  }

  // Screenshot spectrogram and waveform
  try {
    const spec = await lexiPage.$('#spectrogram');
    if (spec) await spec.screenshot({ path: path.join(outputDir, `${word}_spectrogram.png`) });
    const wave = await lexiPage.$('#waveform');
    if (wave) await wave.screenshot({ path: path.join(outputDir, `${word}_waveform.png`) });
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

  // Save landmarks
  let landmarksSaved = false;
  for (let i = 0; i < 5 && !landmarksSaved; i++) {
    try {
      if (i > 0) await delay(300);
      const landmarks = await lexiPage.evaluate(() =>
        window.getCalculatedLandmarks ? window.getCalculatedLandmarks() : null
      );
      if (landmarks && landmarks.length > 0) {
        fs.writeFileSync(path.join(outputDir, `${word}_landmarks.json`), JSON.stringify(landmarks, null, 2));
        landmarksSaved = true;
      }
    } catch (e) { /* retry */ }
  }

  const dur = audioSaved ? fs.statSync(wavPath).size : 0;
  console.log(`  audio: ${audioSaved ? 'OK' : 'FAILED'}, landmarks: ${landmarksSaved ? 'OK' : 'FAILED'}`);
  return { audioSaved, landmarksSaved };
}

async function main() {
  console.log('Regenerating "gap" and "see"\n');
  let session;
  try {
    session = await launchSession();
    console.log('Session ready\n');
    for (const { word, outputDir } of testWords) {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log(`Processing "${word}"...`);
      await processWord(session.ttsPage, session.lexiPage, word, outputDir);
      await delay(500);
    }
    console.log('\nDone!');
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    if (session) try { await session.browser.close(); } catch (e) {}
  }
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
main().catch(console.error);

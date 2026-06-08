/**
 * Batch Runner - Run this in browser console while TTS, Pink Trombone, and LEXI pages are open
 *
 * Usage:
 * 1. Open these pages in separate tabs (same browser):
 *    - http://localhost:8080/tts/
 *    - http://localhost:8080/pink-trombone/
 *    - http://localhost:8080/lexi/
 * 2. Click on Pink Trombone to start audio
 * 3. Open browser console in TTS tab (F12 -> Console)
 * 4. Copy and paste this entire script
 * 5. Run: await batchProcess({ voice: 'male', startIndex: 0, count: 100 })
 */

const voiceConfigs = {
  male: { frequency: 140, tractLength: 44 },
  female: { frequency: 220, tractLength: 38 }
};

const results = [];
let isRunning = false;

async function batchProcess(options = {}) {
  const {
    voice = 'male',
    startIndex = 0,
    count = 100,
    delayMs = 500
  } = options;

  const config = voiceConfigs[voice];
  if (!config) {
    console.error('Invalid voice. Use "male" or "female"');
    return;
  }

  const words = window.getWordList();
  const batchWords = words.slice(startIndex, startIndex + count);

  console.log(`Starting batch: ${batchWords.length} words, voice: ${voice}`);
  console.log(`Config: F0=${config.frequency}Hz, tractLength=${config.tractLength}`);

  isRunning = true;
  let processed = 0;
  let errors = 0;

  for (const word of batchWords) {
    if (!isRunning) {
      console.log('Batch stopped by user');
      break;
    }

    try {
      // Synthesize the word
      await window.synthesizeWord(word, config);

      // Wait for LEXI to process
      await waitForLexi(5000);

      // Get results from LEXI (you need to have LEXI page open)
      // Results are stored in LEXI's window.getCurrentLandmarks()

      processed++;
      if (processed % 10 === 0) {
        console.log(`Progress: ${processed}/${batchWords.length} (${((processed/batchWords.length)*100).toFixed(1)}%)`);
      }

      // Small delay between words
      await delay(delayMs);

    } catch (e) {
      console.error(`Error processing "${word}":`, e.message);
      errors++;
    }
  }

  console.log(`\nBatch complete!`);
  console.log(`Processed: ${processed}, Errors: ${errors}`);
  console.log(`\nTo download from LEXI, click the download buttons in the LEXI tab.`);
  console.log(`Or open LEXI console and run: downloadLandmarks()`);

  return { processed, errors };
}

async function waitForLexi(timeoutMs = 5000) {
  // This checks if LEXI has received the audio via BroadcastChannel
  // Since we can't directly access LEXI's window, we just wait
  return delay(timeoutMs / 5); // Rough estimate of synthesis time
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function stopBatch() {
  isRunning = false;
  console.log('Stopping batch...');
}

// Expose globally
window.batchProcess = batchProcess;
window.stopBatch = stopBatch;
window.voiceConfigs = voiceConfigs;

console.log('Batch Runner loaded!');
console.log('');
console.log('Usage:');
console.log('  await batchProcess({ voice: "male", startIndex: 0, count: 100 })');
console.log('  await batchProcess({ voice: "female", startIndex: 0, count: 100 })');
console.log('');
console.log('To stop: stopBatch()');
console.log('');
console.log('Make sure Pink Trombone and LEXI tabs are open!');

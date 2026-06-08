// Shared helpers for the batch generator (index.js + playwright-worker.js).

// Make a word safe to use as a filename. Kept identical on both sides so that
// the orchestrator's "does this WAV already exist?" resume check and the
// worker's write path always agree.
function sanitizeFilename(word) {
  return word
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 100);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

module.exports = { sanitizeFilename, delay, log };

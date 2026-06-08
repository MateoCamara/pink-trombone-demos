/**
 * Keyframe timing verification test
 * Run from batch-generator directory: node debug-keyframes.js
 * Requires live-server running on port 8081
 */
const { chromium } = require('playwright');

// Expected durations from JSON fix files (in ms)
// Duration = time TO next keyframe (how keyframe editor displays it)
// JSON duration_ms of X = how long X lasts = duration shown in editor for X
const expectedDurations = {
  't(0)': 50,     // t.json t(0) duration_ms: 50
  't(0)]': 10,    // t.json t(0)] duration_ms: 10
  't(1)': 10,     // t.json t(1) duration_ms: 10
  't(1)]': 100,   // t.json t(1)] duration_ms: 100
  'p(1)': 10,     // p.json p(1) duration_ms: 10
  'p(1)]': 41,    // p.json p(1)] duration_ms: 41
};

async function test() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log('Opening TTS page...');
  await page.goto('http://localhost:8081/tts/', { waitUntil: 'networkidle' });
  await page.waitForFunction('window.isTTSReady && window.isTTSReady()', { timeout: 30000 });

  console.log('Typing "tap"...');
  await page.fill('#text', 'tap');
  await page.waitForTimeout(1000);

  const keyframes = await page.evaluate(() => {
    // Use getUtterance() to get full keyframes including final "."
    if (typeof getUtterance !== 'function') return { error: 'getUtterance not found' };
    const utterance = getUtterance();
    const kfs = utterance.keyframes;
    // Calculate duration TO next keyframe (like keyframe editor does)
    return kfs.map((kf, i) => {
      const nextKf = kfs[i + 1];
      const durationToNext = nextKf ? Math.round((nextKf.time - kf.time) * 1000) : null;
      return { name: kf.name, durationMs: durationToNext, isHold: kf.isHold };
    });
  });

  if (keyframes.error) {
    console.error('Error:', keyframes.error);
    await browser.close();
    process.exit(1);
  }

  console.log('\n=== Keyframe Durations ===');
  let passed = 0, failed = 0;

  for (const kf of keyframes) {
    const expected = expectedDurations[kf.name];
    if (expected !== undefined) {
      const ok = Math.abs(kf.durationMs - expected) < 2;
      const status = ok ? '✓' : '✗';
      console.log(`${status} ${kf.name.padEnd(8)} ${kf.durationMs}ms (expected ${expected}ms)`);
      if (ok) passed++; else failed++;
    } else {
      console.log(`  ${kf.name.padEnd(8)} ${kf.durationMs}ms`);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}
test().catch(e => { console.error('Error:', e.message); process.exit(1); });

import { expect, test } from '@playwright/test';

async function measureRafStats(page, options = {}) {
  return page.evaluate(({ warmupMs, sampleMs }) => new Promise((resolve) => {
    const timestamps = [];
    const warmupUntil = performance.now() + warmupMs;
    let sampleEnd = 0;
    let collecting = false;

    const onFrame = (time) => {
      if (!collecting && time >= warmupUntil) {
        collecting = true;
        sampleEnd = time + sampleMs;
      }

      if (collecting) timestamps.push(time);
      if (collecting && time >= sampleEnd) {
        if (timestamps.length < 2) {
          resolve({
            fps: 0,
            frames: timestamps.length,
            avgFrameMs: Infinity,
            p95FrameMs: Infinity,
          });
          return;
        }

        const frameTimes = [];
        for (let index = 1; index < timestamps.length; index += 1) {
          frameTimes.push(timestamps[index] - timestamps[index - 1]);
        }
        const avgFrameMs = frameTimes.reduce((sum, value) => sum + value, 0) / frameTimes.length;
        const sorted = [...frameTimes].sort((a, b) => a - b);
        const p95FrameMs = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
        resolve({
          fps: 1000 / avgFrameMs,
          frames: timestamps.length,
          avgFrameMs,
          p95FrameMs,
        });
        return;
      }

      requestAnimationFrame(onFrame);
    };

    requestAnimationFrame(onFrame);
  }), {
    warmupMs: options.warmupMs ?? 1_500,
    sampleMs: options.sampleMs ?? 4_500,
  });
}

test.describe('host framerate regression pack', () => {
  test('maintains acceptable frame pacing in baseline and CPU-throttled runs', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Framerate pack runs only in chromium due CPU throttling via CDP.');

    await page.goto('/?session=fps-pack-123&transport=local&fixture=showcase&seed=1337&test=1');
    await page.waitForFunction(() => Boolean(window.__capybara?.host?.ready));

    const cdp = await page.context().newCDPSession(page);

    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const baseline = await measureRafStats(page);
    await testInfo.attach('framerate-baseline.json', {
      contentType: 'application/json',
      body: Buffer.from(JSON.stringify(baseline, null, 2), 'utf8'),
    });
    expect(baseline.fps).toBeGreaterThanOrEqual(45);
    expect(baseline.p95FrameMs).toBeLessThan(45);

    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const throttled = await measureRafStats(page);
    await testInfo.attach('framerate-throttled.json', {
      contentType: 'application/json',
      body: Buffer.from(JSON.stringify(throttled, null, 2), 'utf8'),
    });
    expect(throttled.fps).toBeGreaterThanOrEqual(12);
    expect(throttled.p95FrameMs).toBeLessThan(180);

    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  });
});

import { expect, test } from '@playwright/test';

const performanceMetricNames = [
  'FramesPerSecond',
  'TaskDuration',
  'ScriptDuration',
  'LayoutDuration',
  'RecalcStyleDuration',
  'JSHeapUsedSize',
  'JSHeapTotalSize',
  'Nodes',
];

async function attachJson(testInfo, name, payload) {
  await testInfo.attach(name, {
    contentType: 'application/json',
    body: Buffer.from(JSON.stringify(payload, null, 2), 'utf8'),
  });
}

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

async function readChromeMetrics(cdp) {
  const { metrics } = await cdp.send('Performance.getMetrics');
  return Object.fromEntries(
    metrics
      .filter((metric) => performanceMetricNames.includes(metric.name))
      .map((metric) => [metric.name, metric.value]),
  );
}

async function readHostDiagnostics(page) {
  return page.evaluate(() => window.__capybara?.host?.getDiagnostics?.() ?? null);
}

async function sampleScenario(page, cdp, options = {}) {
  if (options.cpuThrottlingRate != null) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: options.cpuThrottlingRate });
  }

  const before = await readChromeMetrics(cdp);
  const raf = await measureRafStats(page, options);
  const after = await readChromeMetrics(cdp);
  const diagnostics = await readHostDiagnostics(page);

  return {
    chromeMetrics: {
      after,
      before,
    },
    diagnostics,
    raf,
  };
}

test.describe('host framerate regression pack', () => {
  test('maintains acceptable frame pacing in baseline and CPU-throttled runs', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Framerate pack runs only in chromium due CPU throttling via CDP.');

    await page.goto('/?session=fps-pack-123&transport=local&fixture=showcase&seed=1337&test=1');
    await page.waitForFunction(() => Boolean(window.__capybara?.host?.ready));

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');

    const baseline = await sampleScenario(page, cdp, { cpuThrottlingRate: 1 });
    await attachJson(testInfo, 'framerate-baseline.json', baseline);
    expect(baseline.raf.fps).toBeGreaterThanOrEqual(45);
    expect(baseline.raf.p95FrameMs).toBeLessThan(45);
    expect(baseline.diagnostics?.profile.lowPowerMode).toBe(false);

    const throttled = await sampleScenario(page, cdp, { cpuThrottlingRate: 4 });
    await attachJson(testInfo, 'framerate-throttled.json', throttled);
    expect(throttled.raf.fps).toBeGreaterThanOrEqual(12);
    expect(throttled.raf.p95FrameMs).toBeLessThan(180);

    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  });

  test('applies the low-power profile under a simulated constrained device setup', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Low-power pack runs only in chromium due CDP diagnostics.');

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1024,
      height: 600,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
      media: '',
    });

    await page.goto('/?session=fps-pack-low-power&transport=local&fixture=showcase&seed=1337&test=1&power=low');
    await page.waitForFunction(() => Boolean(window.__capybara?.host?.ready));

    const lowPower = await sampleScenario(page, cdp, {
      cpuThrottlingRate: 6,
      sampleMs: 5_000,
      warmupMs: 2_000,
    });
    await attachJson(testInfo, 'framerate-low-power.json', lowPower);

    expect(lowPower.diagnostics?.profile.lowPowerMode).toBe(true);
    expect(lowPower.diagnostics?.profile.dprCap).toBe(1);
    expect(lowPower.diagnostics?.canvas?.dpr).toBeLessThanOrEqual(1);
    expect(lowPower.diagnostics?.render.minimapDraws).toBeLessThan(lowPower.diagnostics?.render.frames);
    expect(lowPower.diagnostics?.canvas?.totalBytes).toBeLessThanOrEqual(3_000_000);
    expect(lowPower.raf.fps).toBeGreaterThanOrEqual(10);
    expect(lowPower.raf.p95FrameMs).toBeLessThan(200);

    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await cdp.send('Emulation.clearDeviceMetricsOverride');
    await cdp.send('Emulation.setEmulatedMedia', { features: [], media: '' });
  });
});

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
    expect(baseline.raf.fps).toBeGreaterThanOrEqual(20);
    expect(baseline.raf.frames).toBeGreaterThan(80);
    expect(Number.isFinite(baseline.raf.p95FrameMs)).toBe(true);
    expect(baseline.diagnostics?.profile.name).toBe('webcanvas');
    expect(baseline.diagnostics?.profile.mainGameRenderer).toBe('webcanvas');

    const throttled = await sampleScenario(page, cdp, { cpuThrottlingRate: 4 });
    await attachJson(testInfo, 'framerate-throttled.json', throttled);
    expect(throttled.raf.fps).toBeGreaterThanOrEqual(6);
    expect(throttled.raf.frames).toBeGreaterThan(20);
    expect(Number.isFinite(throttled.raf.p95FrameMs)).toBe(true);
    expect(throttled.raf.fps).toBeLessThan(baseline.raf.fps);
    expect(throttled.raf.p95FrameMs).toBeGreaterThan(baseline.raf.p95FrameMs);

    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  });

  test('keeps webcanvas rendering for the main game area even with legacy power query params', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Webcanvas diagnostics pack runs only in chromium due CDP diagnostics.');

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1024,
      height: 600,
      deviceScaleFactor: 1,
      mobile: false,
    });

    await page.goto('/?session=fps-pack-webcanvas-default&transport=local&fixture=showcase&seed=1337&test=1');
    await page.waitForFunction(() => Boolean(window.__capybara?.host?.ready));

    const defaultProfile = await sampleScenario(page, cdp, {
      cpuThrottlingRate: 6,
      sampleMs: 5_000,
      warmupMs: 2_000,
    });
    await attachJson(testInfo, 'framerate-webcanvas-default.json', defaultProfile);

    await page.goto('/?session=fps-pack-webcanvas-legacy-power&transport=local&fixture=showcase&seed=1337&test=1&power=low');
    await page.waitForFunction(() => Boolean(window.__capybara?.host?.ready));

    const legacyPowerParam = await sampleScenario(page, cdp, {
      cpuThrottlingRate: 6,
      sampleMs: 5_000,
      warmupMs: 2_000,
    });
    await attachJson(testInfo, 'framerate-webcanvas-legacy-power.json', legacyPowerParam);

    expect(defaultProfile.diagnostics?.profile.name).toBe('webcanvas');
    expect(defaultProfile.diagnostics?.profile.mainGameRenderer).toBe('webcanvas');
    expect(legacyPowerParam.diagnostics?.profile.name).toBe('webcanvas');
    expect(legacyPowerParam.diagnostics?.profile.mainGameRenderer).toBe('webcanvas');
    expect(legacyPowerParam.diagnostics?.profile.dprCap).toBe(defaultProfile.diagnostics?.profile.dprCap);
    expect(legacyPowerParam.diagnostics?.canvas?.dpr).toBeCloseTo(defaultProfile.diagnostics?.canvas?.dpr ?? 0, 1);
    expect(defaultProfile.raf.fps).toBeGreaterThanOrEqual(6);
    expect(legacyPowerParam.raf.fps).toBeGreaterThanOrEqual(6);

    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await cdp.send('Emulation.clearDeviceMetricsOverride');
  });
});

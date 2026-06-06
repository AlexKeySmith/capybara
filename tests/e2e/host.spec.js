import { expect, test } from '@playwright/test';

test('host bootstraps deterministic arena and publishes join information', async ({ page }) => {
  await page.goto('/?session=test-host-123&transport=local&fixture=showcase&seed=1337&test=1');
  await page.waitForFunction(() => Boolean(window.__capybara?.host?.ready));

  await expect(page.getByTestId('host-fixture')).toContainText('Showcase');
  await expect(page.getByTestId('host-transport')).toContainText('LOCAL');
  await expect(page.getByTestId('session-code')).toContainText('TESTHOST');
  await expect(page.getByTestId('join-url')).toContainText('/controller/');
  await expect(page.getByTestId('join-steps')).toContainText('Arcade quick join');
  await expect(page.getByTestId('keyboard-help')).toContainText('Keyboard controls');
  await expect(page.getByTestId('host-score')).toContainText('Score:');
  await expect(page.getByTestId('host-attract-banner')).toBeVisible();
  await expect(page.getByTestId('host-attract-prompt')).toHaveText('SCAN TO JOIN');
  await expect(page.getByTestId('host-attract-status')).toHaveText('1/4 linked');
  await expect(page.getByTestId('host-seat-availability')).toHaveText('P2-P4 READY');
  await expect(page.getByTestId('host-seat-host')).toHaveAttribute('data-linked', 'true');
  await expect(page.getByTestId('host-seat-p2')).toHaveAttribute('data-linked', 'false');
  await expect(page.getByTestId('host-canvas')).toHaveAttribute('data-renderer', 'webcanvas');
  const hostQuery = await page.evaluate(() => window.location.search);
  expect(hostQuery).not.toContain('render=');
});

test('host join sidebar remains visually stable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Visual baseline is only maintained for the desktop chromium project.');
  await page.goto('/?session=visual-host-123&transport=local&fixture=showcase&seed=1337&test=1');
  await page.waitForFunction(() => Boolean(window.__capybara?.host?.ready));

  await expect(page.locator('.sidebar-panel').first()).toHaveScreenshot('host-join-panel.png');
});

test('host attract banner remains visually stable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Visual baseline is only maintained for the desktop chromium project.');
  await page.goto('/?session=visual-host-123&transport=local&fixture=showcase&seed=1337&test=1');
  await page.waitForFunction(() => Boolean(window.__capybara?.host?.ready));

  await expect(page.getByTestId('host-attract-banner')).toHaveScreenshot('host-attract-banner.png');
});

test('host attract banner stays readable at 720p and 1080p', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Viewport layout checks are only maintained for the desktop chromium project.');

  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(`/?session=layout-${viewport.width}&transport=local&fixture=showcase&seed=1337&test=1`);
    await page.waitForFunction(() => Boolean(window.__capybara?.host?.ready));
    const layout = await page.evaluate(() => {
      const toBox = (element) => {
        if (!element) return null;
        const { left, right, top, bottom, width, height } = element.getBoundingClientRect();
        return { left, right, top, bottom, width, height };
      };
      const banner = toBox(document.querySelector('[data-testid="host-attract-banner"]'));
      const canvasWrap = toBox(document.querySelector('.canvas-wrap'));
      return { banner, canvasWrap };
    });
    expect(layout.banner).toBeTruthy();
    expect(layout.canvasWrap).toBeTruthy();
    expect(layout.banner.width).toBeGreaterThan(280);
    expect(layout.banner.left).toBeGreaterThanOrEqual(layout.canvasWrap.left);
    expect(layout.banner.right).toBeLessThanOrEqual(layout.canvasWrap.right);
    expect(layout.banner.bottom).toBeLessThanOrEqual(layout.canvasWrap.bottom);
  }
});

test('controller joins local host and receives an assignment', async ({ browser }) => {
  const context = await browser.newContext();
  const host = await context.newPage();
  await host.goto('/?session=join-flow-123&transport=local&fixture=training&seed=2024&test=1');
  await host.waitForFunction(() => Boolean(window.__capybara?.host?.ready));

  const controllerNames = ['Ace', 'Blaze', 'Comet'];
  const controllers = [];
  for (const name of controllerNames) {
    const controller = await context.newPage();
    await controller.goto(`/controller/?session=join-flow-123&transport=local&name=${name}`);
    await controller.waitForFunction(() => Boolean(window.__capybara?.controller?.ready));
    await expect(controller.getByTestId('controller-status')).toContainText(/Connected|Joining/);
    controllers.push(controller);
  }

  const [controller] = controllers;
  await expect(host.getByTestId('metric-controllers')).toHaveText('3');
  await expect(host.getByTestId('host-attract-status')).toHaveText('4/4 linked');
  await expect(host.getByTestId('host-seat-availability')).toHaveText('ARENA FULL');
  await expect(host.getByTestId('host-seat-p2')).toHaveAttribute('data-linked', 'true');
  await expect(host.getByTestId('host-seat-p3')).toHaveAttribute('data-linked', 'true');
  await expect(host.getByTestId('host-seat-p4')).toHaveAttribute('data-linked', 'true');
  await expect(host.locator('[data-testid="roster-list"]')).toContainText('Ace');
  await expect(host.locator('[data-testid="roster-list"]')).toContainText('Blaze');
  await expect(host.locator('[data-testid="roster-list"]')).toContainText('Comet');

  await controller.locator('[data-control="fire"]').dispatchEvent('pointerdown');
  await controller.locator('[data-control="fire"]').dispatchEvent('pointerup');
  await expect(host.getByTestId('host-last-action')).not.toHaveText('Awaiting controller join...');

  await controllers[2].close();
  await expect(host.getByTestId('metric-controllers')).toHaveText('2');
  await expect(host.getByTestId('host-attract-status')).toHaveText('3/4 linked');
  await expect(host.getByTestId('host-seat-availability')).toHaveText('P4 READY');
  await expect(host.getByTestId('host-seat-p4')).toHaveAttribute('data-linked', 'false');

  await context.close();
});

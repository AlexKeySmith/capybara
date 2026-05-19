import { expect, test } from '@playwright/test';

test('host bootstraps deterministic arena and publishes join information', async ({ page }) => {
  await page.goto('/?session=test-host-123&transport=local&fixture=showcase&seed=1337&test=1');
  await page.waitForFunction(() => Boolean(window.__molez?.host?.ready));

  await expect(page.getByTestId('host-fixture')).toContainText('Showcase');
  await expect(page.getByTestId('host-transport')).toContainText('LOCAL');
  await expect(page.getByTestId('session-code')).toContainText('TESTHOST');
  await expect(page.getByTestId('join-url')).toContainText('/controller/');
  await expect(page.getByTestId('join-steps')).toContainText('Arcade quick join');
  await expect(page.getByTestId('keyboard-help')).toContainText('Keyboard controls');
  await expect(page.getByTestId('host-score')).toContainText('Score:');
});

test('host join sidebar remains visually stable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Visual baseline is only maintained for the desktop chromium project.');
  await page.goto('/?session=visual-host-123&transport=local&fixture=showcase&seed=1337&test=1');
  await page.waitForFunction(() => Boolean(window.__molez?.host?.ready));

  await expect(page.locator('.sidebar-panel').first()).toHaveScreenshot('host-join-panel.png');
});

test('controller joins local host and receives an assignment', async ({ browser }) => {
  const context = await browser.newContext();
  const host = await context.newPage();
  await host.goto('/?session=join-flow-123&transport=local&fixture=training&seed=2024&test=1');
  await host.waitForFunction(() => Boolean(window.__molez?.host?.ready));

  const controller = await context.newPage();
  await controller.goto('/controller/?session=join-flow-123&transport=local&name=Ace');
  await controller.waitForFunction(() => Boolean(window.__molez?.controller?.ready));

  await expect(controller.getByTestId('controller-status')).toContainText(/Connected|Joining/);
  await expect(host.getByTestId('metric-controllers')).toHaveText('1');
  await expect(host.locator('[data-testid="roster-list"]')).toContainText('Ace');

  await controller.locator('[data-control="fire"]').dispatchEvent('pointerdown');
  await controller.locator('[data-control="fire"]').dispatchEvent('pointerup');
  await expect(host.getByTestId('host-last-action')).not.toHaveText('Awaiting controller join...');

  await context.close();
});

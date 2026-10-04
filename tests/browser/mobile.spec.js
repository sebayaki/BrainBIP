import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const fixture = JSON.parse(
  await readFile(new URL('../fixtures/brainbip-v1.json', import.meta.url), 'utf8'),
);
const offlineURL = new URL('../../dist/brainbip.html', import.meta.url).href;

test('mobile WebKit keeps controls readable, zoom available, and the layout inside the viewport', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    'content',
    'width=device-width, initial-scale=1',
  );
  for (const width of [320, 390, 430, 768]) {
    await page.setViewportSize({ width, height: 844 });
    for (const id of ['passphrase', 'email']) {
      const input = page.locator(`#${id}`);
      expect(
        await input.evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
      ).toBeGreaterThanOrEqual(16);
      await input.focus();
      expect(await page.evaluate(() => window.visualViewport.scale)).toBe(1);
    }
    for (const id of ['private-email', 'toggle-password', 'generate-button', 'reset-button']) {
      const size = await page.locator(`#${id}`).boundingBox();
      expect(size.height).toBeGreaterThanOrEqual(44);
      expect(size.width).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#email').blur();
  await page.screenshot({
    path: testInfo.outputPath('webkit-mobile-empty.png'),
    fullPage: true,
    caret: 'initial',
  });
  await expect(page.locator('#strength-feedback')).toBeHidden();
  await page.locator('#docs-strength > summary').click();
  await expect(page.locator('#strength-feedback')).toBeVisible();
});

test('mobile WebKit derives offline including Monero and renders long addresses without overflow', async ({
  page,
  context,
}, testInfo) => {
  const requests = [];
  const errors = [];
  page.on('request', (request) => {
    if (/^https?:/.test(request.url())) requests.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  const collectConsoleError = (message) => {
    if (message.type() === 'error') errors.push(message.text());
  };
  page.on('console', collectConsoleError);
  // WebKit's simulated offline mode also rejects local blob worker URLs.
  // Block every HTTP(S) request instead, while allowing file/blob/data assets.
  await context.route(/^https?:\/\//, (route) => route.abort('internetdisconnected'));
  await page.goto(offlineURL);
  await page.locator('#passphrase').fill(fixture.passphrase);
  await page.locator('#email').fill(fixture.email);
  await page.locator('#generate-button').click();
  await expect(page.locator('#result-state')).toBeVisible({ timeout: 60_000 });
  await page.locator('#toggle-phrase').click();
  await expect(page.locator('#mnemonic-grid .word-value')).toHaveText(fixture.mnemonic.split(' '));
  await page.locator('#tab-xmr').click();
  await expect(page.locator('#address-list tr')).toHaveCount(20);
  await expect(page.locator('.address-text').first()).toHaveText(/^4[1-9A-HJ-NP-Za-km-z]{94}$/);
  await expect(page.locator('.address-text').last()).toHaveText(/^8[1-9A-HJ-NP-Za-km-z]{94}$/);
  await page.locator('#monero-recovery-details > summary').click();
  await page.locator('#toggle-monero-phrase').click();
  await expect(page.locator('#monero-mnemonic-grid .word-value')).toHaveCount(25);
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const clipped = await page
      .locator('.word-value, .address-text')
      .evaluateAll((elements) =>
        elements.some((element) => element.scrollWidth > element.clientWidth + 1),
      );
    expect(clipped).toBe(false);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(errors).toEqual([]);
  // Playwright WebKit injects a "body {}" style to synchronize screenshots.
  // Our hash-only CSP correctly blocks that test-tool style. Keep the app's
  // policy intact and exclude only console events during this visual capture.
  page.off('console', collectConsoleError);
  try {
    await page.screenshot({
      path: testInfo.outputPath('webkit-mobile-monero.png'),
      fullPage: true,
      caret: 'initial',
    });
  } finally {
    page.on('console', collectConsoleError);
  }
  await page.locator('#reset-button').click();
  await expect(page.locator('#monero-mnemonic-grid li')).toHaveCount(0);
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});

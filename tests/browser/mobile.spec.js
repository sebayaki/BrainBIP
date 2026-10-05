import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const fixture = JSON.parse(
  await readFile(new URL('../fixtures/brainbip-v2.json', import.meta.url), 'utf8'),
);
const pathFixture = JSON.parse(
  await readFile(new URL('../fixtures/address-presets.json', import.meta.url), 'utf8'),
);
const fixture24 = JSON.parse(
  await readFile(new URL('../fixtures/brainbip-24.json', import.meta.url), 'utf8'),
);
const offlineURL = new URL('../../dist/brainbip.html', import.meta.url).href;

test('mobile estimates and native rate selection show full values without overflow or zooming', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.testMobileStrengthBits = 13.9;
    window.Worker = class extends NativeWorker {
      postMessage(data, ...rest) {
        if (!Object.hasOwn(data, 'privateEmail')) return super.postMessage(data, ...rest);
        const bits = window.testMobileStrengthBits;
        const result = {
          passphraseBits: bits,
          emailBits: 0,
          combinedBits: bits,
          score: bits === 128 ? 4 : 0,
          label: bits === 128 ? 'High guesswork estimate' : 'Very low guesswork estimate',
          limited: false,
          feedback: ['Public model fixture; not measured entropy.'],
        };
        queueMicrotask(() => this.onmessage?.({ data: { id: data.id, type: 'strength', result } }));
      }
    };
  });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await page.locator('#passphrase').fill('PUBLIC MOBILE MODEL FIXTURE ONLY');
  await expect(page.locator('#strength-box')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#strength-bits')).toBeVisible();
  await expect(page.locator('#strength-bits')).toHaveText('13.9');
  await expect(page.locator('#strength-meter i')).toHaveCount(4);
  await expect(page.locator('#strength-meter')).toHaveAttribute('data-score', '0');
  await expect(page.locator('#strength-time')).toHaveText('~4 hours');
  await expect(page.locator('#guess-time-chart, #strength-marker, .guess-time-tick')).toHaveCount(
    0,
  );
  const timeFits = () =>
    page.locator('#strength-time').evaluate((value) => {
      const row = document.getElementById('strength-time-row').getBoundingClientRect();
      const bounds = value.getBoundingClientRect();
      return (
        bounds.left >= row.left - 1 &&
        bounds.right <= row.right + 1 &&
        bounds.bottom <= row.bottom + 1 &&
        (!value.clientWidth || value.scrollWidth <= value.clientWidth + 1) &&
        getComputedStyle(value).textOverflow !== 'ellipsis'
      );
    });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    if (!(await page.locator('#strength-options').evaluate((element) => element.open))) {
      await page.locator('#strength-options > summary').click();
    }
    await expect(page.locator('#guess-rate')).toBeVisible();
    expect(await page.locator('#guess-rate').evaluate((element) => element.tagName)).toBe('SELECT');
    expect(
      await page
        .locator('#guess-rate')
        .evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
    ).toBeGreaterThanOrEqual(16);
    expect((await page.locator('#guess-rate').boundingBox()).height).toBeGreaterThanOrEqual(44);
    await page.locator('#guess-rate').focus();
    expect(await page.evaluate(() => window.visualViewport.scale)).toBe(1);
    await page.locator('#guess-rate').selectOption('1000');
    await expect(page.locator('#strength-time')).toHaveText('~15 seconds');
    await expect(page.locator('#strength-assumption')).toHaveText(/total.*1,?000/i);
    await expect(page.locator('#strength-bits')).toHaveText('13.9');
    await expect(page.locator('#strength-meter')).toHaveAttribute('data-score', '0');
    await page.locator('#guess-rate').blur();
    expect(await timeFits()).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.locator('#strength-box').screenshot({
      path: testInfo.outputPath('webkit-guess-time-' + width + '.png'),
      caret: 'initial',
    });
    await page.locator('#guess-rate').selectOption('1');
  }
  await page.evaluate(() => {
    window.testMobileStrengthBits = 128;
  });
  await page.locator('#passphrase').fill('PUBLIC MAXIMUM MOBILE MODEL FIXTURE ONLY');
  await expect(page.locator('#strength-bits')).toHaveText('128');
  await expect(page.locator('#strength-meter')).toHaveAttribute('data-score', '4');
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const rate of ['0.1', '1', '1000']) {
      await page.locator('#guess-rate').selectOption(rate);
      await expect(page.locator('#strength-time')).toHaveText(/^~\d{1,3}(?:,\d{3})+ years$/);
      await expect(page.locator('#strength-bits')).toBeVisible();
      await expect(page.locator('#strength-bits')).toHaveText('128');
      await expect(page.locator('#strength-meter')).toHaveAttribute('data-score', '4');
      const text = await page.locator('#strength-time').textContent();
      expect(text).not.toMatch(/>\s*100|e[+-]|million|billion|trillion/i);
      expect(await page.locator('#strength-time').getAttribute('aria-label')).toContain(text);
      expect(await timeFits()).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (rate === '0.1')
        await page.locator('#strength-box').screenshot({
          path: testInfo.outputPath('webkit-full-years-' + width + '.png'),
          caret: 'initial',
        });
    }
  }
  await page.locator('#strength-options > summary').click();
  await expect(page.locator('#strength-bits')).toBeVisible();
  await expect(page.locator('#strength-bits')).toHaveText('128');
  await page.locator('#reset-button').click();
  await expect(page.locator('#guess-rate')).toHaveValue('1');
  expect(await page.locator('#strength-options').evaluate((element) => element.open)).toBe(false);
  await expect(page.locator('#strength-bits')).toHaveText('—');
  expect(await page.locator('#strength-meter').getAttribute('data-score')).toBeNull();
});

test('mobile WebKit keeps controls readable, zoom available, and the layout inside the viewport', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(page.locator('.chain-pills > span')).toHaveText([
    'Bitcoin',
    'Ethereum',
    'Solana',
    'Zcash',
  ]);
  await expect(page.locator('.chain-pills svg[aria-hidden="true"]')).toHaveCount(4);
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
    for (const id of [
      'private-email',
      'toggle-password',
      'generate-button',
      'reset-button',
      'word-count-12',
      'word-count-24',
    ]) {
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

test('mobile WebKit derives four chains offline and renders full-name tabs without overflow', async ({
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
  await expect(page.locator('#profile-select')).toHaveCount(0);
  await page.locator('#passphrase').fill(fixture.passphrase);
  await page.locator('#email').fill(fixture.email);
  await page.locator('#generate-button').click();
  await expect(page.locator('#progress-state')).toHaveAttribute('data-stage', 'argon2id');
  await expect(page.locator('#output-panel')).toBeFocused();
  await expect
    .poll(async () => {
      const box = await page.locator('#output-panel').boundingBox();
      return box.y >= 0 && box.y <= 80;
    })
    .toBe(true);
  await expect(page.locator('#progress-cancel-button')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // The WebKit screenshot tool injects a style blocked by the app's CSP.
  page.off('console', collectConsoleError);
  try {
    await page.screenshot({
      path: testInfo.outputPath('webkit-memory-progress.png'),
      caret: 'initial',
    });
  } finally {
    page.on('console', collectConsoleError);
  }
  await expect(page.locator('#result-state')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#profile-tag')).toHaveCount(0);
  await testInfo.attach('v2-browser-timing', {
    body: await page.locator('#result-timing').textContent(),
    contentType: 'text/plain',
  });
  await page.locator('#toggle-phrase').click();
  await expect(page.locator('#mnemonic-grid .word-value')).toHaveText(fixture.mnemonic.split(' '));
  await expect(page.locator('#chain-tabs button')).toHaveText([
    'Bitcoin',
    'Ethereum',
    'Solana',
    'Zcash',
  ]);
  await expect(page.locator('#chain-tabs svg')).toHaveCount(4);
  for (const chain of ['btc', 'eth', 'sol', 'zec']) {
    await page.locator('#tab-' + chain).click();
    await expect(page.locator('.address-text')).toHaveText(
      fixture.addresses[chain].map((entry) => entry.address),
    );
    await expect(page.locator('.address-path')).toHaveCount(0);
  }
  await expect(page.locator('#address-list details')).toHaveCount(0);
  expect(
    await page
      .locator('#derivation-select')
      .evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
  ).toBeGreaterThanOrEqual(16);
  await page.locator('#derivation-select').focus();
  expect(await page.evaluate(() => window.visualViewport.scale)).toBe(1);
  for (const width of [320, 390, 430, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect
      .poll(() =>
        page.locator('#tab-zec').evaluate((tab) => {
          const strip = tab.parentElement.getBoundingClientRect();
          const bounds = tab.getBoundingClientRect();
          return bounds.left >= strip.left && bounds.right <= strip.right;
        }),
      )
      .toBe(true);
    const clipped = await page
      .locator('.word-value, .address-text')
      .evaluateAll((elements) =>
        elements.some((element) => element.scrollWidth > element.clientWidth + 1),
      );
    expect(clipped).toBe(false);
  }
  await page.setViewportSize({ width: 320, height: 740 });
  await page.locator('#tab-eth').click();
  await page.locator('#derivation-select').selectOption('ledger-live');
  const ledger = pathFixture.vectors.find(
    (vector) => vector.chain === 'eth' && vector.selection.presetId === 'ledger-live',
  );
  await expect(page.locator('.address-text').first()).toHaveText(
    ledger.rows.find((row) => row.index === 0).address,
  );
  await page.locator('#derivation-select').selectOption('custom');
  await page.locator('#custom-path').fill("m/44'/60'/7'/0/{index}");
  await page.locator('#custom-path').focus();
  expect(await page.evaluate(() => window.visualViewport.scale)).toBe(1);
  expect(
    await page
      .locator('#custom-path')
      .evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
  ).toBeGreaterThanOrEqual(16);
  await page.locator('#apply-path').click();
  const custom = pathFixture.vectors.find(
    (vector) => vector.chain === 'eth' && vector.selection.presetId === 'custom',
  );
  await expect(page.locator('.address-text').first()).toHaveText(
    custom.rows.find((row) => row.index === 0).address,
  );
  await expect(page.locator('#mnemonic-grid .word-value')).toHaveText(fixture.mnemonic.split(' '));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(errors).toEqual([]);
  // Playwright WebKit injects a "body {}" style to synchronize screenshots.
  // Our hash-only CSP correctly blocks that test-tool style. Keep the app's
  // policy intact and exclude only console events during this visual capture.
  page.off('console', collectConsoleError);
  try {
    await page
      .locator('#address-panel')
      .screenshot({ path: testInfo.outputPath('webkit-address-paths.png') });
    await page.screenshot({
      path: testInfo.outputPath('webkit-mobile-addresses.png'),
      fullPage: true,
      caret: 'initial',
    });
  } finally {
    page.on('console', collectConsoleError);
  }
  await page.locator('#word-count-24').click();
  await expect(page.locator('#mnemonic-grid li')).toHaveCount(24);
  await expect(page.locator('#mnemonic-grid .word-value').first()).toHaveText('••••••');
  await page.locator('#toggle-phrase').click();
  await expect(page.locator('#mnemonic-grid .word-value')).toHaveText(
    fixture24.mnemonic.split(' '),
  );
  for (const chain of ['btc', 'eth', 'sol', 'zec']) {
    await page.locator('#tab-' + chain).click();
    await expect(page.locator('.address-text')).toHaveText(
      fixture24.addresses[chain].map((row) => row.address),
    );
  }
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  page.off('console', collectConsoleError);
  try {
    await page
      .locator('#output-panel')
      .screenshot({ path: testInfo.outputPath('webkit-24-words.png') });
  } finally {
    page.on('console', collectConsoleError);
  }
  await page.locator('#reset-button').click();
  await expect(page.locator('#word-count-12')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#mnemonic-grid li')).toHaveCount(0);
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});

test('mobile reduced-motion progress remains cancellable and input edits invalidate work', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  await page.locator('#passphrase').fill('PUBLIC MOBILE CANCELLATION TEST ONLY');
  await page.locator('#generate-button').click();
  await expect(page.locator('#output-panel')).toBeFocused();
  await expect(page.locator('#progress-state')).toBeVisible();
  await expect(page.locator('#progress-cancel-button')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const animations = await page
    .locator('#progress-state')
    .evaluate(
      (element) =>
        element
          .getAnimations({ subtree: true })
          .filter((animation) => animation.playState === 'running').length,
    );
  expect(animations).toBe(0);
  await page.locator('#progress-cancel-button').click();
  await expect(page.locator('#progress-state')).toBeHidden();
  await expect(page.locator('#generate-button')).toBeEnabled();
  const elapsed = await page.locator('#progress-elapsed').textContent();
  await page.waitForTimeout(350);
  await expect(page.locator('#progress-elapsed')).toHaveText(elapsed);
  await page.locator('#generate-button').click();
  await expect(page.locator('#progress-state')).toBeVisible();
  await page.locator('#email').fill('changed@example.invalid');
  await expect(page.locator('#progress-state')).toBeHidden();
  await expect(page.locator('#result-state')).toBeHidden();
  await page.locator('#reset-button').click();
  await expect(page.locator('#profile-select')).toHaveCount(0);
});

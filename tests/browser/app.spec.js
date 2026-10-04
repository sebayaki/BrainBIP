import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const fixture = JSON.parse(
  await readFile(new URL('../fixtures/brainbip-v1.json', import.meta.url), 'utf8'),
);
const v2Fixture = JSON.parse(
  await readFile(new URL('../fixtures/brainbip-v2.json', import.meta.url), 'utf8'),
);
const moneroFixture = JSON.parse(
  await readFile(new URL('../fixtures/monero-ledger-v1.json', import.meta.url), 'utf8'),
).vectors.find((vector) => vector.id === 'brainbip-v1-public');
const offlineURL = new URL('../../dist/brainbip.html', import.meta.url).href;
const htmlPath = fileURLToPath(new URL('../../dist/brainbip.html', import.meta.url));

async function enterFixture(page) {
  await page.locator('#profile-select').selectOption('brainbip-v1');
  await page.locator('#passphrase').fill(fixture.passphrase);
  await page.locator('#email').fill(fixture.email);
}

async function generate(page) {
  await page.locator('#generate-button').click();
  await expect(page.locator('#result-state')).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('#mnemonic-grid li')).toHaveCount(12);
}

async function assertAllAddresses(page) {
  for (const chain of ['btc', 'eth', 'sol', 'zec', 'xmr']) {
    const rows = chain === 'xmr' ? moneroFixture.addresses : fixture.addresses[chain];
    await page.locator(`#tab-${chain}`).click();
    await expect(page.locator('#address-list tr')).toHaveCount(20);
    await expect(page.locator('.address-text')).toHaveText(rows.map((entry) => entry.address));
    await expect(page.locator('.address-path')).toHaveText(rows.map((entry) => entry.path));
  }
}

test('hosted edition computes the full profile offline, shows all addresses, and clears secrets', async ({
  page,
  context,
}, testInfo) => {
  const errors = [];
  const requests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('request', (request) => {
    if (/^https?:/.test(request.url())) requests.push(request.url());
  });
  await page.addInitScript(() => {
    window.testCopies = [];
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async (value) => window.testCopies.push(value) },
      configurable: true,
    });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.locator('#generate-button')).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('desktop-empty.png'), fullPage: true });
  await context.setOffline(true);
  await enterFixture(page);
  await expect(page.locator('#strength-bits')).not.toHaveText('—', { timeout: 15_000 });
  await generate(page);
  await expect(page.locator('#mnemonic-grid .word-value').first()).toHaveText('••••••');
  await page.locator('#toggle-phrase').click();
  await expect(page.locator('#mnemonic-grid .word-value')).toHaveText(fixture.mnemonic.split(' '));
  await assertAllAddresses(page);
  await page.locator('#tab-btc').click();
  await page.locator('#tab-btc').press('ArrowRight');
  await expect(page.locator('#tab-eth')).toHaveAttribute('aria-selected', 'true');
  await page.locator('#copy-phrase').click();
  await page.locator('.copy-address').first().click();
  await expect
    .poll(() => page.evaluate(() => window.testCopies))
    .toEqual([fixture.mnemonic, fixture.addresses.eth[0].address]);
  await page.screenshot({ path: testInfo.outputPath('desktop-result.png'), fullPage: true });
  await page.locator('#toggle-phrase').click();
  await expect(page.locator('#mnemonic-grid .word-value').first()).toHaveText('••••••');
  await expect(page.locator('#mnemonic-grid')).not.toContainText(fixture.mnemonic.split(' ')[0]);
  await page.locator('#email').fill('changed@example.invalid');
  await expect(page.locator('#result-state')).toBeHidden();
  await expect(page.locator('#mnemonic-grid li')).toHaveCount(0);
  await page.locator('#reset-button').click();
  await expect(page.locator('#passphrase')).toHaveValue('');
  await expect(page.locator('#email')).toHaveValue('');
  await expect(page.locator('#generate-button')).toBeDisabled();
  expect(
    await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie]),
  ).toEqual([0, 0, '']);
  expect(await page.evaluate(async () => (await indexedDB.databases()).length)).toBe(0);
  expect(requests).toEqual(['http://127.0.0.1:4173/']);
  expect(errors).toEqual([]);
});

test('single file runs without a server or network at a mobile viewport', async ({
  page,
  context,
}, testInfo) => {
  const networkRequests = [];
  const errors = [];
  page.on('request', (request) => {
    if (/^https?:/.test(request.url())) networkRequests.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await context.setOffline(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(offlineURL);
  await expect(page.locator('#offline-link')).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('mobile-empty.png'), fullPage: true });
  await enterFixture(page);
  await generate(page);
  await page.locator('#toggle-phrase').click();
  await expect(page.locator('#mnemonic-grid .word-value')).toHaveText(fixture.mnemonic.split(' '));
  await assertAllAddresses(page);
  await page.screenshot({ path: testInfo.outputPath('mobile-result.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('mobile-narrow.png'), fullPage: true });
  expect(networkRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('cancel, input edits, and reset discard pending computations', async ({ page }) => {
  await page.goto('/');
  await enterFixture(page);
  await page.locator('#generate-button').click();
  await expect(page.locator('#progress-state')).toBeVisible();
  await page.locator('#cancel-button').click();
  await expect(page.locator('#empty-state')).toBeVisible();
  await expect(page.locator('#generate-button')).toBeEnabled();
  await page.locator('#generate-button').click();
  await page.locator('#passphrase').fill('changed input, public test only');
  await expect(page.locator('#progress-state')).toBeHidden();
  await expect(page.locator('#result-state')).toBeHidden();
  await page.locator('#generate-button').click();
  await page.locator('#reset-button').click();
  await expect(page.locator('#generate-button')).toBeDisabled();
  await expect(page.locator('#progress-state')).toBeHidden();
  await enterFixture(page);
  await generate(page);
  await page.locator('#toggle-phrase').click();
  await expect(page.locator('#mnemonic-grid .word-value')).toHaveText(fixture.mnemonic.split(' '));
});

test('offline download contains pristine build bytes, never the current form', async ({ page }) => {
  await page.goto('/');
  await page.locator('#passphrase').fill('PRIVATE_RUNTIME_SENTINEL__do_not_embed_9163');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#offline-link').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('brainbip.html');
  const downloaded = await readFile(await download.path(), 'utf8');
  expect(downloaded).toBe(await readFile(htmlPath, 'utf8'));
  expect(downloaded).not.toContain('PRIVATE_RUNTIME_SENTINEL__do_not_embed_9163');
});

test('unsupported workers fail visibly instead of weakening the derivation', async ({ page }) => {
  await page.addInitScript(() => {
    window.Worker = class {
      constructor() {
        throw new Error('Unsupported');
      }
    };
  });
  await page.goto('/');
  await enterFixture(page);
  await page.locator('#generate-button').click();
  await expect(page.locator('#input-error')).toBeVisible();
  await expect(page.locator('#result-state')).toBeHidden();
  await expect(page.locator('#generate-button')).toBeEnabled();
  await expect(page.locator('#input-error')).toContainText('could not start local computation');
});

test('a deferred clipboard rejection cannot reintroduce a cleared phrase', async ({ page }) => {
  await page.addInitScript(() => {
    window.fallbackCopies = 0;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: () =>
          new Promise((resolve, reject) => {
            window.rejectTestCopy = reject;
          }),
      },
    });
    document.execCommand = () => {
      window.fallbackCopies += 1;
      return true;
    };
  });
  await page.goto('/');
  await enterFixture(page);
  await generate(page);
  await page.locator('#copy-phrase').click();
  await expect.poll(() => page.evaluate(() => typeof window.rejectTestCopy)).toBe('function');
  await page.locator('#reset-button').click();
  await page.evaluate(async () => {
    window.rejectTestCopy(new Error('Clipboard permission denied'));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(await page.evaluate(() => window.fallbackCopies)).toBe(0);
  await expect(page.locator('textarea')).toHaveCount(0);
  await expect(page.locator('#copy-status')).toBeHidden();
  await expect(page.locator('#mnemonic-grid li')).toHaveCount(0);
});

test('leaving the page clears state before a back-forward cache restore', async ({ page }) => {
  await page.goto('/');
  await enterFixture(page);
  await page.locator('#generate-button').click();
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })),
  );
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
  );
  await expect(page.locator('#passphrase')).toHaveValue('');
  await expect(page.locator('#email')).toHaveValue('');
  await expect(page.locator('#progress-state')).toBeHidden();
  await expect(page.locator('#result-state')).toBeHidden();
  await expect(page.locator('#generate-button')).toBeDisabled();
  await page.locator('#passphrase').fill('public test input');
  await expect(page.locator('#generate-button')).toBeEnabled();
});

test('long input is rejected explicitly instead of silently truncated into another wallet', async ({
  page,
}) => {
  await page.goto('/');
  const tooLong = 'x'.repeat(1025);
  await page.locator('#passphrase').fill(tooLong);
  await expect(page.locator('#passphrase')).toHaveValue(tooLong);
  await page.locator('#generate-button').click();
  await expect(page.locator('#input-error')).toContainText('at most 1024 characters');
  await expect(page.locator('#result-state')).toBeHidden();
  await expect(page.locator('#generate-button')).toBeEnabled();
  const unicode = '😀'.repeat(600);
  await page.locator('#passphrase').fill(unicode);
  await expect(page.locator('#passphrase')).toHaveValue(unicode);
});

test('private email is opt-in, updates only the estimate, and resets off', async ({ page }) => {
  await page.goto('/');
  await page.locator('#profile-select').selectOption('brainbip-v1');
  const toggle = page.getByRole('switch', { name: 'This email is private' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await page.locator('#passphrase').fill('correct horse battery staple');
  await page.locator('#email').fill('nebular.zeppelin.741@example.invalid');
  await expect(page.locator('#strength-bits')).not.toHaveText('—');
  const baseBits = Number(await page.locator('#strength-bits').textContent());
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect
    .poll(async () => Number(await page.locator('#strength-bits').textContent()))
    .toBeGreaterThan(baseBits);
  await expect(page.locator('#strength-detail')).toContainText('assumed');
  await generate(page);
  await page.locator('#toggle-phrase').click();
  const originalWords = await page.locator('#mnemonic-grid .word-value').allTextContents();
  await toggle.click();
  await expect(page.locator('#result-state')).toBeVisible();
  await expect(page.locator('#strength-bits')).toHaveText(String(baseBits));
  await generate(page);
  await page.locator('#toggle-phrase').click();
  await expect(page.locator('#mnemonic-grid .word-value')).toHaveText(originalWords);
  await toggle.click();
  await page.locator('#reset-button').click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
});

test('Monero recovery is hidden by default and cleared after closing, switching, or reset', async ({
  page,
}) => {
  await page.goto('/');
  await enterFixture(page);
  await generate(page);
  await expect(page.locator('#monero-recovery-panel')).toBeHidden();
  await page.locator('#tab-xmr').click();
  await expect(page.locator('#address-list tr')).toHaveCount(20);
  await expect(page.locator('.address-path-details summary').first()).toHaveText('Primary · 0 / 0');
  await expect(page.locator('.address-path-details summary').last()).toHaveText(
    'Subaddress · 0 / 19',
  );
  await page.locator('#monero-recovery-details > summary').click();
  const words = page.locator('#monero-mnemonic-grid .word-value');
  await expect(words).toHaveCount(25);
  await expect(words.first()).toHaveText('••••••');
  await page.locator('#toggle-monero-phrase').click();
  await expect(words).toHaveText(moneroFixture.recovery.mnemonic.split(' '));
  for (const width of [320, 390, 900, 1081, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
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
  await page.locator('#monero-recovery-details > summary').click();
  await expect(words.first()).toHaveText('••••••');
  await page.locator('#monero-recovery-details > summary').click();
  await page.locator('#toggle-monero-phrase').click();
  await page.locator('#tab-btc').click();
  await expect(words.first()).toHaveText('••••••');
  await expect(page.locator('#monero-recovery-panel')).toBeHidden();
  await page.locator('#reset-button').click();
  await expect(words).toHaveCount(0);
});

test('default V2 reports real stages and retains explicit V1 recovery', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.locator('#profile-select')).toHaveValue('brainbip-v2');
  await page.evaluate(() => {
    window.testStages = [];
    const progress = document.getElementById('progress-state');
    new MutationObserver(() => {
      const stage = progress.dataset.stage;
      if (stage && window.testStages.at(-1) !== stage) window.testStages.push(stage);
    }).observe(progress, { attributes: true, attributeFilter: ['data-stage'] });
  });
  await page.locator('#passphrase').fill(v2Fixture.passphrase);
  await page.locator('#email').fill(v2Fixture.email);
  await page.locator('#generate-button').click();
  await expect(page.locator('#progress-state')).toHaveAttribute('data-stage', 'argon2id');
  await expect(page.locator('#progress-state')).toContainText('512 MiB');
  await expect(page.locator('#progress-elapsed')).not.toHaveText('00:00');
  await page
    .locator('#output-panel')
    .screenshot({ path: testInfo.outputPath('desktop-memory-progress.png') });
  await expect(page.locator('#progress-state')).toHaveAttribute('data-stage', 'pbkdf2', {
    timeout: 45_000,
  });
  await expect(page.locator('[data-stage="argon2id"] .stage-status')).toHaveText('Complete');
  await page
    .locator('#output-panel')
    .screenshot({ path: testInfo.outputPath('desktop-cpu-progress.png') });
  await expect(page.locator('#result-state')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#profile-tag')).toHaveText('V2');
  await expect(page.locator('#result-profile')).toHaveText('brainbip-v2');
  await testInfo.attach('v2-browser-timing', {
    body: await page.locator('#result-timing').textContent(),
    contentType: 'text/plain',
  });
  await page.locator('#toggle-phrase').click();
  await expect(page.locator('#mnemonic-grid .word-value')).toHaveText(
    v2Fixture.mnemonic.split(' '),
  );
  const stages = await page.evaluate(() => window.testStages);
  expect(stages.filter((stage) => ['argon2id', 'pbkdf2', 'addresses'].includes(stage))).toEqual([
    'argon2id',
    'pbkdf2',
    'addresses',
  ]);
  await page.locator('#profile-select').selectOption('brainbip-v1');
  await expect(page.locator('#result-state')).toBeHidden();
  await expect(page.locator('#mnemonic-grid li')).toHaveCount(0);
  await page.locator('#reset-button').click();
  await expect(page.locator('#profile-select')).toHaveValue('brainbip-v2');
});

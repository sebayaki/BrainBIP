import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

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
const htmlPath = fileURLToPath(new URL('../../dist/brainbip.html', import.meta.url));

async function enterFixture(page) {
  await page.locator('#passphrase').fill(fixture.passphrase);
  await page.locator('#email').fill(fixture.email);
}

async function generate(page) {
  await page.locator('#generate-button').click();
  await expect(page.locator('#result-state')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#mnemonic-grid li')).toHaveCount(12);
}

async function assertAllAddresses(page, expected = fixture) {
  await expect(page.locator('#chain-tabs button')).toHaveText([
    'Bitcoin',
    'Ethereum',
    'Solana',
    'Zcash',
  ]);
  await expect(page.locator('#chain-tabs svg[aria-hidden="true"]')).toHaveCount(4);
  for (const chain of ['btc', 'eth', 'sol', 'zec']) {
    const rows = expected.addresses[chain];
    await page.locator(`#tab-${chain}`).click();
    await expect(page.locator('#address-list tr')).toHaveCount(20);
    await expect(page.locator('.address-text')).toHaveText(rows.map((entry) => entry.address));
    await expect(page.locator('.address-path')).toHaveCount(0);
    await expect(page.locator('#address-list details')).toHaveCount(0);
  }
}

async function installStrengthModelFixture(page) {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.testStrengthMode = 'ready';
    window.testStrengthJobs = 0;
    window.testWorkerCreations = 0;
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        this.testStopped = false;
        window.testWorkerCreations += 1;
      }
      terminate() {
        this.testStopped = true;
        return super.terminate();
      }
      postMessage(data, ...rest) {
        if (!Object.hasOwn(data, 'privateEmail')) return super.postMessage(data, ...rest);
        window.testStrengthJobs += 1;
        const mode = window.testStrengthMode;
        const emailBits = data.privateEmail && data.email.trim().length > 0 ? 8 : 0;
        const response =
          mode === 'error'
            ? { id: data.id, type: 'error', message: 'Public test error' }
            : {
                id: data.id,
                type: 'strength',
                result: {
                  passphraseBits: 13.9,
                  emailBits,
                  combinedBits: 13.9 + emailBits,
                  score: 0,
                  label: 'Public model fixture',
                  limited: mode === 'limited',
                  feedback: ['Public test model; not measured entropy.'],
                  emailAssumption: 'Assumes the email is private and independent.',
                },
              };
        queueMicrotask(() => {
          if (!this.testStopped) this.onmessage?.({ data: response });
        });
      }
    };
  });
}

test('guessing-time rates move the cached model marker without starting another worker', async ({
  page,
}, testInfo) => {
  await installStrengthModelFixture(page);
  await page.goto('/');
  await expect(page.locator('#strength-box')).toHaveAttribute('data-state', 'empty');
  await expect(page.locator('#strength-time')).toHaveText(/^(?:—|--)$/);
  await expect(page.locator('#strength-marker')).toBeHidden();
  expect(await page.locator('#strength-options').evaluate((element) => element.open)).toBe(false);
  await expect(page.locator('#guess-rate')).toHaveValue('1');
  await page.locator('#passphrase').fill('PUBLIC TIME MODEL FIXTURE ONLY');
  await expect(page.locator('#strength-box')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#strength-label')).toHaveText('Model estimate');
  await expect(page.locator('#strength-time')).toHaveText('~4 hours');
  await expect(page.locator('#strength-marker')).toBeVisible();
  await expect(page.locator('#guess-time-chart')).toHaveAttribute('role', 'img');
  await expect(page.locator('#guess-time-chart')).toHaveAttribute('aria-label', /~4 hours.*total/i);
  await expect(page.locator('#strength-bits')).toHaveText('13.9');
  const position = () =>
    page.locator('#strength-marker').evaluate((element) => parseFloat(element.style.left));
  const initial = await position();
  expect(initial).toBeGreaterThan(0);
  expect(initial).toBeLessThan(100);
  const jobs = await page.evaluate(() => [window.testStrengthJobs, window.testWorkerCreations]);
  await page.locator('#strength-options > summary').click();
  await expect(page.locator('#strength-bits')).toBeVisible();
  await expect(page.locator('#strength-guesses')).not.toHaveText('—');
  await page.locator('#guess-rate').selectOption('0.1');
  await expect(page.locator('#strength-time')).toHaveText('~2 days');
  await expect(page.locator('#strength-assumption')).toContainText('1 / 10 sec');
  await expect(page.locator('#strength-assumption')).toContainText('total');
  const slower = await position();
  expect(slower).toBeGreaterThan(initial);
  await page.locator('#guess-rate').selectOption('1000');
  await expect(page.locator('#strength-time')).toHaveText('~15 seconds');
  await expect(page.locator('#strength-assumption')).toHaveText(/total.*1,?000/i);
  expect(await position()).toBeLessThan(initial);
  await expect(page.locator('#strength-bits')).toHaveText('13.9');
  await page.waitForTimeout(350); // Catch a mistakenly scheduled estimator debounce.
  expect(await page.evaluate(() => [window.testStrengthJobs, window.testWorkerCreations])).toEqual(
    jobs,
  );
  await page
    .locator('#strength-box')
    .screenshot({ path: testInfo.outputPath('desktop-guess-time.png') });
  await page.locator('#passphrase').fill('CHANGED PUBLIC TIME MODEL FIXTURE');
  await expect(page.locator('#strength-box')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#guess-rate')).toHaveValue('1000');
  await expect(page.locator('#strength-time')).toHaveText('~15 seconds');
  await page.locator('#reset-button').click();
  await expect(page.locator('#guess-rate')).toHaveValue('1');
  await expect(page.locator('#strength-box')).toHaveAttribute('data-state', 'empty');
  await expect(page.locator('#strength-marker')).toBeHidden();
  await expect(page.locator('#strength-time')).toHaveText(/^(?:—|--)$/);
  expect(await page.locator('#strength-options').evaluate((element) => element.open)).toBe(false);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});

test('private-email credit stays disclosed outside estimate details and clears with the input', async ({
  page,
}) => {
  await installStrengthModelFixture(page);
  await page.goto('/');
  await page.locator('#passphrase').fill('PUBLIC TIME MODEL FIXTURE ONLY');
  await page.locator('#email').fill('public.mock@example.invalid');
  await expect(page.locator('#strength-box')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#strength-private-note')).toBeHidden();
  await page.locator('#private-email').click();
  await expect(page.locator('#strength-private-note')).toBeVisible();
  await expect(page.locator('#strength-private-note')).toContainText(
    'assumed private, independent email',
  );
  expect(await page.locator('#strength-options').evaluate((element) => element.open)).toBe(false);
  expect(
    await page
      .locator('#strength-private-note')
      .evaluate((element) => element.closest('details') === null),
  ).toBe(true);
  await page.locator('#strength-options > summary').click();
  await expect(page.locator('#strength-bits')).toHaveText('21.9');
  await expect(page.locator('#strength-base-estimate')).toBeVisible();
  await expect(page.locator('#strength-base-estimate')).toContainText('~4 hours');
  await page.locator('#strength-options > summary').click();
  await expect(page.locator('#strength-base-estimate')).toBeHidden();
  await expect(page.locator('#strength-private-note')).toBeVisible();
  await page.locator('#email').fill('');
  await expect(page.locator('#strength-box')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#strength-private-note')).toBeHidden();
  await expect(page.locator('#strength-time')).toHaveText('~4 hours');
  await page.locator('#email').fill('public.mock@example.invalid');
  await expect(page.locator('#strength-private-note')).toBeVisible();
  await page.locator('#reset-button').click();
  await expect(page.locator('#private-email')).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('#strength-private-note')).toBeHidden();
});

test('limited and unavailable estimates hide the time marker while retaining honest model details', async ({
  page,
}) => {
  await installStrengthModelFixture(page);
  await page.goto('/');
  await page.locator('#passphrase').fill('PUBLIC READY MODEL FIXTURE');
  await expect(page.locator('#strength-marker')).toBeVisible();
  await page.evaluate(() => {
    window.testStrengthMode = 'limited';
  });
  await page.locator('#passphrase').fill('PUBLIC LIMITED MODEL FIXTURE');
  await expect(page.locator('#strength-box')).toHaveAttribute('data-state', 'estimating');
  await expect(page.locator('#strength-marker')).toBeHidden();
  await expect(page.locator('#strength-box')).toHaveAttribute('data-state', 'limited');
  await expect(page.locator('#strength-time')).toHaveText('Limited estimate');
  await expect(page.locator('#strength-marker')).toBeHidden();
  await expect(page.locator('#strength-caveat')).toBeVisible();
  await expect(page.locator('#strength-caveat')).toContainText('Time hidden');
  await expect(page.locator('#guess-time-chart')).toHaveAttribute(
    'aria-label',
    /No guessing time/i,
  );
  await page.locator('#strength-options > summary').click();
  await expect(page.locator('#strength-bits')).toHaveText('13.9');
  await expect(page.locator('#strength-guesses')).not.toHaveText('—');
  await expect(page.locator('#strength-detail')).toContainText('limited estimate');
  const jobs = await page.evaluate(() => window.testStrengthJobs);
  await page.locator('#guess-rate').selectOption('1000');
  await expect(page.locator('#strength-time')).toHaveText('Limited estimate');
  await expect(page.locator('#strength-marker')).toBeHidden();
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => window.testStrengthJobs)).toBe(jobs);
  await page.evaluate(() => {
    window.testStrengthMode = 'error';
  });
  await page.locator('#passphrase').fill('PUBLIC UNAVAILABLE MODEL FIXTURE');
  await expect(page.locator('#strength-box')).toHaveAttribute('data-state', 'error');
  await expect(page.locator('#strength-label')).toHaveText('Estimate unavailable');
  await expect(page.locator('#strength-marker')).toBeHidden();
  await expect(page.locator('#strength-time')).toHaveText(/^(?:—|--)$/);
  await expect(page.locator('#strength-bits')).toHaveText('—');
  await page.locator('#reset-button').click();
  await expect(page.locator('#strength-label')).toHaveText('Awaiting input');
});

test('full-name chain tabs stay reachable by keyboard without moving the page vertically', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  await enterFixture(page);
  await generate(page);
  await page.locator('#chain-tabs').scrollIntoViewIfNeeded();
  await page.locator('#tab-btc').focus();
  const before = await page.evaluate(() => window.scrollY);
  await page.locator('#tab-btc').press('End');
  await expect(page.getByRole('tab', { name: 'Zcash', exact: true })).toBeFocused();
  await expect(page.locator('#tab-zec')).toHaveAttribute('aria-selected', 'true');
  await expect
    .poll(() => page.locator('#chain-tabs').evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - before)).toBeLessThanOrEqual(1);
  const fits = await page.locator('#tab-zec').evaluate((tab) => {
    const viewport = tab.parentElement.getBoundingClientRect();
    const bounds = tab.getBoundingClientRect();
    return bounds.left >= viewport.left && bounds.right <= viewport.right;
  });
  expect(fits).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('mobile-chain-tabs.png') });
  await page.locator('#tab-zec').press('Home');
  await expect(page.getByRole('tab', { name: 'Bitcoin', exact: true })).toBeFocused();
  await expect
    .poll(() => page.locator('#chain-tabs').evaluate((element) => element.scrollLeft))
    .toBeLessThanOrEqual(4);
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - before)).toBeLessThanOrEqual(1);
  for (const width of [390, 600, 880, 1080, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    for (const tab of await page.locator('#chain-tabs button').all()) {
      expect(await tab.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
      expect((await tab.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
  }
});

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
    window.testRateWorkerJobs = { strength: 0, wallet: 0 };
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      postMessage(data, ...rest) {
        if (Object.hasOwn(data, 'privateEmail')) window.testRateWorkerJobs.strength += 1;
        else if (Object.hasOwn(data, 'passphrase')) window.testRateWorkerJobs.wallet += 1;
        return super.postMessage(data, ...rest);
      }
    };
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
  const jobsBeforeRate = await page.evaluate(() => window.testRateWorkerJobs);
  await page.locator('#strength-options > summary').click();
  await page.locator('#guess-rate').selectOption('1000');
  await expect(page.locator('#strength-assumption')).toHaveText(/total.*1,?000/i);
  await expect(page.locator('#result-state')).toBeVisible();
  await expect(page.locator('#mnemonic-grid .word-value')).toHaveText(fixture.mnemonic.split(' '));
  await expect(page.locator('.address-text')).toHaveText(
    fixture.addresses.zec.map((row) => row.address),
  );
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => window.testRateWorkerJobs)).toEqual(jobsBeforeRate);
  expect(jobsBeforeRate.wallet).toBe(1);
  await page.locator('#strength-options > summary').click();
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

test('the fixed derivation reports real stages and clears results on reset', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.locator('#profile-select')).toHaveCount(0);
  await page.evaluate(() => {
    window.testStages = [];
    const progress = document.getElementById('progress-state');
    new MutationObserver(() => {
      const stage = progress.dataset.stage;
      if (stage && window.testStages.at(-1) !== stage) window.testStages.push(stage);
    }).observe(progress, { attributes: true, attributeFilter: ['data-stage'] });
  });
  await page.locator('#passphrase').fill(fixture.passphrase);
  await page.locator('#email').fill(fixture.email);
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
  await expect(page.locator('#profile-tag')).toHaveCount(0);
  await expect(page.locator('#result-profile')).toHaveCount(0);
  await testInfo.attach('v2-browser-timing', {
    body: await page.locator('#result-timing').textContent(),
    contentType: 'text/plain',
  });
  await page.locator('#toggle-phrase').click();
  await expect(page.locator('#mnemonic-grid .word-value')).toHaveText(fixture.mnemonic.split(' '));
  const stages = await page.evaluate(() => window.testStages);
  expect(stages.filter((stage) => ['argon2id', 'pbkdf2', 'addresses'].includes(stage))).toEqual([
    'argon2id',
    'pbkdf2',
    'addresses',
  ]);
  await page.locator('#reset-button').click();
  await expect(page.locator('#result-state')).toBeHidden();
  await expect(page.locator('#mnemonic-grid li')).toHaveCount(0);
});

test('path presets and custom paths update addresses without deriving new recovery words', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.testWalletJobs = 0;
    window.Worker = class extends NativeWorker {
      postMessage(data, ...rest) {
        if ('passphrase' in data && !('privateEmail' in data)) window.testWalletJobs += 1;
        return super.postMessage(data, ...rest);
      }
    };
  });
  await page.goto('/');
  await enterFixture(page);
  await generate(page);
  await page.locator('#toggle-phrase').click();
  expect(pathFixture.mnemonic).toBe(fixture.mnemonic);
  for (const vector of pathFixture.vectors) {
    await page.locator('#tab-' + vector.chain).click();
    await page.locator('#derivation-select').selectOption(vector.selection.presetId);
    if (vector.selection.presetId === 'custom') {
      await page.locator('#custom-path').fill(vector.selection.customPath);
      if (vector.chain === 'btc')
        await page.locator('#address-type').selectOption(vector.selection.addressType);
      if (vector.chain === 'eth') await page.locator('#custom-path').press('Enter');
      else await page.locator('#apply-path').click();
    }
    await expect(page.locator('#address-panel')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('#address-list tr')).toHaveCount(20);
    for (const row of vector.rows) {
      await expect(page.locator('.address-text').nth(row.index)).toHaveText(row.address);
    }
    await expect(page.locator('.address-path')).toHaveCount(0);
    await expect(page.locator('#derivation-value')).toHaveText(
      await page.locator('#derivation-select option:checked').textContent(),
    );
    await expect(page.locator('#address-list details')).toHaveCount(0);
    await expect(page.locator('#mnemonic-grid .word-value')).toHaveText(
      fixture.mnemonic.split(' '),
    );
  }
  await page.locator('#tab-eth').click();
  await page.locator('#derivation-select').selectOption('custom');
  await page.locator('#custom-path').fill("m/44'/60'/2147483648/0/{index}");
  await expect(page.locator('#address-list tr')).toHaveCount(0);
  await page.locator('#apply-path').click();
  await expect(page.locator('#address-error')).toBeVisible();
  await expect(page.locator('#address-list tr')).toHaveCount(0);
  await expect(page.locator('#mnemonic-grid .word-value')).toHaveText(fixture.mnemonic.split(' '));
  await page.locator('#derivation-select').selectOption('ledger-live');
  await expect(page.locator('#address-list tr')).toHaveCount(20);
  await expect(page.locator('#address-error')).toBeHidden();
  await page.locator('#tab-btc').click();
  await page.locator('#tab-eth').click();
  await expect(page.locator('#derivation-select')).toHaveValue('ledger-live');
  await expect(page.locator('.address-text').nth(1)).toHaveText(
    pathFixture.vectors.find(
      (vector) => vector.chain === 'eth' && vector.selection.presetId === 'ledger-live',
    ).rows[1].address,
  );
  expect(await page.evaluate(() => window.testWalletJobs)).toBe(1);
  await page
    .locator('#address-panel')
    .screenshot({ path: testInfo.outputPath('desktop-address-paths.png') });
  await page.locator('#reset-button').click();
  await expect(page.locator('#address-list tr')).toHaveCount(0);
  await expect(page.locator('#custom-path')).toHaveValue('');
});

test('superseded, word-count-switched, and reset jobs cannot restore stale addresses', async ({
  page,
}) => {
  await page.addInitScript((rows) => {
    const NativeWorker = window.Worker;
    window.testAddressReplies = [];
    window.Worker = class extends NativeWorker {
      postMessage(data, ...rest) {
        if (data.mnemonic && data.chain) {
          const callback = this.onmessage;
          window.testAddressReplies.push(() =>
            callback({ data: { id: data.id, type: 'result', rows } }),
          );
          return;
        }
        return super.postMessage(data, ...rest);
      }
    };
  }, fixture.addresses.eth);
  await page.goto('/');
  await enterFixture(page);
  await generate(page);
  await page.locator('#tab-eth').click();
  await page.locator('#derivation-select').selectOption('ledger-live');
  await expect(page.locator('#address-panel')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#address-list tr')).toHaveCount(0);
  await page.locator('#derivation-select').selectOption('ledger-legacy');
  await expect.poll(() => page.evaluate(() => window.testAddressReplies.length)).toBe(2);
  await page.evaluate(() => window.testAddressReplies[0]());
  await expect(page.locator('#address-panel')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#address-list tr')).toHaveCount(0);
  await page.locator('#word-count-24').click();
  await page.evaluate(() => window.testAddressReplies[1]());
  await expect(page.locator('.address-text')).toHaveText(
    fixture24.addresses.eth.map((row) => row.address),
  );
  await expect(page.locator('#mnemonic-grid li')).toHaveCount(24);
  await page.locator('#derivation-select').selectOption('ledger-live');
  await expect.poll(() => page.evaluate(() => window.testAddressReplies.length)).toBe(3);
  await page.locator('#reset-button').click();
  await page.evaluate(() => window.testAddressReplies[2]());
  await expect(page.locator('#result-state')).toBeHidden();
  await expect(page.locator('#address-list tr')).toHaveCount(0);
  await expect(page.locator('#mnemonic-grid li')).toHaveCount(0);
  await expect(page.locator('#address-panel')).toHaveAttribute('aria-busy', 'false');
});

test('word-count selection switches complete wallets without repeating the KDF', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.testWalletJobs = 0;
    window.testCopies = [];
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async (value) => window.testCopies.push(value) },
      configurable: true,
    });
    window.Worker = class extends NativeWorker {
      postMessage(data, ...rest) {
        if ('passphrase' in data && !('privateEmail' in data)) window.testWalletJobs += 1;
        return super.postMessage(data, ...rest);
      }
    };
  });
  await page.goto('/');
  await expect(page.locator('#word-count-12')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#word-count-24').click();
  await enterFixture(page);
  await expect(page.locator('#word-count-24')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#generate-button').click();
  await expect(page.locator('#result-state')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#mnemonic-grid li')).toHaveCount(24);
  await expect(page.locator('#mnemonic-grid .word-value').first()).toHaveText('••••••');
  await page.locator('#toggle-phrase').click();
  await expect(page.locator('#mnemonic-grid .word-value')).toHaveText(
    fixture24.mnemonic.split(' '),
  );
  await assertAllAddresses(page, fixture24);
  await page.locator('#copy-phrase').click();
  await page.locator('.copy-address').first().click();
  await expect
    .poll(() => page.evaluate(() => window.testCopies))
    .toEqual([fixture24.mnemonic, fixture24.addresses.zec[0].address]);
  const estimatedBits = await page.locator('#strength-bits').textContent();
  await page.locator('#word-count-12').click();
  await expect(page.locator('#mnemonic-grid li')).toHaveCount(12);
  await expect(page.locator('#mnemonic-grid .word-value').first()).toHaveText('••••••');
  await page.locator('#toggle-phrase').click();
  await expect(page.locator('#mnemonic-grid .word-value')).toHaveText(fixture.mnemonic.split(' '));
  await assertAllAddresses(page);
  await page.locator('#tab-eth').click();
  await page.locator('#derivation-select').selectOption('ledger-live');
  await expect(page.locator('#address-panel')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.address-text').nth(1)).toHaveText(
    pathFixture.vectors.find(
      (vector) => vector.chain === 'eth' && vector.selection.presetId === 'ledger-live',
    ).rows[1].address,
  );
  await page.locator('#word-count-24').click();
  await expect(page.locator('#derivation-select')).toHaveValue('standard');
  await expect(page.locator('#tab-eth')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.address-text')).toHaveText(
    fixture24.addresses.eth.map((row) => row.address),
  );
  await expect(page.locator('#strength-bits')).toHaveText(estimatedBits);
  expect(await page.evaluate(() => window.testWalletJobs)).toBe(1);
  await page.locator('#toggle-phrase').click();
  await page
    .locator('#output-panel')
    .screenshot({ path: testInfo.outputPath('desktop-24-words.png') });
  await page.locator('#reset-button').click();
  await expect(page.locator('#word-count-12')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#mnemonic-grid li')).toHaveCount(0);
  await expect(page.locator('#address-list tr')).toHaveCount(0);
});

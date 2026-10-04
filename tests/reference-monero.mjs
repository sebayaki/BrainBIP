// Optional independent native verification; not a production dependency.
// Install monero-ts@0.11.3 in a scratch directory, then run:
// node tests/reference-monero.mjs <scratch-directory>
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

if (!process.argv[2]) throw new Error('Supply the scratch directory containing monero-ts@0.11.3.');
const referenceRoot = resolve(process.argv[2], 'node_modules/monero-ts');
const packageInfo = JSON.parse(await readFile(resolve(referenceRoot, 'package.json'), 'utf8'));
assert.equal(packageInfo.version, '0.11.3');
const loader = await readFile(resolve(referenceRoot, 'dist/monero.js'));
const compressed = loader.toString('utf8').match(/data:application\/octet-stream;base64,([A-Za-z0-9+/=]+)/)?.[1];
assert.ok(compressed, 'Embedded native WASM must be present.');
const nativeWasm = gunzipSync(Buffer.from(compressed, 'base64'));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
assert.equal(sha256(loader), '9d291ef13ad81fe39d7767330b2ba08eeee4812d599a0239186789fbab0463e5');
assert.equal(sha256(nativeWasm), '3cfa3c66d6f7c9a8a2b0870d193c21fb83f587c1de8139c37213e1f09db04adc');
assert.equal(nativeWasm.subarray(0, 4).toString('hex'), '0061736d');
const monero = (await import(pathToFileURL(resolve(referenceRoot, 'dist/index.js')).href)).default;
// These are normally supplied by monero-ts's worker wrapper. Run locally;
// HTTP transport rejects before I/O, and no daemon/synchronization is used.
let rejectedRequests = 0;
globalThis.HttpClient = { request: async () => {
  rejectedRequests += 1;
  throw new Error('Native reference HTTP transport is disabled.');
} };
globalThis.LibraryUtils = monero.LibraryUtils;
globalThis.GenUtils = monero.GenUtils;

const fixture = JSON.parse(await readFile(new URL('./fixtures/monero-ledger-v1.json', import.meta.url), 'utf8'));
for (const vector of fixture.vectors) {
  const wallet = await monero.createWalletFull({
    networkType: monero.MoneroNetworkType.MAINNET,
    seed: vector.recovery.mnemonic,
    restoreHeight: 0,
    proxyToWorker: false,
  });
  try {
    assert.equal(await wallet.getSeed(), vector.recovery.mnemonic, `Native 25-word recovery: ${vector.id}`);
    assert.equal(await wallet.getPrimaryAddress(), vector.addresses[0].address, `Native primary address: ${vector.id}`);
    for (let index = 1; index < 20; index += 1) {
      await wallet.createSubaddress(0);
      assert.equal(await wallet.getAddress(0, index), vector.addresses[index].address, `Native subaddress ${index}: ${vector.id}`);
    }
    console.log(`${vector.id}: native 25-word restoration and all 20 addresses matched.`);
  } finally {
    await wallet.close(false);
  }
}
console.log(`Verified monero-ts@0.11.3 and native WASM hashes. HTTP calls were rejected locally (${rejectedRequests}).`);

import { deriveWallet, safeErrorMessage } from './crypto.js';

let started = false;
self.onmessage = async ({ data }) => {
  const id = data?.id;
  if (started) {
    self.postMessage({ id, type: 'error', message: 'This worker is already processing a wallet.' });
    return;
  }
  started = true;
  try {
    // Both word counts share this one KDF job and are returned together.
    const result = await deriveWallet(data?.passphrase, data?.email ?? '', (stage) =>
      self.postMessage({ id, type: 'stage', stage }),
    );
    self.postMessage({ id, type: 'result', result });
  } catch (error) {
    self.postMessage({ id, type: 'error', message: safeErrorMessage(error) });
  } finally {
    // A new derivation uses a fresh worker. The main thread terminates this
    // worker when cancelling; no second request can reuse its WASM state.
    self.close();
  }
};

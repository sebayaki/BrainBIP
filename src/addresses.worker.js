import { deriveChainAddresses, safeAddressErrorMessage } from './crypto.js';

let started = false;
self.onmessage = ({ data }) => {
  const id = data?.id;
  if (started) {
    self.postMessage({ id, type: 'error', message: 'This worker is already deriving addresses.' });
    return;
  }
  started = true;
  try {
    const rows = deriveChainAddresses(data?.mnemonic, data?.chain, data?.selection);
    self.postMessage({ id, type: 'result', rows });
  } catch (error) {
    self.postMessage({ id, type: 'error', message: safeAddressErrorMessage(error) });
  } finally {
    self.close();
  }
};

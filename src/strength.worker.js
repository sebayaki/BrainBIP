import { estimateStrength } from './strength.js';

export function handleStrengthMessage(data, postMessage) {
  const id =
    typeof data?.id === 'number' && Number.isSafeInteger(data.id)
      ? data.id
      : typeof data?.id === 'string' && data.id.length <= 64
        ? data.id
        : null;
  try {
    const result = estimateStrength(
      data?.passphrase,
      data?.email ?? '',
      data?.privateEmail === true,
    );
    postMessage({ id, type: 'strength', result });
  } catch {
    // Do not forward library exception messages, which may contain input data.
    postMessage({ id, type: 'error', message: 'Strength estimate unavailable.' });
  }
}

if (typeof self !== 'undefined') {
  self.onmessage = ({ data }) =>
    handleStrengthMessage(data, (message) => self.postMessage(message));
}

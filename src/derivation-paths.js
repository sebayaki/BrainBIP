import { PROFILE } from './profiles.js';

export const DERIVATION_ERROR_MESSAGES = Object.freeze({
  chain: 'Choose a supported chain.',
  preset: 'Choose a supported derivation preset.',
  path: 'Enter a valid derivation path with exactly one {index} placeholder.',
  hardened: 'Solana derivation paths must use hardened components.',
  addressType: 'Choose a supported Bitcoin address type.',
  options: 'Derivation options must match the selected preset.',
});

const presets = Object.freeze({
  btc: Object.freeze([
    Object.freeze({
      id: 'standard',
      label: 'Native SegWit (BIP84)',
      path: PROFILE.paths.btc,
      addressType: 'native',
    }),
    Object.freeze({
      id: 'nested-segwit',
      label: 'Nested SegWit (BIP49)',
      path: "m/49'/0'/0'/0/{index}",
      addressType: 'nested',
    }),
    Object.freeze({
      id: 'legacy',
      label: 'Legacy (BIP44)',
      path: "m/44'/0'/0'/0/{index}",
      addressType: 'legacy',
    }),
  ]),
  eth: Object.freeze([
    Object.freeze({ id: 'standard', label: 'Standard', path: PROFILE.paths.eth }),
    Object.freeze({
      id: 'ledger-legacy',
      label: 'Ledger legacy',
      path: "m/44'/60'/0'/{index}",
    }),
    Object.freeze({
      id: 'ledger-live',
      label: 'Ledger Live',
      path: "m/44'/60'/{index}'/0/0",
    }),
  ]),
  sol: Object.freeze([
    Object.freeze({ id: 'standard', label: 'BIP44 with change', path: PROFILE.paths.sol }),
    Object.freeze({ id: 'bip44', label: 'BIP44', path: "m/44'/501'/{index}'" }),
  ]),
  zec: Object.freeze([
    Object.freeze({ id: 'standard', label: 'Transparent (BIP44)', path: PROFILE.paths.zec }),
  ]),
});
const addressTypes = Object.freeze(['native', 'nested', 'legacy']);
const selectionKeys = new Set(['presetId', 'customPath', 'addressType']);

export function getDerivationPresets(chain) {
  if (typeof chain !== 'string' || !Object.hasOwn(presets, chain)) {
    throw new Error(DERIVATION_ERROR_MESSAGES.chain);
  }
  return presets[chain];
}

function validateCustomPath(chain, path) {
  if (typeof path !== 'string' || path.length > 160 || !path.startsWith('m/')) {
    throw new Error(DERIVATION_ERROR_MESSAGES.path);
  }
  const components = path.slice(2).split('/');
  if (
    components.length > 10 ||
    components.filter((component) => component === '{index}' || component === "{index}'").length !==
      1 ||
    components.some((component) => {
      const match = /^(?:0|[1-9]\d*|\{index\})'?$/u.exec(component);
      // JavaScript's $ also matches before a final line terminator.
      if (match?.[0] !== component) return true;
      if (component === '{index}' || component === "{index}'") return false;
      return Number.parseInt(component, 10) > 0x7fffffff;
    })
  ) {
    throw new Error(DERIVATION_ERROR_MESSAGES.path);
  }
  if (chain === 'sol' && components.some((component) => !component.endsWith("'"))) {
    throw new Error(DERIVATION_ERROR_MESSAGES.hardened);
  }
  return path;
}

export function resolveDerivation(chain, selection = { presetId: 'standard' }) {
  const available = getDerivationPresets(chain);
  if (
    selection === null ||
    typeof selection !== 'object' ||
    Array.isArray(selection) ||
    typeof selection.presetId !== 'string'
  ) {
    throw new Error(DERIVATION_ERROR_MESSAGES.preset);
  }
  if (Object.keys(selection).some((key) => !selectionKeys.has(key))) {
    throw new Error(DERIVATION_ERROR_MESSAGES.options);
  }
  if (selection.presetId === 'custom') {
    const path = validateCustomPath(chain, selection.customPath);
    if (chain === 'btc') {
      if (!addressTypes.includes(selection.addressType)) {
        throw new Error(DERIVATION_ERROR_MESSAGES.addressType);
      }
      return Object.freeze({ path, addressType: selection.addressType });
    }
    if (selection.addressType !== undefined) {
      throw new Error(DERIVATION_ERROR_MESSAGES.options);
    }
    return Object.freeze({ path });
  }
  const preset = available.find(({ id }) => id === selection.presetId);
  if (!preset) throw new Error(DERIVATION_ERROR_MESSAGES.preset);
  if (
    selection.customPath !== undefined ||
    (selection.addressType !== undefined && selection.addressType !== preset.addressType)
  ) {
    throw new Error(DERIVATION_ERROR_MESSAGES.options);
  }
  return Object.freeze(
    preset.addressType
      ? { path: preset.path, addressType: preset.addressType }
      : { path: preset.path },
  );
}

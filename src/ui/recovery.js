import { createWorkerOwner } from '../worker-task.js';
import {
  DERIVATION_ERROR_MESSAGES,
  getDerivationPresets,
  resolveDerivation,
} from '../derivation-paths.js';

const chainDetails = {
  btc: 'Bitcoin · Receiving addresses',
  eth: 'Ethereum · Receiving accounts',
  sol: 'Solana · Ed25519 receiving accounts',
  zec: 'Zcash · Transparent P2PKH addresses · no shielded privacy',
};
const validationMessages = new Set(Object.values(DERIVATION_ERROR_MESSAGES));
const addressFailure = 'Address derivation could not finish. Try applying the path again.';

function safeAddressError(error) {
  return validationMessages.has(error?.message) ? error.message : addressFailure;
}

function defaultChoices(result) {
  return Object.fromEntries(
    Object.keys(chainDetails).map((chain) => {
      const standard = resolveDerivation(chain);
      return [
        chain,
        {
          presetId: 'standard',
          customPath: standard.path,
          addressType: standard.addressType || 'native',
          dirty: false,
          rows: result?.addresses[chain] || null,
        },
      ];
    }),
  );
}

function renderWordGrid(grid, mnemonic, visible, visibleLabel, hiddenLabel) {
  grid.replaceChildren();
  grid.dataset.visible = String(visible);
  if (!mnemonic) return;
  grid.setAttribute('aria-label', visible ? visibleLabel : hiddenLabel);
  for (const [index, word] of mnemonic.split(' ').entries()) {
    const card = document.createElement('li');
    const number = document.createElement('span');
    number.className = 'word-number';
    number.textContent = String(index + 1).padStart(2, '0');
    const value = document.createElement('span');
    value.className = 'word-value';
    value.textContent = visible ? word : '••••••';
    if (!visible) value.setAttribute('aria-hidden', 'true');
    card.append(number, value);
    grid.append(card);
  }
}

function setRevealButton(button, visible) {
  button.textContent = visible ? 'Hide' : 'Reveal';
  button.setAttribute('aria-pressed', String(visible));
}

function makeCopyIcon() {
  const namespace = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(namespace, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(namespace, 'path');
  path.setAttribute('d', 'M5.5 5.5H13V13H5.5z M10.5 5.5V3H3v7.5h2.5');
  svg.append(path);
  return svg;
}

function renderAddresses(list, chain, rows) {
  list.replaceChildren();
  rows.forEach((entry, position) => {
    const row = document.createElement('tr');
    const number = document.createElement('td');
    number.textContent = String(position + 1).padStart(2, '0');
    const data = document.createElement('td');
    const address = document.createElement('span');
    address.className = 'address-text';
    address.textContent = entry.address;
    const path = document.createElement('span');
    path.className = 'address-path';
    path.textContent = entry.path;
    data.append(address, path);
    const action = document.createElement('td');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy-address';
    button.setAttribute(
      'aria-label',
      `Copy ${chain.toUpperCase()} receiving address ${position + 1}`,
    );
    button.title = 'Copy address';
    button.dataset.position = String(position);
    button.append(makeCopyIcon());
    action.append(button);
    row.append(number, data, action);
    list.append(row);
  });
}

export function createRecoveryView({
  getElement: $,
  copyText,
  workerSource,
  nextJobId,
  onAddressChange,
}) {
  const addressWorker = createWorkerOwner(workerSource);
  let currentResult = null;
  let currentRows = [];
  let choices = defaultChoices();
  let phraseVisible = false;
  let activeChain = 'btc';
  let renderedChain = null;

  function renderMnemonic() {
    renderWordGrid(
      $('mnemonic-grid'),
      currentResult.mnemonic,
      phraseVisible,
      'Twelve recovery words',
      'Recovery phrase hidden',
    );
    setRevealButton($('toggle-phrase'), phraseVisible);
    $('phrase-visibility-note').textContent = phraseVisible
      ? 'Keep these words private. Anyone with them controls the wallet.'
      : 'Hidden from view. Reveal when you are ready.';
  }
  function revealTab(tab, instant = false) {
    const strip = $('chain-tabs');
    const stripBounds = strip.getBoundingClientRect();
    const tabBounds = tab.getBoundingClientRect();
    const leftEdge = stripBounds.left + strip.clientLeft + 4;
    const rightEdge = stripBounds.left + strip.clientLeft + strip.clientWidth - 4;
    let left = strip.scrollLeft;
    if (tabBounds.left < leftEdge) left += tabBounds.left - leftEdge;
    else if (tabBounds.right > rightEdge) left += tabBounds.right - rightEdge;
    if (!instant && Math.abs(left - strip.scrollLeft) < 1) return;
    strip.scrollTo({
      left: Math.max(0, left),
      behavior:
        instant || window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
    });
  }
  function clearAddressFeedback() {
    $('address-status').hidden = true;
    $('address-status').textContent = '';
    $('address-error').hidden = true;
    $('address-error').textContent = '';
    $('custom-path').removeAttribute('aria-invalid');
  }
  function setAddressBusy(busy) {
    $('address-panel').setAttribute('aria-busy', String(busy));
    $('apply-path').disabled = busy;
  }
  function setAddressStatus(message) {
    $('address-status').textContent = message;
    $('address-status').hidden = false;
  }
  function showAddressError(message) {
    setAddressBusy(false);
    $('address-status').hidden = true;
    $('address-status').textContent = '';
    $('address-error').textContent = message;
    $('address-error').hidden = false;
  }
  function invalidateRows() {
    addressWorker.stop();
    currentRows = [];
    $('address-list').replaceChildren();
    setAddressBusy(false);
    clearAddressFeedback();
    onAddressChange();
  }
  function selectionFor(chain, choice) {
    if (choice.presetId !== 'custom') return { presetId: choice.presetId };
    return {
      presetId: 'custom',
      customPath: choice.customPath,
      ...(chain === 'btc' ? { addressType: choice.addressType } : {}),
    };
  }
  function renderControls() {
    const choice = choices[activeChain];
    const select = $('derivation-select');
    select.replaceChildren();
    for (const preset of getDerivationPresets(activeChain)) {
      const group = document.createElement('optgroup');
      group.label = preset.label;
      const option = document.createElement('option');
      option.value = preset.id;
      option.textContent = preset.path.replace('{index}', 'i');
      group.append(option);
      select.append(group);
    }
    const group = document.createElement('optgroup');
    group.label = 'Custom path';
    const custom = document.createElement('option');
    custom.value = 'custom';
    custom.textContent =
      choice.presetId === 'custom' && !choice.dirty
        ? choice.customPath.replace('{index}', 'i')
        : 'Custom path…';
    group.append(custom);
    select.append(group);
    select.value = choice.presetId;
    $('custom-derivation').hidden = choice.presetId !== 'custom';
    $('custom-path').value = choice.customPath;
    $('address-type').value = choice.addressType;
    $('address-type-field').hidden = choice.presetId !== 'custom' || activeChain !== 'btc';
    $('custom-path-help').textContent =
      activeChain === 'sol'
        ? "Use exactly one {index}; every Solana component must end with an apostrophe (')."
        : 'Use exactly one {index} for the receiving address index.';
  }
  function showRows(rows) {
    currentRows = rows;
    setAddressBusy(false);
    clearAddressFeedback();
    renderAddresses($('address-list'), activeChain, rows);
  }
  function loadAddresses() {
    const chain = activeChain;
    const choice = choices[chain];
    if (!currentResult) return;
    if (choice.dirty) {
      setAddressStatus('Apply the path to generate addresses.');
      return;
    }
    const selection = selectionFor(chain, choice);
    try {
      resolveDerivation(chain, selection);
    } catch (error) {
      showAddressError(safeAddressError(error));
      return;
    }
    if (choice.rows) {
      showRows(choice.rows);
      return;
    }
    const result = currentResult;
    setAddressBusy(true);
    setAddressStatus('Deriving addresses on this device…');
    try {
      addressWorker.start(
        nextJobId(),
        { mnemonic: result.mnemonic, chain, selection },
        {
          onMessage(data) {
            if (currentResult !== result || activeChain !== chain || choices[chain] !== choice)
              return;
            if (data.type === 'result') {
              choice.rows = data.rows;
              addressWorker.stop();
              showRows(data.rows);
            } else if (data.type === 'error') {
              addressWorker.stop();
              showAddressError(safeAddressError(data));
            }
          },
          onError() {
            addressWorker.stop();
            showAddressError(addressFailure);
          },
        },
      );
    } catch {
      showAddressError('This browser could not start local address derivation.');
    }
  }
  function selectChain(chain, focus = false) {
    if (!currentResult || !Object.hasOwn(choices, chain)) return;
    const sameChain = renderedChain === chain;
    if (!sameChain) invalidateRows();
    activeChain = chain;
    for (const tab of $('chain-tabs').children) {
      const selected = tab.dataset.chain === chain;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected) {
        if (focus) tab.focus({ preventScroll: true });
        revealTab(tab);
      }
    }
    if (sameChain) return;
    renderedChain = chain;
    $('address-panel').setAttribute('aria-labelledby', `tab-${chain}`);
    $('chain-description').textContent = chainDetails[chain];
    renderControls();
    loadAddresses();
  }
  function clear() {
    addressWorker.stop();
    currentResult = null;
    currentRows = [];
    choices = defaultChoices();
    activeChain = 'btc';
    renderedChain = null;
    phraseVisible = false;
    $('mnemonic-grid').replaceChildren();
    $('address-list').replaceChildren();
    $('chain-description').textContent = '';
    $('result-state').hidden = true;
    $('result-timing').textContent = 'Derived locally';
    $('derivation-select').replaceChildren();
    $('custom-derivation').hidden = true;
    $('custom-path').value = '';
    $('address-type').value = 'native';
    setAddressBusy(false);
    clearAddressFeedback();
    setRevealButton($('toggle-phrase'), false);
    $('phrase-visibility-note').textContent = 'Hidden from view. Reveal when you are ready.';
  }
  function show(result, seconds) {
    addressWorker.stop();
    currentResult = result;
    currentRows = [];
    choices = defaultChoices(result);
    activeChain = 'btc';
    renderedChain = null;
    phraseVisible = false;
    $('progress-state').hidden = true;
    $('empty-state').hidden = true;
    $('result-state').hidden = false;
    $('result-timing').textContent = `Derived locally in ${seconds}s`;
    renderMnemonic();
    selectChain(activeChain);
  }

  $('toggle-phrase').addEventListener('click', () => {
    if (!currentResult) return;
    phraseVisible = !phraseVisible;
    renderMnemonic();
  });
  $('copy-phrase').addEventListener('click', () => {
    if (currentResult) copyText(currentResult.mnemonic, 'Recovery phrase');
  });
  $('derivation-select').addEventListener('change', () => {
    if (!currentResult) return;
    const choice = choices[activeChain];
    const presetId = $('derivation-select').value;
    invalidateRows();
    if (presetId === 'custom' && choice.presetId !== 'custom') {
      const previous = resolveDerivation(activeChain, { presetId: choice.presetId });
      choice.customPath = previous.path;
      choice.addressType = previous.addressType || 'native';
    }
    choice.presetId = presetId;
    choice.dirty = presetId === 'custom';
    choice.rows = presetId === 'standard' ? currentResult.addresses[activeChain] : null;
    renderControls();
    loadAddresses();
  });
  function editCustomPath() {
    if (!currentResult) return;
    const choice = choices[activeChain];
    invalidateRows();
    choice.customPath = $('custom-path').value;
    choice.addressType = $('address-type').value;
    choice.dirty = true;
    choice.rows = null;
    $('derivation-select').querySelector('option[value="custom"]').textContent = 'Custom path…';
    setAddressStatus('Apply the path to generate addresses.');
  }
  $('custom-path').addEventListener('input', editCustomPath);
  $('custom-path').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (!$('apply-path').disabled) $('apply-path').click();
  });
  $('address-type').addEventListener('change', editCustomPath);
  $('apply-path').addEventListener('click', () => {
    if (!currentResult) return;
    const choice = choices[activeChain];
    invalidateRows();
    choice.customPath = $('custom-path').value;
    choice.addressType = $('address-type').value;
    choice.rows = null;
    choice.dirty = true;
    try {
      resolveDerivation(activeChain, selectionFor(activeChain, choice));
    } catch (error) {
      $('custom-path').setAttribute('aria-invalid', 'true');
      showAddressError(safeAddressError(error));
      return;
    }
    choice.dirty = false;
    renderControls();
    loadAddresses();
  });
  $('chain-tabs').addEventListener('click', (event) => {
    const tab = event.target.closest('[data-chain]');
    if (tab) selectChain(tab.dataset.chain);
  });
  $('chain-tabs').addEventListener('keydown', (event) => {
    const tabs = [...$('chain-tabs').children];
    const current = tabs.indexOf(document.activeElement);
    if (current < 0) return;
    let next;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (current + 1) % tabs.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = (current - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    selectChain(tabs[next].dataset.chain, true);
  });
  $('address-list').addEventListener('click', (event) => {
    const button = event.target.closest('.copy-address');
    if (!button || !currentResult) return;
    const entry = currentRows[Number(button.dataset.position)];
    if (entry) copyText(entry.address, `${activeChain.toUpperCase()} address`);
  });

  window.addEventListener('resize', () => {
    if (currentResult) revealTab($(`tab-${activeChain}`), true);
  });

  return {
    clear,
    show,
    resetChain: () => {
      activeChain = 'btc';
    },
  };
}

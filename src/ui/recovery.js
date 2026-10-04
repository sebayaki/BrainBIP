const chainDetails = {
  btc: 'Bitcoin · Native SegWit receiving addresses · BIP84',
  eth: 'Ethereum · Receiving accounts · BIP44',
  sol: 'Solana · Ed25519 receiving accounts · hardened derivation',
  zec: 'Zcash · Transparent P2PKH addresses · no shielded privacy',
  xmr: 'Monero · One primary address + 19 subaddresses · Account 0',
};

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
    const pathDetails = document.createElement('details');
    pathDetails.className = 'address-path-details';
    const pathLabel = document.createElement('summary');
    pathLabel.textContent =
      chain === 'xmr'
        ? position === 0
          ? 'Primary · 0 / 0'
          : `Subaddress · 0 / ${entry.subaddress}`
        : 'Derivation path';
    const path = document.createElement('span');
    path.className = 'address-path';
    path.textContent = entry.path;
    pathDetails.append(pathLabel, path);
    data.append(address, pathDetails);
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

export function createRecoveryView({ getElement: $, copyText }) {
  let currentResult = null;
  let phraseVisible = false;
  let moneroPhraseVisible = false;
  let activeChain = 'btc';

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
  function renderMoneroMnemonic() {
    const mnemonic = currentResult?.recovery?.xmr?.mnemonic;
    renderWordGrid(
      $('monero-mnemonic-grid'),
      mnemonic,
      moneroPhraseVisible,
      'Twenty-five Monero recovery words',
      'Monero recovery phrase hidden',
    );
    if (mnemonic) setRevealButton($('toggle-monero-phrase'), moneroPhraseVisible);
  }
  function selectChain(chain, focus = false) {
    activeChain = chain;
    for (const tab of $('chain-tabs').children) {
      const selected = tab.dataset.chain === chain;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focus) tab.focus();
    }
    $('address-panel').setAttribute('aria-labelledby', `tab-${chain}`);
    $('chain-description').textContent = chainDetails[chain];
    $('monero-recovery-panel').hidden = chain !== 'xmr' || !currentResult?.recovery?.xmr;
    if (chain !== 'xmr') {
      $('monero-recovery-details').open = false;
      moneroPhraseVisible = false;
      renderMoneroMnemonic();
    }
    renderAddresses($('address-list'), chain, currentResult?.addresses[chain] || []);
  }
  function clear() {
    currentResult = null;
    phraseVisible = false;
    moneroPhraseVisible = false;
    $('mnemonic-grid').replaceChildren();
    $('monero-mnemonic-grid').replaceChildren();
    $('monero-recovery-panel').hidden = true;
    $('monero-recovery-details').open = false;
    setRevealButton($('toggle-monero-phrase'), false);
    $('address-list').replaceChildren();
    $('chain-description').textContent = '';
    $('result-state').hidden = true;
    $('profile-tag').hidden = true;
    $('result-timing').textContent = 'Derived locally';
    $('result-profile').textContent = '';
    setRevealButton($('toggle-phrase'), false);
    $('phrase-visibility-note').textContent = 'Hidden from view. Reveal when you are ready.';
  }
  function show(result, seconds) {
    currentResult = result;
    phraseVisible = false;
    $('progress-state').hidden = true;
    $('empty-state').hidden = true;
    $('result-state').hidden = false;
    $('profile-tag').hidden = false;
    $('result-profile').textContent = result.profile;
    $('result-timing').textContent = `Derived locally in ${seconds}s`;
    renderMnemonic();
    renderMoneroMnemonic();
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
  $('toggle-monero-phrase').addEventListener('click', () => {
    if (!currentResult?.recovery?.xmr) return;
    moneroPhraseVisible = !moneroPhraseVisible;
    renderMoneroMnemonic();
  });
  $('copy-monero-phrase').addEventListener('click', () => {
    if (currentResult?.recovery?.xmr)
      copyText(currentResult.recovery.xmr.mnemonic, 'Monero recovery phrase');
  });
  $('monero-recovery-details').addEventListener('toggle', () => {
    if (!$('monero-recovery-details').open) {
      moneroPhraseVisible = false;
      renderMoneroMnemonic();
    }
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
    const entry = currentResult.addresses[activeChain][Number(button.dataset.position)];
    if (entry) copyText(entry.address, `${activeChain.toUpperCase()} address`);
  });

  return {
    clear,
    show,
    resetChain: () => {
      activeChain = 'btc';
    },
  };
}

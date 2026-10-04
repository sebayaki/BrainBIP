function fallbackCopy(value) {
  const previouslyFocused = document.activeElement;
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.className = 'sr-only';
  textarea.setAttribute('readonly', '');
  document.body.append(textarea);
  try {
    textarea.focus({ preventScroll: true });
    textarea.select();
    if (!document.execCommand('copy')) throw new Error('Copy unavailable');
  } finally {
    textarea.value = '';
    textarea.remove();
    previouslyFocused?.focus();
  }
}

export function createClipboardController(status, getRevision) {
  let toastTimer = null;
  function clear() {
    clearTimeout(toastTimer);
    toastTimer = null;
    status.hidden = true;
    status.textContent = '';
  }
  function showToast(message) {
    clearTimeout(toastTimer);
    status.textContent = message;
    status.hidden = false;
    toastTimer = setTimeout(clear, 2300);
  }
  async function copyText(value, label) {
    const revision = getRevision();
    try {
      let copied = false;
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(value);
          copied = true;
        } catch {
          // Local-file clipboard permissions vary by browser.
        }
      }
      // An edit or reset must also prevent a delayed fallback from copying old data.
      if (revision !== getRevision()) return;
      if (!copied) fallbackCopy(value);
      if (revision === getRevision()) showToast(`${label} copied.`);
    } catch {
      if (revision === getRevision())
        showToast('Copy is unavailable in this browser. Reveal and select the text to copy it.');
    }
  }
  return { copyText, clear };
}

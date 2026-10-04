// Shared text operations only. Wallet validity and strength-model limits are
// separate policies applied by their callers after this normalization.
export function isUnicodeText(value) {
  // TextEncoder replaces lone surrogates. Reject them so distinct malformed
  // strings cannot silently acquire the same UTF-8 representation.
  return (
    typeof value === 'string' &&
    !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)
  );
}

// Call only after both values have passed isUnicodeText(). Preserve passphrase
// whitespace and all case; trim only the email after NFKC normalization.
export function normalizeInputText(passphrase, email) {
  return {
    passphrase: passphrase.normalize('NFKC'),
    email: email.normalize('NFKC').trim(),
  };
}

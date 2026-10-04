import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import * as common from '@zxcvbn-ts/language-common';
import * as english from '@zxcvbn-ts/language-en';

// This is a guessability model, not an entropy measurement. It has no remote
// matchers and does not retain per-request userInputs in the shared dictionary.
const estimator = new ZxcvbnFactory({
  dictionary: { ...common.dictionary, ...english.dictionary },
  graphs: common.adjacencyGraphs,
  translations: english.translations,
  // The caller bounds by Unicode code points; 128 can occupy 256 UTF-16 units.
  maxLength: 256,
});

export const ESTIMATE_MAX_CHARACTERS = 128;
const OUTPUT_BITS = 128;
const PRIVATE_EMAIL_MAX_BITS = 32;
const LABELS = ['Very low', 'Low', 'Moderate', 'Higher', 'High'];
const LIMITED_LANGUAGE = 'English dictionaries are used; non-English words and personal references may be easier to guess than this model predicts.';
const LIMITED_LENGTH = 'Only the first 128 characters are estimated. Wallet generation still uses the complete input.';

function validUnicode(value) {
  return !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);
}

function bounded(value) {
  const characters = [...value];
  return {
    value: characters.slice(0, ESTIMATE_MAX_CHARACTERS).join(''),
    truncated: characters.length > ESTIMATE_MAX_CHARACTERS,
  };
}

function modelBits(result) {
  const bits = result.guessesLog10 * Math.LOG2E * Math.LN10;
  return Number.isFinite(bits) ? Math.max(0, bits) : 0;
}

function userInputs(value) {
  return [...new Set([value, ...value.split(/[^\p{L}\p{N}]+/u)])]
    .filter((part) => [...part].length >= 3)
    .slice(0, 24);
}

function comparable(value) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

function related(alias, passphrase) {
  const name = comparable(alias);
  const password = comparable(passphrase);
  if (name.length < 3 || password.length < 3) return true;
  if (name.includes(password) || password.includes(name)) return true;
  return userInputs(alias).some((part) => {
    const token = comparable(part);
    return token.length >= 3 && password.includes(token);
  });
}

function scoreFor(bits) {
  // zxcvbn's usual score 4 starts around 33 bits. These labels instead use a
  // stricter brainwallet-oriented display scale, without claiming safety.
  return bits < 20 ? 0 : bits < 40 ? 1 : bits < 64 ? 2 : bits < 96 ? 3 : 4;
}

/**
 * Estimate log2 guess counts locally. The optional email increment is a
 * conditional heuristic, never evidence of independent entropy. No inputs,
 * matches, crack-time claims, or estimator internals leave this function.
 */
export function estimateStrength(passphrase, email = '', privateEmail = false) {
  if (typeof passphrase !== 'string' || typeof email !== 'string' ||
      !validUnicode(passphrase) || !validUnicode(email)) {
    throw new TypeError('Strength estimation requires valid text.');
  }
  // Keep these rules aligned with the immutable wallet recovery profile.
  const normalizedPassphrase = passphrase.normalize('NFKC');
  const normalizedEmail = email.normalize('NFKC').trim();
  const password = bounded(normalizedPassphrase);
  const emailInput = bounded(normalizedEmail);
  const at = normalizedEmail.lastIndexOf('@');
  // Domains, casing and +tags receive no secret credit, even when private.
  const alias = at > 0 ? normalizedEmail.slice(0, at).split('+')[0].toLowerCase() : '';
  const aliasInput = bounded(alias);
  const domain = at > 0 ? normalizedEmail.slice(at + 1).toLowerCase() : '';
  const aliasHints = userInputs(aliasInput.value);
  const aliasHintSet = new Set(aliasHints.map((hint) => hint.toLowerCase()));
  const emailHints = [...userInputs(emailInput.value), ...aliasHints];
  const nonEnglish = /[^\x20-\x7E]/u.test(password.value) || /[^\x20-\x7E]/u.test(aliasInput.value);
  const truncated = password.truncated || emailInput.truncated || aliasInput.truncated;
  const limited = nonEnglish || truncated;
  const feedback = [];
  let passphraseBits = 0;
  let passwordUsesAlias = false;

  if (password.value.length === 0) {
    feedback.push('Enter a passphrase to estimate guesswork.');
  } else {
    // Treat recognizable email-related material conservatively in either mode.
    const result = estimator.check(password.value, emailHints);
    passphraseBits = Math.min(OUTPUT_BITS, modelBits(result));
    passwordUsesAlias = result.sequence.some((match) =>
      match.dictionaryName?.includes('userInputs') && aliasHintSet.has(match.matchedWord));
    if (result.feedback.warning) feedback.push(result.feedback.warning);
    feedback.push(...result.feedback.suggestions);
  }

  let emailBits = 0;
  let emailAssumption = 'Email is treated as a public salt and adds no estimated secret strength.';
  if (privateEmail === true && normalizedEmail.length > 0) {
    if (!alias || !domain || !/^[^@\s]+@[^@\s]+$/u.test(normalizedEmail)) {
      emailAssumption = 'No private-email credit: use an email with a non-empty name and domain.';
    } else if (password.value.length === 0) {
      emailAssumption = 'No private-email credit until a passphrase is entered.';
    } else if (password.truncated || aliasInput.truncated || nonEnglish) {
      emailAssumption = 'No private-email credit: these inputs exceed the local model coverage.';
    } else if (passwordUsesAlias || related(aliasInput.value, normalizedPassphrase)) {
      emailAssumption = 'No private-email credit: its name overlaps with the passphrase.';
    } else {
      const conditional = estimator.check(aliasInput.value, [...userInputs(password.value), domain]);
      const sharesPasswordMaterial = conditional.sequence.some((match) =>
        match.dictionaryName?.includes('userInputs'));
      if (sharesPasswordMaterial) {
        emailAssumption = 'No private-email credit: its name matches known or passphrase-related information.';
      } else {
        // A small, explicit ceiling is a conservative product policy, not a
        // calibrated security bound. Multiplying guess counts assumes independent
        // unknown inputs, which a text estimator cannot verify.
        emailBits = Math.min(PRIVATE_EMAIL_MAX_BITS, modelBits(conditional));
        emailAssumption = 'Assumes the email name is unknown and independent. Domain, case and +tags do not count; credit is capped at 32 estimate bits.';
      }
    }
  }

  const combinedBits = Math.min(OUTPUT_BITS, passphraseBits + emailBits);
  const score = Math.min(scoreFor(combinedBits), limited ? 2 : 4);
  if (truncated) feedback.push(LIMITED_LENGTH);
  // ASCII text can also contain words in an unsupported language; the script
  // flag cannot identify those, so every result carries the coverage caveat.
  feedback.push(LIMITED_LANGUAGE);
  if (passphraseBits + emailBits >= OUTPUT_BITS) {
    feedback.push('The combined estimate is capped at the 128-bit limit of the twelve-word output.');
  }
  feedback.push('Estimated guesswork is not measured entropy or a security guarantee. Twelve output words do not strengthen predictable inputs.');
  return {
    passphraseBits,
    score,
    label: limited ? 'Limited guesswork estimate' : `${LABELS[score]} guesswork estimate`,
    feedback: [...new Set(feedback)],
    emailBits,
    combinedBits,
    emailAssumption,
    limited,
  };
}

# BrainBIP derivation and recovery specification

This document specifies BrainBIP's single fixed mapping from a passphrase and optional email salt to twelve English BIP39 words, followed by selectable mainnet address mappings for Bitcoin, Ethereum, Solana, and Zcash. The same normalized inputs reproduce the same words; the same words, path, and address type reproduce the same address list. Cost parameters never adapt to the device, available memory, or execution time.

BrainBIP is a custom brain-wallet construction. Its output follows BIP39, but its passphrase-to-entropy construction is not BIP39, WarpWallet, or a standardized recovery scheme. A valid 12-word output does not establish 128 bits of security: resistance to guessing depends on the original inputs. A salt prevents shared precomputation; an email address is not assumed to be secret or unpredictable. This application and construction have not received an independent security audit.

## 1. Normalize and encode the inputs

Both inputs must be strings containing well-formed Unicode; lone UTF-16 surrogates are rejected rather than replaced during UTF-8 encoding.

1. Normalize the passphrase using Unicode **NFKC**. Preserve its case and all whitespace after normalization. Do not trim it.
2. Normalize the optional email using **NFKC**, then apply ECMAScript `String.prototype.trim()`. Preserve its case; do not lowercase, validate deliverability, remove dots, or remove `+` suffixes. The default email is the empty string.
3. Reject an empty normalized passphrase. A whitespace-only passphrase remains a distinct input; the UI should make its weakness clear.
4. Reject a normalized passphrase longer than **1,024 Unicode code points**, or a normalized email longer than **320 Unicode code points**. These are code-point limits, not byte or UTF-16 code-unit limits.
5. Encode both normalized strings using UTF-8 without a byte-order mark. Let the resulting byte arrays be `P` and `E`.

An omitted, empty, or whitespace-only email produces `E` of length zero. Case and normalized passphrase whitespace affect the wallet. NFKC can merge compatibility-equivalent inputs, such as a full-width `＠` and ASCII `@`.

## 2. Derive two separately salted 32-byte values

Here `||` means byte concatenation. The prefix-ending `\0` is **one U+0000 byte (`00`)**, not the two printable characters `\` and `0`. Neither salt is hashed, length-prefixed, or randomly extended. These literal prefixes are fixed protocol bytes:

```
SA = UTF8("BrainBIP/v2/argon2id\0") || E
SB = UTF8("BrainBIP/v2/pbkdf2\0")   || E
```

Compute `A` from Argon2id:

| Parameter                  | Fixed value                           |
| -------------------------- | ------------------------------------- |
| Password                   | `P`                                   |
| Salt                       | `SA`                                  |
| Algorithm/version          | Argon2id, version `0x13` / decimal 19 |
| Memory cost `m`            | 524,288 KiB = 512 MiB                 |
| Time cost `t`              | 16 passes                             |
| Parallelism `p`            | 1                                     |
| Tag length                 | 32 bytes                              |
| Secret and associated data | Empty                                 |

Compute `B` separately from PBKDF2:

| Parameter     | Fixed value               |
| ------------- | ------------------------- |
| Password      | `P`, independently of `A` |
| Salt          | `SB`                      |
| PRF           | HMAC-SHA256               |
| Iterations    | 5,242,880                 |
| Output length | 32 bytes                  |

The shipped implementation uses pinned hash-wasm Argon2id and PBKDF2/SHA256 code. Its WebAssembly binaries are embedded in the local JavaScript bundle; no runtime fetch is required. WebAssembly, sufficient memory, and ordinary browser execution are required. Total process memory exceeds the 512 MiB Argon2 parameter. Allocation or execution failure stops generation without reducing the computation cost.

The costs were tuned toward approximately ten seconds on a reference machine. That target is not a duration guarantee or a measure of an attacker's cost. The interface shows elapsed time and actual stage transitions; the bundled Argon2 API has no intermediate progress callback and does not supply a completion percentage.

## 3. Produce the mnemonic and BIP39 seed

For byte positions `j = 0…31`, compute `C[j] = A[j] XOR B[j]`. Use exactly `C[0…15]`, the **first 16 bytes**, as BIP39 entropy. Discard the remaining 16 bytes. Do not hex-encode either value before XOR, reverse byte order, or combine the values by concatenation.

Convert the 128 entropy bits to **12 words from the standard BIP39 English wordlist**. BIP39 appends the first four bits of SHA256(entropy) as its checksum, splits the resulting 132 bits into twelve 11-bit indexes, and selects the corresponding words in wordlist order.

Derive the 64-byte BIP39 seed from the canonical mnemonic with the **BIP39 additional passphrase fixed to the empty string**:

```
seed = PBKDF2-HMAC-SHA512(
  UTF8(NFKD(mnemonic)),
  UTF8("mnemonic"),
  iterations = 2048,
  outputBytes = 64
)
```

The input brain-wallet passphrase is already used in step 2; it is not entered again as a BIP39 additional passphrase. The generated 12 words therefore reproduce the specified HD keys when the wallet implements the exact chain mapping. The email is unnecessary when restoring from the generated words.

The `deriveAddresses` and `deriveChainAddresses` APIs accept twelve valid English BIP39 words and canonicalize surrounding/separating whitespace before deriving this seed. They do not lowercase words or accept a different BIP39 passphrase.

## 4. Derive mainnet addresses

The application derives indexes **0 through 19**, displayed as positions 1 through 20. Each output contains its zero-based `index`, complete `path`, and public `address`. Apostrophes indicate hardened derivation. The initial lists retain these default mappings:

| Network         | Curve and key derivation | Default path for index `i` | Address                                      |
| --------------- | ------------------------ | -------------------------- | -------------------------------------------- |
| Bitcoin mainnet | secp256k1, BIP32/BIP84   | `m/84'/0'/0'/0/i`          | Native SegWit P2WPKH, `bc1q…`                |
| Ethereum        | secp256k1, BIP32/BIP44   | `m/44'/60'/0'/0/i`         | 20-byte `0x…` address with EIP55 checksum    |
| Solana          | Ed25519, SLIP-0010       | `m/44'/501'/i'/0'`         | Base58 of the raw 32-byte Ed25519 public key |
| Zcash mainnet   | secp256k1, BIP32/BIP44   | `m/44'/133'/0'/0/i`        | Transparent P2PKH `t1…`                      |

With the defaults, BTC, ETH, and ZEC increment the final **address index within account 0**. SOL increments a **hardened account index**. These are twenty addresses per network, eighty in total, rather than twenty BIP44 accounts on every network.

### Presets

Each `{index}` is replaced by an integer from 0 through 19. A following apostrophe remains part of the path and makes that component hardened.

| Chain | Preset                         | Path template             | Address format    |
| ----- | ------------------------------ | ------------------------- | ----------------- |
| BTC   | Native SegWit (BIP84), default | `m/84'/0'/0'/0/{index}`   | P2WPKH, `bc1q…`   |
| BTC   | Nested SegWit (BIP49)          | `m/49'/0'/0'/0/{index}`   | P2SH-P2WPKH, `3…` |
| BTC   | Legacy (BIP44)                 | `m/44'/0'/0'/0/{index}`   | P2PKH, `1…`       |
| ETH   | Standard, default              | `m/44'/60'/0'/0/{index}`  | EIP55             |
| ETH   | Ledger legacy                  | `m/44'/60'/0'/{index}`    | EIP55             |
| ETH   | Ledger Live                    | `m/44'/60'/{index}'/0/0`  | EIP55             |
| SOL   | BIP44 with change, default     | `m/44'/501'/{index}'/0'`  | Ed25519, Base58   |
| SOL   | BIP44                          | `m/44'/501'/{index}'`     | Ed25519, Base58   |
| ZEC   | Transparent (BIP44), default   | `m/44'/133'/0'/0/{index}` | P2PKH, `t1…`      |

Ethereum Standard matches the ordinary MEW and MetaMask software-wallet layout. Ledger legacy increments its final non-hardened component; Ledger Live increments the hardened account component and keeps the final `/0/0` fixed. For example, index 1 is `m/44'/60'/0'/0/1`, `m/44'/60'/0'/1`, or `m/44'/60'/1'/0/0`, respectively. Standard and Ledger Live share index 0, but their later addresses differ. These conventions are explicit in [go-ethereum's derivation iterators](https://github.com/ethereum/go-ethereum/blob/master/accounts/hd.go) and Ledger's [account model](https://www.ledger.com/blog/understanding-crypto-addresses-and-derivation-paths).

Solana's four-level and three-level templates correspond to Phantom's documented `bip44Change` and `bip44` groupings. They are hardened account mappings, not a non-hardened address sequence. See [Phantom's supported paths](https://help.phantom.com/articles/12988493966227). Zcash offers its transparent BIP44 mapping; it does not offer a shielded or multisignature preset.

### Custom paths

A custom selection requires an absolute path beginning with `m/`, at most **160 characters** and **ten components after `m`**, and exactly one complete component of `{index}` or `{index}'`. Other components must be canonical decimal integers from 0 through 2,147,483,647, optionally followed by `'`. Empty components, leading zeros on multi-digit numbers, arithmetic, wildcards, relative paths, and extra placeholders are rejected.

Solana requires **every component to be hardened**, including `{index}'`, because this implementation uses SLIP-0010 Ed25519. It rejects non-hardened paths rather than changing them silently. For Bitcoin, choose the address type explicitly: Native SegWit, Nested SegWit, or Legacy. A path's purpose number does not automatically change the chosen encoding. For Ethereum, Solana, and Zcash, a custom path changes key derivation while retaining that chain's address encoding.

`getDerivationPresets(chain)` returns the available presets. `resolveDerivation(chain, selection)` validates a preset or custom selection. `deriveChainAddresses(mnemonic, chain, selection, count)` derives the selected chain; `count` is an integer from 1 through 20, defaulting to 20. Preset selections use `presetId`; custom selections use `presetId: 'custom'` and `customPath`, plus `addressType` for BTC. `deriveAddresses(mnemonic, count)` retains the four default mappings.

Changing an address selection does not alter the mnemonic or rerun the passphrase-stretching Argon2id/PBKDF2-HMAC-SHA256 stages. The worker still derives the BIP39 seed using PBKDF2-HMAC-SHA512 with 2,048 iterations, then generates the selected chain's twenty addresses and closes after returning. No balance discovery, RPC, or transaction signing is involved.

### Address encoding

- **BTC Native SegWit:** HASH160 of the compressed secp256k1 public key; witness version 0 and its 20-byte witness program; Bech32 with human-readable part `bc`. This is Bech32, not Bech32m or Taproot.
- **BTC Nested SegWit:** Build the redeem script `00 14 || HASH160(compressedPublicKey)`. Base58Check-encode `05 || HASH160(redeemScript)` for mainnet P2SH-P2WPKH. Changing the path's purpose from `84'` to `49'` alone is insufficient; the address encoding also changes.
- **BTC Legacy:** Base58Check-encode `00 || HASH160(compressedPublicKey)` for mainnet P2PKH.
- **ETH:** Keccak256 of the 64-byte uncompressed public key after removing its leading `04`; take the last 20 bytes. Apply EIP55 to the lowercase hexadecimal address using Keccak256 of its ASCII hexadecimal characters, excluding `0x`. Keccak256 is distinct from standardized SHA3-256.
- **SOL:** Derive only hardened SLIP-0010 children using the master HMAC label `ed25519 seed`. Base58-encode the Ed25519 public key's raw 32 bytes. The SLIP-0010 serialization prefix `00` must not be included.
- **ZEC:** HASH160 of the compressed secp256k1 public key; prepend the two bytes `1c b8`; append the first four bytes of double-SHA256(payload); Base58-encode the result. These addresses provide no shielded receiver, Sapling/Orchard keys, or Unified Address.

## 5. Interoperability and recovery

The default BTC/ETH/SOL paths match Phantom's documented `bip44Change` grouping. Default ETH also matches MetaMask's ordinary recovery-phrase derivation and MEW's standard layout. MetaMask's recovery-phrase importer supports only its standard path; its Ledger alternatives are available when connecting Ledger hardware, not as arbitrary recovery-phrase import choices. See [MetaMask's import limitations](https://support.metamask.io/configure/wallet/importing-a-seed-phrase-from-another-wallet-software-derivation-path/) and [MEW's path selection](https://help.myetherwallet.com/en/articles/5867305-hd-wallets-and-derivation-paths).

Keep the **complete path and address type used for each address**. A receiving wallet must support the relevant chain, address type, and path; a BIP39 import alone does not guarantee discovery. Custom paths may be valid here yet unsupported by another wallet. Address discovery limits and unused-address gaps can require an explicit path or index. Phantom documents activity-dependent discovery for alternate groupings, so unused addresses may not appear automatically.

For the defaults, restore BTC account 0 with BIP84 Native SegWit; ETH with the standard BIP44 layout; and SOL with the explicit four-level hardened path. ZEC restoration requires a wallet supporting BIP39/BIP44 transparent keys at the stated path; shielded-only restoration is a different scheme. Alternate presets require their respective complete paths and Bitcoin encodings.

The private-email UI switch is **off by default and affects strength estimates only**. Both positions use identical normalization, email salt, KDF parameters, mnemonic, and addresses. Public-email strength credit is zero; any private-email credit is conditional on the user's unverified secrecy and independence assumption.

Recovering the words from the original passphrase and email requires this exact fixed input mapping. Keep a copy of this public specification or the verified offline release; neither is a secret. A memory-limited device must use a device capable of running the fixed derivation. Recovery of receiving addresses from the words also requires the selected chain mapping and address type. A path is public metadata, not an additional secret.

## 6. Test vectors and execution lifecycle

`tests/fixtures/brainbip-v2.json` is a **public, full-cost test vector** including raw and normalized inputs, salts, intermediate outputs, mnemonic, BIP39 seed, and eighty default BTC/ETH/SOL/ZEC addresses. Its fixed inputs and outputs are unchanged by address preset support. **Never deposit funds to addresses derived from test vectors.** Its Argon2 output was generated with the independent noble-hashes JavaScript implementation. PBKDF2, BIP39 seed, and HD/address references use Node/OpenSSL and separate encoders. The production tests compare the complete Argon2 output and end-to-end wallet against this reference.

`tests/fixtures/address-presets.json` contains **thirteen public vectors with twenty rows each**: all nine presets and one custom path per chain. Its 260 addresses come from the separate Node/OpenSSL BIP39, BIP32, SLIP-0010, Base58Check, Bech32, and P2SH-P2WPKH reference encoders, with hash-wasm Keccak for Ethereum. The generator does not import production derivation or preset code. Production tests compare every complete path and address against these references.

The test suite also includes published Argon2 reference, BIP39, BIP32, SLIP-0010 and Bitcoin address vectors, plus preset and custom-path validation. [SLIP-0132's mainnet vectors](https://github.com/satoshilabs/slips/blob/master/slip-0132.md#bitcoin-test-vectors) supply independent BIP44, BIP49, and BIP84 addresses. Fixture generation is an explicit maintainer operation; ordinary tests never rewrite expected values.

Each mnemonic generation runs in a fresh worker. It reports the stages `argon2id`, `pbkdf2`, and `addresses`, then returns a result or a fixed error message and closes. Address-only selections use a separate fresh worker and never run the heavy KDF. Cancellation or reset terminates pending workers; input edits and newer selections invalidate stale results. Owned byte arrays and HD private-key buffers are overwritten where possible. JavaScript strings, library-internal copies, WebAssembly memory, and browser/OS behavior prevent a guarantee of complete secret erasure.

## References

- [Argon2 specification, RFC 9106](https://www.rfc-editor.org/rfc/rfc9106.html)
- [Argon2 reference implementation vectors](https://github.com/P-H-C/phc-winner-argon2/blob/master/src/test.c)
- [BIP39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) and [Trezor test vectors](https://github.com/trezor/python-mnemonic/blob/master/vectors.json)
- [BIP32](https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki), [BIP44](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki), [BIP49](https://github.com/bitcoin/bips/blob/master/bip-0049.mediawiki), and [BIP84](https://github.com/bitcoin/bips/blob/master/bip-0084.mediawiki)
- [SLIP-0132 Bitcoin address vectors](https://github.com/satoshilabs/slips/blob/master/slip-0132.md#bitcoin-test-vectors)
- [go-ethereum derivation paths and iterators](https://github.com/ethereum/go-ethereum/blob/master/accounts/hd.go)
- [Ledger account derivation](https://www.ledger.com/blog/understanding-crypto-addresses-and-derivation-paths)
- [EIP55 address checksum](https://eips.ethereum.org/EIPS/eip-55)
- [SLIP-0010 Ed25519 HD derivation](https://github.com/satoshilabs/slips/blob/master/slip-0010.md) and [SLIP-0044 coin types](https://github.com/satoshilabs/slips/blob/master/slip-0044.md)
- [Phantom derivation paths](https://help.phantom.com/articles/12988493966227)
- [MetaMask recovery-phrase paths](https://support.metamask.io/configure/wallet/importing-a-seed-phrase-from-another-wallet-software-derivation-path/)
- [MEW default and custom paths](https://help.myetherwallet.com/en/articles/5867305-hd-wallets-and-derivation-paths)
- [Zcash protocol specification](https://zips.z.cash/protocol/protocol.pdf)
- [hash-wasm implementation](https://github.com/Daninet/hash-wasm)
- [hash-wasm 4.12.0 Argon2 API](https://github.com/Daninet/hash-wasm/blob/v4.12.0/lib/argon2.ts)
- [WebAssembly memory allocation](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/Memory/Memory)

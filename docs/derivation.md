# BrainBIP v1 derivation and recovery specification

Profile identifier: **`brainbip-v1`**. This document specifies the complete deterministic mapping from inputs to a 12-word mnemonic and public addresses. Changing normalization, byte encoding, a salt prefix, KDF parameters, output mixing, the BIP39 passphrase, a derivation path, or an address format requires a new profile identifier. V1 never reduces its costs according to the input, device, available memory, or execution time.

BrainBIP v1 is a custom brain-wallet construction. Its output follows BIP39, but its passphrase-to-entropy construction is not BIP39, WarpWallet, or a standardized recovery scheme. A valid 12-word output does not establish 128 bits of security: resistance to guessing depends on the original inputs. A salt prevents shared precomputation; an email address is not assumed to be secret or unpredictable. This application and this construction have not received an independent security audit.

## 1. Normalize and encode the inputs

Both inputs must be strings containing well-formed Unicode; lone UTF-16 surrogates are rejected rather than replaced during UTF-8 encoding.

1. Normalize the passphrase using Unicode **NFKC**. Preserve its case and all whitespace after normalization. Do not trim it.
2. Normalize the optional email using **NFKC**, then apply ECMAScript `String.prototype.trim()`. Preserve its case; do not lowercase, validate deliverability, remove dots, or remove `+` suffixes. The default email is the empty string.
3. Reject an empty normalized passphrase. A whitespace-only passphrase remains a distinct input; the UI should make its weakness clear.
4. Reject a normalized passphrase longer than **1,024 Unicode code points**, or a normalized email longer than **320 Unicode code points**. These are code-point limits, not byte or UTF-16 code-unit limits.
5. Encode both normalized strings using UTF-8 without a byte-order mark. Let the resulting byte arrays be `P` and `E`.

An omitted, empty, or whitespace-only email produces `E` of length zero. Case and normalized passphrase whitespace affect the wallet. NFKC can merge compatibility-equivalent inputs, such as a full-width `＠` and ASCII `@`.

## 2. Derive two independent 32-byte values

Here `||` means byte concatenation. The prefix-ending `\0` is **one U+0000 byte (`00`)**, not the two printable characters `\` and `0`. Neither salt is hashed, length-prefixed, or randomly extended.

```
SA = UTF8("BrainBIP/v1/argon2id\0") || E
SB = UTF8("BrainBIP/v1/pbkdf2\0")   || E
```

Compute `A` from Argon2id:

| Parameter | V1 value |
|---|---|
| Password | `P` |
| Salt | `SA` |
| Algorithm/version | Argon2id, version `0x13` / decimal 19 |
| Memory cost `m` | 262,144 KiB = 256 MiB |
| Time cost `t` | 3 passes |
| Parallelism `p` | 1 |
| Tag length | 32 bytes |
| Secret and associated data | Empty |

Compute `B` independently from PBKDF2:

| Parameter | V1 value |
|---|---|
| Password | `P`, independently of `A` |
| Salt | `SB` |
| PRF | HMAC-SHA256 |
| Iterations | 1,048,576 |
| Output length | 32 bytes |

The shipped implementation uses pinned hash-wasm Argon2id and PBKDF2/SHA256 code. Its WebAssembly binaries are embedded in the local JavaScript bundle; no runtime fetch is required. WebAssembly, sufficient memory, and ordinary browser execution are required. Allocation or execution failure stops generation; it never changes the profile. Total process memory exceeds the 256 MiB Argon2 memory parameter.

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

The input brain-wallet passphrase is already used in step 2; it is not entered again as a BIP39 additional passphrase. The generated 12 words therefore suffice to recover the specified HD keys in a compatible external wallet, using the matching derivation paths. The email is unnecessary when restoring from the generated words.

The `deriveAddresses` API accepts twelve valid English BIP39 words and canonicalizes surrounding/separating whitespace before deriving this seed. It does not lowercase words or accept a different BIP39 passphrase.

## 4. Derive mainnet addresses

The application derives indexes **0 through 19**, displayed as positions 1 through 20. Each output contains its zero-based `index`, complete `path`, and public `address`. Apostrophes indicate hardened derivation.

| Network | Curve and key derivation | Path for index `i` | Address |
|---|---|---|---|
| Bitcoin mainnet | secp256k1, BIP32/BIP84 | `m/84'/0'/0'/0/i` | Native SegWit P2WPKH, `bc1q…` |
| Ethereum | secp256k1, BIP32/BIP44 | `m/44'/60'/0'/0/i` | 20-byte `0x…` address with EIP55 checksum |
| Solana | Ed25519, SLIP-0010 | `m/44'/501'/i'/0'` | Base58 of the raw 32-byte Ed25519 public key |
| Zcash mainnet | secp256k1, BIP32/BIP44 | `m/44'/133'/0'/0/i` | Transparent P2PKH `t1…` |

BTC, ETH, and ZEC increment the final **address index within account 0**. SOL increments a **hardened account index**. These are twenty addresses per network, rather than twenty BIP44 accounts on every network.

Address encoding is precise:

- **BTC:** HASH160 of the compressed secp256k1 public key; witness version 0 and its 20-byte witness program; Bech32 with human-readable part `bc`. This is Bech32, not Bech32m, Taproot, legacy P2PKH, or wrapped SegWit.
- **ETH:** Keccak256 of the 64-byte uncompressed public key after removing its leading `04`; take the last 20 bytes. Apply EIP55 to the lowercase hexadecimal address using Keccak256 of its ASCII hexadecimal characters, excluding `0x`. Keccak256 is distinct from standardized SHA3-256.
- **SOL:** Derive only hardened SLIP-0010 children using the master HMAC label `ed25519 seed`. Base58-encode the Ed25519 public key's raw 32 bytes. The SLIP-0010 serialization prefix `00` must not be included.
- **ZEC:** HASH160 of the compressed secp256k1 public key; prepend the two bytes `1c b8`; append the first four bytes of double-SHA256(payload); Base58-encode the result. These addresses provide no shielded receiver, Sapling/Orchard keys, or Unified Address.

No private key, extended key, transaction, balance, or network query forms part of the returned result.

## 5. Interoperability and recovery

The BTC/ETH/SOL paths match Phantom's documented `bip44Change` grouping. ETH also matches MetaMask's ordinary recovery-phrase derivation. Other wallet defaults, hardware-wallet account layouts, and legacy Solana paths can produce different addresses from the same mnemonic. A receiving wallet must support the relevant chain, address type, and path; a BIP39 import alone does not guarantee discovery.

For BTC, restore account 0 with BIP84 Native SegWit. For ETH, use the documented software-wallet BIP44 path and create successive accounts as needed to reach the corresponding address index. For SOL, use the explicit four-level hardened path shown above. For ZEC, restoration requires a wallet supporting BIP39/BIP44 transparent keys at the stated path; shielded-only restoration is a different scheme. Address discovery limits and unused-address gaps in external wallets may require an explicit path or index.

Recovering from the original passphrase and email also requires this exact **v1 profile**. Keep a copy of this public specification or the verified offline release; neither is a secret. Future parameter changes must retain v1 recovery support or publish a separate release that implements it.

## 6. Test vectors and execution lifecycle

`tests/fixtures/brainbip-v1.json` is a **public, full-cost v1 test vector** including raw and normalized inputs, salts, intermediate outputs, mnemonic, BIP39 seed, and eighty addresses. **Never deposit funds to addresses derived from test vectors.** Its Argon2 output was generated with the independent noble-hashes JavaScript implementation; the normal test suite checks the hash-wasm production implementation against it. PBKDF2 and HD/address fixtures are independently checked with Node/OpenSSL and separate test encoders.

The test suite also includes published Argon2 reference, BIP39, BIP32, SLIP-0010 and BIP84 vectors. Fixture generation is an explicit maintainer operation; ordinary tests never rewrite expected values.

Each generation runs in a fresh worker. It reports the stages `argon2id`, `pbkdf2`, and `addresses`, then returns a result or a fixed error message and closes. Cancellation terminates the worker. Owned byte arrays and HD private-key buffers are overwritten where possible. JavaScript strings, library-internal copies, WebAssembly memory, and browser/OS behavior prevent a guarantee of complete secret erasure.

## References

- [Argon2 specification, RFC 9106](https://www.rfc-editor.org/rfc/rfc9106.html)
- [Argon2 reference implementation vectors](https://github.com/P-H-C/phc-winner-argon2/blob/master/src/test.c)
- [BIP39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) and [Trezor test vectors](https://github.com/trezor/python-mnemonic/blob/master/vectors.json)
- [BIP32](https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki), [BIP44](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki), and [BIP84](https://github.com/bitcoin/bips/blob/master/bip-0084.mediawiki)
- [EIP55 address checksum](https://eips.ethereum.org/EIPS/eip-55)
- [SLIP-0010 Ed25519 HD derivation](https://github.com/satoshilabs/slips/blob/master/slip-0010.md) and [SLIP-0044 coin types](https://github.com/satoshilabs/slips/blob/master/slip-0044.md)
- [Phantom derivation paths](https://help.phantom.com/articles/12988493966227)
- [MetaMask recovery-phrase paths](https://support.metamask.io/configure/wallet/importing-a-seed-phrase-from-another-wallet-software-derivation-path/)
- [Zcash protocol specification](https://zips.z.cash/protocol/protocol.pdf)
- [hash-wasm implementation](https://github.com/Daninet/hash-wasm)

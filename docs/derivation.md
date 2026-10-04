# BrainBIP derivation and recovery specification

Profile identifiers: **`brainbip-v1`** and **`brainbip-v2`**. This document preserves the original v1 mapping and specifies the higher-cost v2 profile. Both map inputs to a 12-word mnemonic and public addresses. V2 is the default for new generation; select v1 explicitly to reproduce an earlier v1 wallet. **The same inputs produce different wallets under the two profiles.** Changing profiles does not migrate funds or upgrade an existing wallet.

V1 outputs remain unchanged. V2 uses the same normalization, output mixing, BIP39 conversion, and chain mappings, with its own fixed KDF parameters and salt prefixes in section 2. Monero uses the shared mapping identifier **`ledger-bip39-v1`**. Changing normalization, byte encoding, a salt prefix, KDF parameters, output mixing, the BIP39 passphrase, an existing derivation path, or an existing address format requires a new profile identifier. Neither profile reduces its costs according to the input, device, available memory, or execution time.

BrainBIP profiles are custom brain-wallet constructions. Their output follows BIP39, but their passphrase-to-entropy construction is not BIP39, WarpWallet, or a standardized recovery scheme. A valid 12-word output does not establish 128 bits of security: resistance to guessing depends on the original inputs. A salt prevents shared precomputation; an email address is not assumed to be secret or unpredictable. This application and these constructions have not received an independent security audit.

## 1. Normalize and encode the inputs

Both inputs must be strings containing well-formed Unicode; lone UTF-16 surrogates are rejected rather than replaced during UTF-8 encoding.

1. Normalize the passphrase using Unicode **NFKC**. Preserve its case and all whitespace after normalization. Do not trim it.
2. Normalize the optional email using **NFKC**, then apply ECMAScript `String.prototype.trim()`. Preserve its case; do not lowercase, validate deliverability, remove dots, or remove `+` suffixes. The default email is the empty string.
3. Reject an empty normalized passphrase. A whitespace-only passphrase remains a distinct input; the UI should make its weakness clear.
4. Reject a normalized passphrase longer than **1,024 Unicode code points**, or a normalized email longer than **320 Unicode code points**. These are code-point limits, not byte or UTF-16 code-unit limits.
5. Encode both normalized strings using UTF-8 without a byte-order mark. Let the resulting byte arrays be `P` and `E`.

An omitted, empty, or whitespace-only email produces `E` of length zero. Case and normalized passphrase whitespace affect the wallet. NFKC can merge compatibility-equivalent inputs, such as a full-width `＠` and ASCII `@`.

## 2. Derive two separately salted 32-byte values

### Original profile: `brainbip-v1`

Here `||` means byte concatenation. The prefix-ending `\0` is **one U+0000 byte (`00`)**, not the two printable characters `\` and `0`. Neither salt is hashed, length-prefixed, or randomly extended.

```
SA = UTF8("BrainBIP/v1/argon2id\0") || E
SB = UTF8("BrainBIP/v1/pbkdf2\0")   || E
```

Compute `A` from Argon2id:

| Parameter                  | V1 value                              |
| -------------------------- | ------------------------------------- |
| Password                   | `P`                                   |
| Salt                       | `SA`                                  |
| Algorithm/version          | Argon2id, version `0x13` / decimal 19 |
| Memory cost `m`            | 262,144 KiB = 256 MiB                 |
| Time cost `t`              | 3 passes                              |
| Parallelism `p`            | 1                                     |
| Tag length                 | 32 bytes                              |
| Secret and associated data | Empty                                 |

Compute `B` independently from PBKDF2:

| Parameter     | V1 value                  |
| ------------- | ------------------------- |
| Password      | `P`, independently of `A` |
| Salt          | `SB`                      |
| PRF           | HMAC-SHA256               |
| Iterations    | 1,048,576                 |
| Output length | 32 bytes                  |

The shipped implementation uses pinned hash-wasm Argon2id and PBKDF2/SHA256 code. Its WebAssembly binaries are embedded in the local JavaScript bundle; no runtime fetch is required. WebAssembly, sufficient memory, and ordinary browser execution are required. Allocation or execution failure stops generation; it never changes the profile. Total process memory exceeds the 256 MiB Argon2 memory parameter.

### Default profile: `brainbip-v2`

V2 uses exactly the same normalized `P` and `E` from section 1. Its salts are:

```
SA = UTF8("BrainBIP/v2/argon2id\0") || E
SB = UTF8("BrainBIP/v2/pbkdf2\0")   || E
```

Compute `A` with Argon2id version 19, **524,288 KiB (512 MiB)** of memory, **16 passes**, parallelism **1**, and a **32-byte** output. Secret and associated data remain empty. Independently compute `B` with PBKDF2-HMAC-SHA256, **5,242,880 iterations**, and a **32-byte** output. Both branches use `P` as their password and their respective salts above. The remaining steps are unchanged.

| Parameter                                | `brainbip-v1`                        | `brainbip-v2`            |
| ---------------------------------------- | ------------------------------------ | ------------------------ |
| Default for new generation               | No; explicit earlier-wallet recovery | Yes                      |
| Argon2id version                         | 19                                   | 19                       |
| Argon2 memory                            | 262,144 KiB / 256 MiB                | 524,288 KiB / 512 MiB    |
| Argon2 passes                            | 3                                    | 16                       |
| Argon2 parallelism                       | 1                                    | 1                        |
| Argon2 output                            | 32 bytes                             | 32 bytes                 |
| Argon2 salt prefix                       | `BrainBIP/v1/argon2id\0`             | `BrainBIP/v2/argon2id\0` |
| PBKDF2 PRF                               | HMAC-SHA256                          | HMAC-SHA256              |
| PBKDF2 iterations                        | 1,048,576                            | 5,242,880                |
| PBKDF2 output                            | 32 bytes                             | 32 bytes                 |
| PBKDF2 salt prefix                       | `BrainBIP/v1/pbkdf2\0`               | `BrainBIP/v2/pbkdf2\0`   |
| XOR bytes used as BIP39 entropy          | First 16                             | First 16                 |
| English mnemonic / additional passphrase | 12 words / empty                     | 12 words / empty         |

The profile identifier is public recovery metadata, not another secret. The API `deriveWallet(passphrase, email, onStage, profileId)` defaults an omitted `profileId` to `brainbip-v2`; pass `brainbip-v1` explicitly for v1 recovery. The worker accepts the same selection as `profileId`, and the result's `profile` records the selected identifier. Unknown identifiers are rejected, never interpreted as a fallback.

V2 was tuned toward approximately ten seconds on a reference machine. That target is not a duration guarantee or a measure of an attacker's cost. Total process memory exceeds the selected Argon2 memory parameter, and a browser may fail to allocate it. Generation then stops without reducing parameters or switching to v1. The interface shows elapsed time and actual stage transitions; the bundled Argon2 API has no intermediate progress callback and does not supply a completion percentage.

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

The input brain-wallet passphrase is already used in step 2; it is not entered again as a BIP39 additional passphrase. The generated 12 words therefore reproduce the specified HD keys when the wallet implements the exact chain mapping. The email is unnecessary when restoring from the generated words. Standard Monero seed import requires the separate 25-word phrase described below.

The `deriveAddresses` API accepts twelve valid English BIP39 words and canonicalizes surrounding/separating whitespace before deriving this seed. It does not lowercase words or accept a different BIP39 passphrase.

## 4. Derive mainnet addresses

The application derives indexes **0 through 19**, displayed as positions 1 through 20. Each output contains its zero-based `index`, complete `path`, and public `address`. Apostrophes indicate hardened derivation.

| Network         | Curve and key derivation                               | Path for index `i`                                      | Address                                                  |
| --------------- | ------------------------------------------------------ | ------------------------------------------------------- | -------------------------------------------------------- |
| Bitcoin mainnet | secp256k1, BIP32/BIP84                                 | `m/84'/0'/0'/0/i`                                       | Native SegWit P2WPKH, `bc1q…`                            |
| Ethereum        | secp256k1, BIP32/BIP44                                 | `m/44'/60'/0'/0/i`                                      | 20-byte `0x…` address with EIP55 checksum                |
| Solana          | Ed25519, SLIP-0010                                     | `m/44'/501'/i'/0'`                                      | Base58 of the raw 32-byte Ed25519 public key             |
| Zcash mainnet   | secp256k1, BIP32/BIP44                                 | `m/44'/133'/0'/0/i`                                     | Transparent P2PKH `t1…`                                  |
| Monero mainnet  | Ledger BIP32 secp256k1 mapping to Edwards25519 scalars | `m/44'/128'/0'/0/0`; Monero account `0`, subaddress `i` | Primary `4…` at `i = 0`; subaddresses `8…` at `i = 1…19` |

BTC, ETH, and ZEC increment the final **address index within account 0**. SOL increments a **hardened account index**. XMR increments a **Monero subaddress index within one wallet and account**, without changing its BIP32 path. These are twenty addresses per network, rather than twenty BIP44 accounts on every network. XMR outputs include `account: 0` and `subaddress: i` in addition to `index`, `path`, and `address`.

Address encoding is precise:

- **BTC:** HASH160 of the compressed secp256k1 public key; witness version 0 and its 20-byte witness program; Bech32 with human-readable part `bc`. This is Bech32, not Bech32m, Taproot, legacy P2PKH, or wrapped SegWit.
- **ETH:** Keccak256 of the 64-byte uncompressed public key after removing its leading `04`; take the last 20 bytes. Apply EIP55 to the lowercase hexadecimal address using Keccak256 of its ASCII hexadecimal characters, excluding `0x`. Keccak256 is distinct from standardized SHA3-256.
- **SOL:** Derive only hardened SLIP-0010 children using the master HMAC label `ed25519 seed`. Base58-encode the Ed25519 public key's raw 32 bytes. The SLIP-0010 serialization prefix `00` must not be included.
- **ZEC:** HASH160 of the compressed secp256k1 public key; prepend the two bytes `1c b8`; append the first four bytes of double-SHA256(payload); Base58-encode the result. These addresses provide no shielded receiver, Sapling/Orchard keys, or Unified Address.

### Monero extension: `ledger-bip39-v1`

Start from the same 64-byte BIP39 seed, using an empty additional BIP39 passphrase. Derive the **secp256k1 BIP32 private child** at `m/44'/128'/0'/0/0`. Hash its 32 private-key bytes using Keccak256. Interpret the hash as a little-endian integer and reduce modulo the Edwards25519 subgroup order `l = 2^252 + 27742317777372353535851937790883648493`; this is the private spend scalar `b`. Encode `b` in 32 little-endian bytes, hash those bytes with Keccak256, and reduce in the same way to obtain the private view scalar `a`. A zero spend or view scalar is rejected without changing the mapping.

Derive public keys by raw scalar multiplication `B = bG` and `A = aG` on Edwards25519. **Do not use EdDSA seed hashing or clamping**, such as `ed25519.getPublicKey(seed)`: that produces different keys. This mapping follows Ledger's published implementation and is distinct from Trezor's SLIP-0010 Ed25519 mapping.

For the primary address `(major, minor) = (0, 0)`, use the mainnet prefix byte `12` in hexadecimal (decimal 18), followed by `B` and `A`, each in 32-byte compressed point encoding. For minor indexes `i = 1…19`, compute:

```
m = Hs(UTF8("SubAddr\0") || LE256(a) || LE32(0) || LE32(i))
D = B + mG
C = aD
```

Here `Hs` means Keccak256 interpreted little-endian and reduced modulo `l`; `LE256(a)` is the **32-byte** scalar encoding, while `LE32(index)` is a **four-byte** unsigned integer. The domain string ends in one zero byte. Subaddress payloads are hexadecimal prefix `2a` (decimal 42), followed by compressed `D` and `C`. In either case, append the first four bytes of Keccak256(payload), then encode with **Monero's fixed-block Base58**, not Bitcoin Base58Check.

Generate the native **25-word English legacy Monero mnemonic** from the 32-byte reduced spend scalar `b`. Using the official 1,626-word ordered English list, read eight four-byte little-endian integers `x`. For each, with `n = 1626`, select:

```
w1 = x mod n
w2 = (floor(x / n) + w1) mod n
w3 = (floor(floor(x / n) / n) + w2) mod n
```

This produces 24 words. Concatenate each word's first three ASCII characters, calculate ordinary CRC32/IEEE, and append the word at checksum index `CRC32 mod 24`. The phrase encodes the spend key directly; it is not BIP39 and adds no entropy. It restores the same Monero primary address and subaddresses in compatible legacy-seed wallets, with an empty Monero seed-offset passphrase.

The result includes `recovery.xmr = { mnemonic, mapping: 'ledger-bip39-v1', path: "m/44'/128'/0'/0/0" }`. The 25-word mnemonic is secret recovery material, just like the BIP39 phrase. No raw private key, extended key, transaction, balance, or network query forms part of the returned result.

## 5. Interoperability and recovery

The BTC/ETH/SOL paths match Phantom's documented `bip44Change` grouping. ETH also matches MetaMask's ordinary recovery-phrase derivation. Other wallet defaults, hardware-wallet account layouts, and legacy Solana paths can produce different addresses from the same mnemonic. A receiving wallet must support the relevant chain, address type, and path; a BIP39 import alone does not guarantee discovery.

For BTC, restore account 0 with BIP84 Native SegWit. For ETH, use the documented software-wallet BIP44 path and create successive accounts as needed to reach the corresponding address index. For SOL, use the explicit four-level hardened path shown above. For ZEC, restoration requires a wallet supporting BIP39/BIP44 transparent keys at the stated path; shielded-only restoration is a different scheme. Address discovery limits and unused-address gaps in external wallets may require an explicit path or index.

For XMR, standard Monero GUI/CLI recovery does **not** import the twelve BIP39 words. Restore from the generated **25-word Monero legacy phrase**, leaving the seed-offset passphrase empty. A wallet-file password protects that wallet file and is unrelated to the original BrainBIP passphrase. Set a restore height or date at or before the first incoming transaction; a later height can miss funds. Account `0`, subaddresses `0…19` identify the shown addresses. Native Monero recovery preserves the wallet's keys and subaddresses, but not labels or other local wallet metadata. Verify the primary address after recovery. This 25-word phrase cannot restore BTC, ETH, SOL, or ZEC. Restoring the BIP39 phrase directly is possible only through a wallet supporting this exact Ledger mapping, and must not be assumed compatible with Trezor's different Monero derivation.

The private-email UI switch is **off by default and affects strength estimates only**. Both positions use identical normalization, email salt, KDF parameters, mnemonic, and addresses. Public-email strength credit is zero; any private-email credit is conditional on the user's unverified secrecy and independence assumption.

Recovering from the original passphrase and email requires the exact profile originally selected: **`brainbip-v1` or `brainbip-v2`**. Select v1 for an original v1 wallet even though the current default is v2. Keep the identifier and a copy of this public specification or the verified offline release; none is a secret. A slower or memory-limited device cannot recover a v2 wallet by selecting v1. Recovery from the generated words uses the same chain mappings regardless of the original profile. Future parameter changes must retain existing recovery support or publish separate releases that implement it.

## 6. Test vectors and execution lifecycle

`tests/fixtures/brainbip-v1.json` is a **public, full-cost v1 test vector** including raw and normalized inputs, salts, intermediate outputs, mnemonic, BIP39 seed, and eighty addresses. **Never deposit funds to addresses derived from test vectors.** Its Argon2 output was generated with the independent noble-hashes JavaScript implementation; the normal test suite checks the hash-wasm production implementation against it. PBKDF2 and HD/address fixtures are independently checked with Node/OpenSSL and separate test encoders.

`tests/fixtures/brainbip-v2.json` is a separate **public, full-cost v2 test vector**. It uses the same public passphrase/email case with the fixed v2 salts and costs, and records its own intermediate outputs, twelve words, BIP39 seed, and eighty BTC/ETH/SOL/ZEC addresses. Its Argon2 output was generated with noble-hashes JavaScript; PBKDF2, BIP39 seed, and HD/address references use Node/OpenSSL and separate encoders. The production tests compare the complete Argon2 output and end-to-end wallet against this reference. V2 fixture generation does not replace or rewrite the original v1 fixture.

That original fixture remains unchanged. `tests/fixtures/monero-ledger-v1.json` records separate Monero extension vectors for the published Ledger test mnemonic and the original BrainBIP example. The official Ledger public-key and stagenet-address vectors verify the BIP39-to-Monero mapping. Both generated 25-word phrases were restored independently using **monero-ts 0.11.3's Monero C++ WebAssembly implementation**, with networking disabled; the native phrases round-tripped exactly and all twenty mainnet addresses per wallet matched. This includes primary index `0` and subaddress indexes `1…19`. Fixture provenance identifies the reference binary; the native reference is a verification tool, not a production dependency.

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
- [Ledger Monero key derivation](https://github.com/LedgerHQ/app-monero/blob/develop/src/monero_init.c) and [published Ledger tests](https://github.com/LedgerHQ/app-monero/blob/develop/tests/test_crypto.py)
- [Monero standard addresses](https://docs.getmonero.org/public-address/standard-address/) and [subaddresses](https://docs.getmonero.org/public-address/subaddress/)
- [Monero legacy mnemonic encoding](https://github.com/monero-project/monero/blob/master/src/mnemonics/electrum-words.cpp) and [English wordlist](https://github.com/monero-project/monero/blob/master/src/mnemonics/english.h)
- [Monero mnemonic recovery](https://www.getmonero.org/resources/user-guides/restore_account.html) and [Trezor Monero derivation compatibility](https://trezor.io/learn/supported-assets/other-cryptocurrencies/what-is-monero-and-how-does-it-work-with-trezor)
- [monero-ts native Monero WebAssembly reference](https://github.com/woodser/monero-ts)
- [hash-wasm implementation](https://github.com/Daninet/hash-wasm)
- [hash-wasm 4.12.0 Argon2 API](https://github.com/Daninet/hash-wasm/blob/v4.12.0/lib/argon2.ts)
- [WebAssembly memory allocation](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/Memory/Memory)

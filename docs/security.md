# Security model

BrainBIP is **experimental software with no independent security audit**. Published vectors and automated tests check specific derivation and interface behavior; they do not establish the security of the complete application or its custom construction.

## Guessing happens offline

Anyone who reproduces your inputs can reproduce the wallet. An attacker can test guesses against public addresses without contacting BrainBIP. There is no login server, rate limit, password reset, or recovery service.

Argon2id raises the memory and computation cost of each guess. PBKDF2 supplies a second, separately salted derivation branch. Their outputs are combined before generating twelve BIP39 words. This composition does **not** create entropy, and two branches do not imply twice the security. A predictable phrase remains predictable even when each guess costs more.

The fixed derivation has substantial memory and computation costs. A slower run in this browser is not a measurement of an attacker's optimized guessing cost, and it does not establish a specific security level. This remains a custom, unaudited construction.

Twelve BIP39 words encode 128 entropy bits plus a checksum. That is the output format's capacity, not proof that a user-chosen passphrase has 128 bits of strength. A longer output encoding adds no secrecy to the original inputs. Ordinary signing keys used by these chains are not post-quantum secure.

## Email and strength estimates

Email is a **public salt by default**, with zero estimated secret strength. A salt separates otherwise identical inputs and prevents shared precomputation; it is not assumed to be a secret.

The private-email switch starts **OFF**. Turning it on changes only the displayed estimate, never normalization, salts, recovery words, or addresses. The optional credit assumes the email name is unknown to an attacker and independent of the passphrase. The app cannot verify those assumptions. Exposure of the email removes that assumed benefit.

The estimator reports modelled guesswork, not measured entropy. Its private-email model excludes the domain, letter case, and `+tags`, rejects obvious overlap, and caps conditional credit at 32 estimate bits. The combined display is capped at 128. Neither cap is a calibrated security guarantee. English dictionaries have limited coverage for other languages, personal references, and unfamiliar patterns; long inputs are evaluated under a bounded model and marked as limited.

## Offline execution and secrets

The standalone HTML embeds its scripts, WebAssembly, fonts, and dictionaries. The app does not send inputs over the network or write them to browser storage. Its content security policy blocks network connections and external executable resources. Navigation links still open the pages selected by the user.

Use a verified local copy when working offline. A matching checksum detects a changed or corrupted file relative to the checksum source; it does not independently prove that source or application is trustworthy. Browser isolation cannot protect a secret from malicious code in the page itself, a compromised device, or an extension with access to the page.

Editing an input invalidates the generated results. Cancellation terminates the derivation worker. Reset terminates workers, clears visible data and the app's references, and restores the private-email switch to OFF. Leaving the page clears the app's inputs and results. Owned byte buffers are overwritten where possible, but JavaScript strings, library copies, WebAssembly memory, browser behavior, and operating-system memory prevent a complete erasure guarantee.

Copying is explicit. **Reset does not clear the system clipboard**, and other applications may retain copied contents. Hiding a recovery phrase conceals its visible text while the app still holds the result for later reveal or copy.

## Recovery depends on the exact mapping

The [derivation specification](derivation.md) defines one fixed input mapping for Bitcoin, Ethereum, Solana, and Zcash. App release versions identify software builds. Cost parameters never adapt to slower devices: a failed computation does not silently produce a different wallet.

Recovery from memory requires the same normalized passphrase, optional email salt, and mapping. Losing or changing those inputs can make the wallet inaccessible. Recovery from the generated BIP39 words requires the stated chain paths and an empty additional BIP39 passphrase; external wallet discovery varies.

All committed example phrases, keys, and addresses are **public test vectors**. Never deposit funds to them or submit real secrets in an issue, pull request, screenshot, or test fixture.

## Execution time and memory

The derivation requires 512 MiB of Argon2 memory plus browser and library overhead. WebAssembly support alone does not guarantee that a device can allocate this memory. Browser memory pressure or allocation limits can stop generation. There is no automatic reduction of cost.

An approximate ten-second generation time is a tuning target for a reference machine, not a promised duration on every device. Browser, hardware, available memory, and background load affect elapsed time. The interface reports elapsed time and actual stage boundaries, with indeterminate motion inside a stage. The bundled Argon2 API does not expose intermediate completion measurements. Completion is reported only after the actual computation returns.

See the [hash-wasm Argon2 API](https://github.com/Daninet/hash-wasm/blob/v4.12.0/lib/argon2.ts) and [WebAssembly memory allocation documentation](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/Memory/Memory) for these implementation limits.

## Reporting a problem

Report ordinary bugs through GitHub Issues using public test inputs. For a vulnerability, use **Report a vulnerability** in the repository's Security tab if private reporting is available. Otherwise, open an issue requesting a private contact channel without including exploit details or secrets. Never include actual recovery phrases, private keys, or personal wallet inputs in a report.

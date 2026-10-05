# Security model

BrainBIP is **experimental software with no independent security audit**. Published vectors and automated tests check specific derivation and interface behavior; they do not establish the security of the complete application or its custom construction.

## Guessing happens offline

Anyone who reproduces your inputs can reproduce the wallet. An attacker can test guesses against public addresses without contacting BrainBIP. There is no login server, rate limit, password reset, or recovery service.

Argon2id raises the memory and computation cost of each guess. PBKDF2 supplies a second, separately salted derivation branch. Their outputs are combined before generating 12- and 24-word BIP39 phrases. This composition does **not** create entropy, and two branches do not imply twice the security. A predictable phrase remains predictable even when each guess costs more.

The fixed derivation has substantial memory and computation costs. A slower run in this browser is not a measurement of an attacker's optimized guessing cost, and it does not establish a specific security level. This remains a custom, unaudited construction.

Twelve BIP39 words encode 128 entropy bits plus a four-bit checksum; 24 words encode 256 entropy bits plus an eight-bit checksum. These are the formats' capacities, not proof of 128 or 256 bits of input strength. Selecting 24 words adds no unpredictability to the original inputs. Ordinary signing keys used by these chains are not post-quantum secure.

The two phrases are **related outputs, not independent secrets**. The 12-word phrase uses the first 16 bytes of the same 32-byte value used by the 24-word phrase. Anyone with the 24 words can decode that entropy and reproduce the corresponding 12 words. The 12-word phrase does not directly reveal the remaining 16 bytes needed for the 24-word phrase, but the two share the same inputs and output bytes. Do not count them as independently generated wallet secrets. Do not truncate the 24 words to twelve: each length has a separately computed BIP39 checksum.

## Email and strength estimates

Email is a **public salt by default**, with zero estimated secret strength. A salt separates otherwise identical inputs and prevents shared precomputation; it is not assumed to be a secret.

The private-email switch starts **OFF**. Turning it on changes only the displayed estimate, never normalization, salts, recovery words, or addresses. The optional credit assumes the email name is unknown to an attacker and independent of the passphrase. The app cannot verify those assumptions. Exposure of the email removes that assumed benefit.

The estimator reports modelled guesswork, not measured entropy. Its private-email model excludes the domain, letter case, and `+tags`, rejects obvious overlap, and caps conditional credit at 32 estimate bits. Details retain the passphrase-only value alongside any conditional email credit. The combined model is capped at 128 estimate bits for **both word counts**. The estimate evaluates the inputs, so switching to 24 words does not raise it. Neither cap is a calibrated security guarantee.

The primary display shows **model bits and a compact strength meter**. These summarize estimated guesswork and are not measured entropy, completion progress, or proof that an input is safe. Details show the modelled guess count and the assumptions behind any conditional private-email credit.

A separate, plain time comparison uses an **assumed total guessing rate**. The default is one guess per second; details offer 0.1, 1, or 1,000 total guesses per second. The chosen rate stays visible. It represents the assumed combined rate of the entire attack, not a rate per device. It is not derived from this browser's running time, an attacker benchmark, or measured hardware capacity.

The comparison divides the modelled guess count by the chosen rate. It does not halve the count to report an average search time. The count is a model's estimate of guesswork, not an exhaustive set of equally likely passwords; the resulting time is neither a prediction of when a wallet will be found nor a guaranteed minimum. A better guessing model, knowledge of personal information, or a different total attack rate can change the result substantially.

Long durations show the full **approximate number of years with comma-separated digits**, including values beyond one hundred years. There is no time-axis endpoint or one-hundred-year display cap, and years are not abbreviated in scientific notation. The model's 128-bit cap still applies. Printing more digits does not make this modelled duration a more precise prediction.

English dictionaries have limited coverage for other languages, personal references, and unfamiliar patterns. Long inputs are evaluated under a bounded model and marked as limited. When the app identifies limited coverage, it shows that limitation instead of a confident time comparison. Even an unflagged input can contain a pattern or reference the model misses.

## Offline execution and secrets

The standalone HTML embeds its scripts, WebAssembly, fonts, and dictionaries. The app does not send inputs over the network or write them to browser storage. Its content security policy blocks network connections and external executable resources. Navigation links still open the pages selected by the user.

Use a verified local copy when working offline. A matching checksum detects a changed or corrupted file relative to the checksum source; it does not independently prove that source or application is trustworthy. Browser isolation cannot protect a secret from malicious code in the page itself, a compromised device, or an extension with access to the page.

Editing an input invalidates the generated results. Cancellation terminates the derivation worker. Reset terminates workers, clears visible data and the app's references, and restores the private-email switch to OFF. Leaving the page clears the app's inputs and results. Owned byte buffers are overwritten where possible, but JavaScript strings, library copies, WebAssembly memory, browser behavior, and operating-system memory prevent a complete erasure guarantee.

Copying is explicit. **Reset does not clear the system clipboard**, and other applications may retain copied contents. Hiding a recovery phrase conceals its visible text while the app still holds both word-count results for later selection, reveal, or copy. Switching word count hides the selected phrase and restores default address choices; it does not erase the other prepared phrase.

## Recovery depends on inputs and address choices

The [derivation specification](derivation.md) defines one fixed input-to-entropy computation, both word-count mappings, and the supported Bitcoin, Ethereum, Solana, and Zcash address choices. App release versions identify software builds. Cost parameters never adapt to slower devices: a failed computation does not silently produce a different wallet.

Recovery from memory requires the same normalized passphrase, optional email salt, and **word count**. Losing or changing the inputs can make the wallet inaccessible; selecting the other length leads to a different wallet. Recovery from the generated BIP39 words requires the complete phrase, an empty additional BIP39 passphrase, and the same chain path and address type; external wallet discovery varies.

Changing a path produces a different address list from the same selected recovery phrase. Save the word count, complete path and, for Bitcoin, the address type you used. Preset names describe a derivation convention; they do not guarantee that another wallet will discover every unused address. A custom path can be syntactically valid yet unsupported by the wallet you later use to restore.

Address selection is informational. It derives twenty public addresses locally from the current recovery phrase, without repeating the heavy KDF, checking balances, or signing transactions. The address worker closes after its result; changing the selection, editing an input, or resetting invalidates pending results. Custom paths are bounded to 160 characters and ten components with exactly one `{index}` placeholder. Solana accepts only hardened components, and custom Bitcoin paths require an explicit address format.

All committed example phrases, keys, and addresses are **public test vectors**. Never deposit funds to them or submit real secrets in an issue, pull request, screenshot, or test fixture.

## Execution time and memory

The derivation requires 512 MiB of Argon2 memory plus browser and library overhead. WebAssembly support alone does not guarantee that a device can allocate this memory. Browser memory pressure or allocation limits can stop generation. There is no automatic reduction of cost.

An approximate ten-second generation time is a tuning target for a reference machine, not a promised duration on every device. Browser, hardware, available memory, and background load affect elapsed time. The interface reports elapsed time and actual stage boundaries, with indeterminate motion inside a stage. The bundled Argon2 API does not expose intermediate completion measurements. Completion is reported only after the actual computation returns.

See the [hash-wasm Argon2 API](https://github.com/Daninet/hash-wasm/blob/v4.12.0/lib/argon2.ts) and [WebAssembly memory allocation documentation](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/Memory/Memory) for these implementation limits.

## Reporting a problem

Report ordinary bugs through GitHub Issues using public test inputs. For a vulnerability, use **Report a vulnerability** in the repository's Security tab if private reporting is available. Otherwise, open an issue requesting a private contact channel without including exploit details or secrets. Never include actual recovery phrases, private keys, or personal wallet inputs in a report.

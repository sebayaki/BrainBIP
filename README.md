<div align="center">

# BrainBIP

**A passphrase. Twelve words. Four chains.**

An offline-first experiment in deterministic wallet recovery.

![MIT license](https://img.shields.io/badge/license-MIT-171717)
![Status](https://img.shields.io/badge/status-in_development-bdff61)
![Runs locally](https://img.shields.io/badge/computation-on_your_device-171717)

</div>

---

BrainBIP turns a passphrase and an optional email salt into a BIP39 recovery phrase, then derives receiving addresses for Bitcoin, Ethereum, Solana, and Zcash.

The project is under development. The browser demo and downloadable offline edition are not published yet.

## What is being built

- **Deterministic recovery** — the same inputs and derivation version produce the same result.
- **Argon2id key derivation** — memory-intensive computation performed on your device.
- **Twelve recovery words** — a standard English BIP39 mnemonic.
- **Four chains** — the first twenty addresses for each supported derivation path; Zcash uses transparent addresses.
- **One downloadable HTML file** — open it locally without a server or network connection.
- **Local strength estimates** — feedback on password guessability, with assumptions made explicit.

## Security model

BrainBIP is an experimental project and has not received an independent security audit. A slow key derivation function increases the cost of guessing; it does not create entropy in a predictable passphrase. The twelve-word output does not guarantee 128 bits of input strength.

An email salt is not a second authentication factor. Anyone who knows or guesses the inputs can reproduce the wallet. Password strength feedback is an estimate, not a security guarantee.

## License

MIT. Third-party code retains its original copyright and license notices.

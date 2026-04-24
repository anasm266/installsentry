# Adversarial: `chdir` in lifecycle

This fixture documents a **limitation**: a `postinstall` script that calls `process.chdir(...)` can causeInstallSentry’s cwd-based package attribution to tag subsequent events with the wrong path (e.g. `install-root` or a parent path).

Use it in docs and, optionally, in an e2e test. It is not meant to be malicious, only to demonstrate a known gap described in [docs/THREAT-MODEL.md](../../../../docs/THREAT-MODEL.md) (from repo root).

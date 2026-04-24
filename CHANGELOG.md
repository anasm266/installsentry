# Changelog

All notable changes to this project are documented in this file.

## [0.1.1] - 2026-04-24

### Fixed

- `JSON.parse` no longer fails on `package.json`, `package-lock.json`, or InstallSentry config files saved as **UTF-8 with BOM** (common on Windows). Applies to the CLI, lockfile and graph readers, and `canary-substrings` load in the shim.

## [0.1.0] - 2026-04-24

### Added

- CLI: `scan`, `run` (HTML report, optional SARIF, `--ci`, network policy via `--allow-hosts` / `--deny-hosts` and project config files).
- Host and optional Docker install runners; composite GitHub Action under `.github/actions/installsentry/`.
- `package-lock.json` v3 parser, dependency graph, blast-radius analysis, cwd-based package attribution in shims.
- Runtime shim (`NODE_OPTIONS`) tracing fs, http(s), canary substrings; HTML report (Cytoscape) with focused graph views.
- Documentation: `docs/THREAT-MODEL.md`, `docs/samples/`, test fixtures (including malware canary demo and adversarial scaffolds).

[0.1.1]: https://github.com/anasm266/installsentry/releases/tag/v0.1.1
[0.1.0]: https://github.com/anasm266/installsentry/releases/tag/v0.1.0

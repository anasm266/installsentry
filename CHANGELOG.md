# Changelog

All notable changes to this project are documented in this file.

## Unreleased

## [2.0.0] - 2026-05-26

### Added

- **pnpm** and **Yarn Berry** support with package-manager auto-detection (`--package-manager`).
- CI policy modes: `--policy balanced|strict|custom` and extended `.installsentry.yaml` schema (`version: 1`).
- JSON report output (`--format json|both`) with schema version `installsentryReportVersion: "1.0"`.
- `installsentry diff` compares `.installsentry/last-run.json` to a saved baseline; `--save-baseline` writes baseline JSON.
- Expanded runtime shim: `fetch`, sync filesystem writes, `dns.lookup`, `net.connect`, `tls.connect`, `execFile`, `fork`, sync spawn variants; propagates shim to child `node` via `NODE_OPTIONS`.
- Finding `id`, `title`, and attribution `confidence` (npm lifecycle env + cwd).
- Evasion hints (low severity) for CI/sandbox environment probes.
- Docker `--docker-network none` for isolated installs.
- SARIF: `helpUri`, `relatedLocations` for blast-radius paths.
- GitHub Action inputs: `policy`, `format`, `package-manager`, `docker-network`, `installsentry-version`.
- Docs: [PACKAGE-MANAGERS.md](docs/PACKAGE-MANAGERS.md), [COMPARISON.md](docs/COMPARISON.md), [MIGRATION-v1-to-v2.md](docs/MIGRATION-v1-to-v2.md), [JSON-REPORT-SCHEMA.md](docs/JSON-REPORT-SCHEMA.md).

### Changed

- Lockfile parsing refactored under `src/lockfile/` (npm, pnpm, yarn adapters).
- `installsentry run --ci` defaults to **balanced** network policy; `installsentry ci` stays **strict**.

## [0.2.0] - 2026-05-26

### Added

- CLI can now run the current working directory by default with `installsentry`.
- Added `installsentry demo`, which generates a temporary harmless demo project that simulates install-time secret exfiltration and writes `installsentry-demo-report.html`.
- `installsentry scan` and `installsentry run` now default to the current working directory when no path is provided.
- Unsupported project errors now clearly list missing required files.
- `installsentry run` now prints a severity-sorted terminal summary with top risks, observed lifecycle packages, network hosts, secret canary hits, and report paths.
- Reworked the README and npm package description around a simpler demo-first message: see what npm packages do during install.
- Added `--docker` as a convenience alias for `--runner docker`.
- Added constrained npm command selection with `--npm-command install|ci` and a CI-oriented `installsentry ci` command that defaults to `npm ci` with policy gating enabled.
- CI failures now print specific secret canary findings, network policy violations, allowed hosts, and suggested fixes.
- HTML reports now include severity counts and a top-level Findings section that mirrors the CLI risk summary.

[2.0.0]: https://github.com/anasm266/installsentry/releases/tag/v2.0.0
[0.2.0]: https://github.com/anasm266/installsentry/releases/tag/v0.2.0

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

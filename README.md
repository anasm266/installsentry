# InstallSentry

See what packages do during install.

InstallSentry replays a real install from your lockfile in a temporary sandbox, traces lifecycle scripts, filesystem access, network calls, and fake secret canary exposure, then writes an HTML report (and optional JSON or SARIF for CI). It maps behavior back to your dependency graph with blast-radius paths.

**Supported package managers:** npm (`package-lock.json` v3), **pnpm** (`pnpm-lock.yaml`), **Yarn Berry** (`yarn.lock` with `__metadata`). Auto-detected, or set `--package-manager`.

[![CI](https://github.com/anasm266/installsentry/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/anasm266/installsentry/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/installsentry.svg)](https://www.npmjs.com/package/installsentry)
[![npm downloads](https://img.shields.io/npm/dm/installsentry.svg)](https://www.npmjs.com/package/installsentry)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Try the demo

Run a harmless generated demo that simulates install-time secret exfiltration:

```bash
npx installsentry@2 demo
```

Example output:

```txt
InstallSentry found 3 install-time risks

CRITICAL  packages/malice-local      sent fake AWS secret canary to example.com
MEDIUM    Project install (npm)      made POST request to registry.npmjs.org
MEDIUM    packages/malice-local      made GET request to example.com

Observed:
  1 package with lifecycle scripts
  2 outbound network hosts
  1 secret canary hit

Report: installsentry-demo-report.html
```

## Run it on your project

From a project with `package.json` and a supported lockfile:

```bash
npx installsentry@2
```

This analyzes the current directory and writes `installsentry-report.html`. JSON output is available with `--format json` or `--format both`.

```bash
npx installsentry@2 --format both -o installsentry-report.html
```

## What it catches

- Lifecycle scripts declared in your lockfile (`preinstall`, `install`, `postinstall`, `prepare`, and related hooks).
- Node filesystem reads and writes during install (including common sync APIs).
- Node HTTP(S) and `fetch` traffic during install.
- DNS lookups and TCP/TLS connects (logged for visibility).
- Fake secret canary values read from files or embedded in outbound URLs.
- Low-severity **evasion hints** when install code probes CI or sandbox environment variables.
- Blast-radius paths from suspicious behavior back through your dependency graph.
- Package attribution with a **confidence** label (cwd + npm lifecycle environment when available).

## What it cannot prove

InstallSentry is an observational tool, not a malware scanner or a safety guarantee. Native binaries, shells that spawn non-Node children without the shim, other runtimes, and deliberately evasive code can still hide activity. Use Docker mode for stronger isolation and read the [threat model](docs/THREAT-MODEL.md) before relying on it as a CI gate.

## How this compares to other tools

| Tool | Primary question |
| --- | --- |
| `npm audit` | Are there known CVEs in my resolved versions? |
| Socket / Snyk (metadata) | Does package source or metadata look risky? |
| LavaMoat `allow-scripts` | Which lifecycle scripts am I willing to run? |
| **InstallSentry** | What did **this traced install** actually do on my lockfile? |

InstallSentry is complementary, not a replacement. See [docs/COMPARISON.md](docs/COMPARISON.md).

## Install

Requires **Node.js 20+** and the package manager you are analyzing (`npm`, `pnpm`, or `yarn`) on `PATH`.

```bash
npm install -g installsentry
```

Or run without a global install:

```bash
npx installsentry@2 --version
```

Windows PowerShell:

```powershell
npx.cmd --yes installsentry@2 --version
```

## Commands

```bash
# Analyze the current project (auto-detect package manager)
installsentry

# Harmless demo with simulated exfiltration
installsentry demo

# List lockfile packages that declare lifecycle scripts
installsentry scan

# Analyze another path
installsentry run /path/to/your-app -o report.html

# JSON report for automation
installsentry run . --format json -o report.json

# Replay frozen install (npm ci / pnpm frozen / yarn immutable)
installsentry run . --npm-command ci
installsentry ci

# Explicit package manager
installsentry run . --package-manager pnpm

# Save baseline and diff on the next run (PR workflows)
installsentry run . --save-baseline
installsentry diff .

# Docker isolation
installsentry run . --docker -o report.html
installsentry run . --docker --docker-network none -o report.html
```

Open the HTML report in a browser. It includes severity counts, a findings table, lifecycle script previews, secret-canary alerts, network egress, blast-radius paths, and an interactive dependency graph.

## How it works

1. **Parse** your lockfile into a dependency graph and flag packages with lifecycle scripts.
2. **Copy** manifests, lockfiles, local `packages/`, and the trace shim into a temp workspace.
3. **Replay** install (`npm install` / `npm ci`, `pnpm install`, or `yarn install`) on the host or inside Docker.
4. **Instrument** Node via `NODE_OPTIONS` — filesystem, HTTP(S), `fetch`, DNS/TCP, subprocess spawns; child `node` processes receive the shim when possible.
5. **Inject** fake canary secrets into the environment (never your real tokens).
6. **Analyze** trace events into severity-sorted findings with attribution confidence.
7. **Emit** HTML (default), optional JSON, and optional SARIF 2.1.0.

## Configuration

Optional project config (first match wins): `.installsentry.yaml`, `.installsentry.yml`, `installsentry.json`, `.installsentry.json`.

Example ([docs/samples/example.installsentry.yaml](docs/samples/example.installsentry.yaml)):

```yaml
version: 1

ci:
  policy: balanced          # balanced | strict | custom
  allowHosts:
    - registry.npmjs.org
  denyHosts:
    - example.com
  failOn:
    - secret-canary
    - denied-network

runner:
  mode: host                # host | docker
  dockerImage: node:20-bookworm-slim
  dockerNetwork: default      # default | none

report:
  output: installsentry-report.html
  format: both              # html | json | both
  sarif: installsentry.sarif

baseline:
  path: .installsentry/baseline.json
```

CLI flags override config where noted in `--help`.

## CI, policy, and SARIF

| Mode | Secret canaries | Network in CI |
| --- | --- | --- |
| `strict` | Fail | Fail unless host is allowlisted (default for `installsentry ci`) |
| `balanced` | Fail | Fail only on `denyHosts` (good default for `installsentry run --ci`) |
| `custom` | Per `failOn` in config | Per `failOn` in config |

```bash
installsentry ci ./my-app \
  --allow-hosts registry.npmjs.org \
  --policy strict \
  -o report.html \
  --sarif results.sarif \
  --format both
```

- `--ci` — exit non-zero when policy fails.
- `--policy` — `balanced`, `strict`, or `custom`.
- `--allow-hosts` / `--deny-hosts` — network allow/deny lists.
- `--sarif <file>` — SARIF 2.1.0 for GitHub code scanning (includes `helpUri` and blast-radius `relatedLocations`).

When CI fails, the CLI prints specific secret hits, network violations, allowed hosts, and suggested fixes.

## Docker

```bash
installsentry run ./my-app --docker -o report.html
installsentry run ./my-app --docker --docker-image node:20-bookworm-slim -o report.html
installsentry run ./my-app --docker --docker-network none -o report.html
```

`--docker` is shorthand for `--runner docker`. On Windows, use Docker Desktop and ensure the temp directory volume is shareable if installs fail.

## GitHub Actions

**Recommended:** `npx` with a pinned major version:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 20
- run: npx --yes installsentry@2 ci . --allow-hosts registry.npmjs.org --sarif installsentry.sarif --format both
- uses: github/codeql-action/upload-sarif@v3
  if: always()
  with:
    sarif_file: installsentry.sarif
```

**Composite action** in this repo ([`.github/actions/installsentry/action.yml`](.github/actions/installsentry/action.yml)):

```yaml
- uses: anasm266/installsentry/.github/actions/installsentry@v2
  with:
    project-path: .
    command: ci
    policy: strict
    allow-hosts: registry.npmjs.org
    sarif-output: installsentry.sarif
    format: both
```

For PowerShell-based Windows jobs, use `npx.cmd`.

## Example report

<p align="center">
  <img src="docs/images/report-example.png" alt="InstallSentry HTML report: findings, alerts, network list, and dependency graph" width="100%" />
</p>

Reference run on the canary demo scenario included in this repository.

## Limitations

| Area | Note |
| --- | --- |
| Lockfiles | npm lockfile v3; pnpm `pnpm-lock.yaml`; Yarn Berry only (not Yarn Classic v1). |
| Tracing | Node shim only; native binaries and unshimmed children are blind spots. |
| Attribution | cwd + npm lifecycle env with confidence labels; still imperfect after `chdir` or exotic spawns. |
| Trust | Visibility and policy gates — not proof of safety. |

Details: [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md). Migrating from 0.x: [docs/MIGRATION-v1-to-v2.md](docs/MIGRATION-v1-to-v2.md).

## Documentation

| Doc | Purpose |
| --- | --- |
| [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md) | What the tool can and cannot prove |
| [docs/PACKAGE-MANAGERS.md](docs/PACKAGE-MANAGERS.md) | npm, pnpm, and Yarn Berry support |
| [docs/COMPARISON.md](docs/COMPARISON.md) | vs audit, Socket, LavaMoat |
| [docs/JSON-REPORT-SCHEMA.md](docs/JSON-REPORT-SCHEMA.md) | Machine-readable report format |
| [docs/MIGRATION-v1-to-v2.md](docs/MIGRATION-v1-to-v2.md) | Upgrading to 2.0 |
| [docs/samples/](docs/samples/) | Config and report examples |
| [CHANGELOG.md](CHANGELOG.md) | Release history |

## Contributing

Pull requests and issue reports are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for how to build and test locally.

## License

MIT

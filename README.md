# InstallSentry

> See what **npm install** really does: trace lifecycle scripts, file and network access, and fake “secret” reads—then map findings onto your **package-lock.json** dependency graph with an HTML report and optional **SARIF** for CI.

[![CI](https://github.com/anasm266/installsentry/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/anasm266/installsentry/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/installsentry.svg)](https://www.npmjs.com/package/installsentry)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Install

**Node.js 20+** and **npm** with a **`package-lock.json` (lockfile version 3)** at the project root you analyze.

```bash
npm install -g installsentry
```

Or run without a global install:

```bash
npx installsentry@latest --version
```

**Windows (PowerShell):** If `npx installsentry` is not found, use:

```powershell
npx.cmd --yes installsentry@latest --version
```

or install locally: `npm i installsentry` then `npx.cmd installsentry` or `node node_modules\installsentry\dist\cli.js`.

## Quick start

```bash
# List packages (from the lockfile) that declare install-time scripts
installsentry scan /path/to/your-app

# Run a sandboxed copy of `npm install`, trace behavior, write a report
installsentry run /path/to/your-app -o report.html
```

Open `report.html` in a browser. The report includes secret-canary hits, network egress, blast-radius paths, and an interactive dependency graph (large projects default to a **focused** view; use the graph menu to switch modes).

## What it does

- **Parses** `package-lock.json` v3 into a dependency graph and flags packages with **lifecycle** scripts (e.g. `preinstall` / `postinstall` / `prepare` / `prepack` / `postpack` / `prepublishOnly`, and related hooks).
- **Runs** a fresh **`npm install`** in a **temporary copy** of your project (on the host, or optionally **inside Docker**).
- **Injects** a small **Node shim** so filesystem reads, HTTP(S) traffic, and subprocess spawns from that install are logged. Fake canary values in the environment can be **detected** if a script reads or exfiltrates them.
- **Writes** a self-contained **HTML report** and can emit **SARIF 2.1.0** for tools like GitHub code scanning.
- **CI mode (`--ci`)** can **fail the process** if canary rules or your **network policy** are violated (see below).

**What it is not:** a general malware scanner or a guarantee of safety. It is an **observational** tool for install-time behavior. Read the **[threat model](docs/THREAT-MODEL.md)** for scope, limits, and evasion.

## CI, network policy, and SARIF

- **`--ci`** — Exit with a non-zero code when the analysis fails your policy. By default, **any outbound HTTP(S)** in the trace counts as a failure (plus secret-canary rules). For real projects that must talk to the **registry**, use an **allow list** of hostnames.
- **`--allow-hosts`** — Comma-separated hosts (e.g. `registry.npmjs.org`). You can set the same in a project config file: **`.installsentry.yaml`**, **`.installsentry.json`**, or `installsentry.json` (see [docs/samples/example.installsentry.yaml](docs/samples/example.installsentry.yaml)).
- **`--deny-hosts`** — Hosts that always fail, even if allowlisted.
- **`--sarif <file>`** — Write SARIF alongside the HTML report; useful with `upload-sarif` in GitHub Actions.

```bash
installsentry run ./my-app --ci --allow-hosts "registry.npmjs.org" -o report.html --sarif results.sarif
```

## Docker (optional)

Run the install step inside a container (requires [Docker](https://docs.docker.com/get-docker/) on `PATH`):

```bash
installsentry run ./my-app -o report.html --runner docker --docker-image node:20-bookworm-slim
```

On Windows, use Docker Desktop and ensure the temp directory volume is shareable if installs fail.

## Use in GitHub Actions

**Simplest:** use the published CLI with `npx` (no need to clone this repo):

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 20
- run: npx.cmd --yes installsentry@0.1.0 run ./my-app -o report.html
  # Or: npx --yes installsentry@0.1.0 (macOS/Linux)
```

To run the **composite action** in this repository (it builds the CLI from source in the workflow), see [`.github/actions/installsentry/action.yml`](.github/actions/installsentry/action.yml) and the note in [CONTRIBUTING.md](CONTRIBUTING.md#in-repo-github-action).

## Example report

<p align="center">
  <img src="docs/images/report-example.png" alt="InstallSentry HTML report: alerts, network list, and dependency graph" width="100%" />
</p>

*Reference run on the canary demo scenario included in the GitHub repository.*

## Limitations (short)

| Area | Note |
|------|------|
| **Lockfile** | `package-lock.json` **v3** only. |
| **Client** | **npm** install semantics; not pnpm/Yarn lockfiles in this version. |
| **Attribution** | Package column is derived from **working directory** under the project root; scripts that **`chdir`** or spawn an unshimmed child **Node** can mis-attribute events. |
| **Trust** | Use for visibility and policy gates, not as a replacement for full security review. |

Details: **[docs/THREAT-MODEL.md](docs/THREAT-MODEL.md)** — samples and policy templates: **[docs/samples/](docs/samples/)**.

## Documentation

| Doc | Purpose |
|-----|--------|
| [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md) | What the tool can and cannot prove; evasion notes |
| [docs/samples/](docs/samples/) | Config examples, SARIF, policy |
| [CHANGELOG.md](CHANGELOG.md) | Release history |

## Contributing

Pull requests and issue reports are welcome. See **[CONTRIBUTING.md](CONTRIBUTING.md)** for how to build and test locally.

## License

MIT

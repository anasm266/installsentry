# Contributing to InstallSentry

## Build from source

**Requirements:** Node 20+, npm, git.

```bash
git clone https://github.com/anasm266/installsentry.git
cd installsentry
npm ci
npm run build
node dist/cli.js --version
node dist/cli.js run ./tests/fixtures/malware-demo -o report.html
```

- **Tests:** `npm test` (watch) or `npm run test:all` (CI-style).
- **Lint:** `npm run lint` (TypeScript `noEmit` after build).

## README screenshot

After UI changes to the HTML report, refresh the image in the main README with:

```bash
npm run docs:screenshot
```

Requires a browser the script can drive (e.g. Playwright on Linux/macOS, or Edge on Windows).

## In-repo GitHub Action

The composite action at [`.github/actions/installsentry/action.yml`](.github/actions/installsentry/action.yml) is meant for workflows that **check out this repo and build** `dist/` first. For most consumers, `npx installsentry@<version> run …` in a workflow (see the main [README](README.md)) is simpler.

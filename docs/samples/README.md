# Example reports and policy snippets

## Regenerate sample HTML (malware demo)

From the **repository root** after a build:

```bash
npm run build
node dist/cli.js run tests/fixtures/malware-demo -o docs/samples/malware-demo-example.html
```

A committed `malware-demo-example.html` in this folder is a **static snapshot** for documentation; re-run the command to refresh it after report UI changes. This fixture includes intentional fake “secret” and outbound URL canaries for local testing only.

## CI with a registry allowlist (optional)

The default `--ci` mode flags **any** network egress, which is often too strict (npm talks to the registry). Use an allowlist, for example:

```bash
node dist/cli.js run ./path/to/your-app --ci --allow-hosts "registry.npmjs.org" -o report.html
```

## Config file: `.installsentry.yaml`

Example at [`example.installsentry.yaml`](example.installsentry.yaml) (same keys in `.installsentry.json` or `installsentry.json` also work). Place the file in the project you are analyzing (the `<path>` passed to `run`).

See the [threat model](../THREAT-MODEL.md) and the [GitHub Action](../../.github/actions/installsentry/action.yml) for `upload-sarif` and **network policy** context.

## SARIF (optional)

```bash
node dist/cli.js run ./path/to/your-app -o report.html --sarif out.sarif
```

SARIF uses the same network policy you pass on the CLI or in config, so `upload-sarif` and `--ci` stay consistent.

## Network policy anchor

- **Strict (default, no `allowHosts` in config, no `--allow-hosts`)**: any outbound request fails `--ci` (in addition to secret canary hits).
- **Allowlist**: set `--allow-hosts` or `ci.allowHosts` in a config file. Hosts are compared case-insensitively, with optional port stripped (`host:443` -> `host`).
- **Denylist**: `ci.denyHosts` or `--deny-hosts` always fails a matching host even if on the allow list.

```yaml
# Reference only — use example.installsentry.yaml in the repo for a real file
ci:
  allowHosts:
    - registry.npmjs.org
  denyHosts: []
```

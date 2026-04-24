# Config examples and policy

Use these patterns in **your own** project (the path you pass to `installsentry run`).

## Network policy

- **Strict (default for `--ci`):** any HTTP(S) from the traced install can fail the gate, unless you allow hosts.
- **Allow list:** `installsentry run ./my-app --ci --allow-hosts "registry.npmjs.org"` (comma-separated).
- **Deny list:** `--deny-hosts` (or `ci.denyHosts` in a config file) always fails those hosts.

## Config file

Copy [example.installsentry.yaml](example.installsentry.yaml) to your app root as **`.installsentry.yaml`**, or use **JSON** (`.installsentry.json` / `installsentry.json`) with the same `ci` keys.

## SARIF

```bash
installsentry run ./my-app -o report.html --sarif results.sarif
```

SARIF uses the same network policy as `--ci` (CLI flags and/or config file).

## GitHub Code Scanning

Use `actions/upload-sarif` with the file from `installsentry run … --sarif`. The [main README](https://github.com/anasm266/installsentry#use-in-github-actions) has a `npx` example; the [composite action](https://github.com/anasm266/installsentry/blob/master/.github/actions/installsentry/action.yml) offers an optional `sarif-output` input if you build the tool from a checkout in CI.

## Reference canary scenario

The repository includes a **test-only** demo that simulates canary exfiltration for **local** learning. It is not part of the npm package. To run it, clone the repo and use the path `tests/fixtures/malware-demo` as in the main README example screenshot. Do not use that scenario against systems you do not own.

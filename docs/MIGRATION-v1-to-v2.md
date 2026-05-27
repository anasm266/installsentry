# Migrating to InstallSentry 2.0

## Breaking changes

- **Multi-ecosystem:** Projects without `package-lock.json` may now be analyzed if `pnpm-lock.yaml` or Yarn Berry `yarn.lock` is present.
- **Findings model:** JSON/SARIF consumers should use stable finding `id` fields (`secret-canary-network`, `network-egress`, etc.).
- **CI policy:** New `--policy balanced|strict|custom` flag. `installsentry ci` remains **strict** by default; `installsentry run --ci` defaults to **balanced**.

## New features

- `--format json|both` for machine-readable output
- `installsentry diff` for baseline comparison
- `--docker-network none` for stronger Docker isolation
- `--save-baseline` to write `.installsentry/baseline.json`
- Expanded Node shim: `fetch`, sync FS, `dns`, `net.connect`, child `node` NODE_OPTIONS propagation

## Config file (optional)

```yaml
version: 1
ci:
  policy: balanced
  allowHosts:
    - registry.npmjs.org
  denyHosts: []
report:
  format: both
  sarif: installsentry.sarif
runner:
  mode: host
  dockerNetwork: default
```

## From 0.2.x

No lockfile format changes for npm. Bump dependency and update GitHub Actions to `npx installsentry@2`.

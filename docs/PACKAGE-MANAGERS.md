# Package manager support

InstallSentry **2.0** supports:

| Manager | Lockfile | Install replay |
| --- | --- | --- |
| npm | `package-lock.json` v3 | `npm install` / `npm ci` |
| pnpm | `pnpm-lock.yaml` | `pnpm install` / frozen lockfile |
| Yarn Berry | `yarn.lock` with `__metadata` | `yarn install` / `--immutable` |

## Auto-detection

Priority:

1. `--package-manager npm|pnpm|yarn`
2. `package.json` `packageManager` field (Corepack)
3. Lockfile presence: `pnpm-lock.yaml` → `yarn.lock` → `package-lock.json`

## Workspaces

Local `packages/` directories are copied into the sandbox workspace for npm and pnpm projects.

## Limitations

- Yarn Classic (v1) lockfiles without `__metadata` are not supported.
- `package-lock.json` v2 and older are not supported.
- Install replay requires the package manager binary on `PATH`.

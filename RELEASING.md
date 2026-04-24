# Releasing to npm

## Before the first publish

1. **Name** — `installsentry` is available on the public registry (verify: `npm view installsentry` should 404 before publish).
2. **Build** — `npm run build` produces `dist/`; `npm pack --dry-run` lists `dist/`, `README.md`, `LICENSE`, and `CHANGELOG.md` in the tarball (per `package.json` `"files"`).
3. **Login** — `npm login` (or `npm adduser`); 2FA on the npm account is recommended.
4. **One-time access** — If the package is scoped, set `publishConfig` in `package.json`. Unscoped public packages need no `publishConfig`.

## Publish

From a clean `git` tree on `master` (or your release branch), with tests green:

```bash
npm whoami
npm run test:all
npm publish --access public
```

`prepublishOnly` runs `npm run test:ci` automatically (build + tests + lint).

## After publish

1. **Tag the release in git** (match `version` in `package.json`):

   ```bash
   git tag -a v0.1.0 -m "v0.1.0"
   git push origin v0.1.0
   ```

2. **GitHub** — Create a [Release](https://github.com/anasm266/installsentry/releases) for that tag; attach the npm version in the description; link to `CHANGELOG.md`.

3. **Smoke test** (any machine):

   ```bash
   npx installsentry@0.1.0 --version
   npx installsentry@0.1.0 run path/to/your-app -o report.html
   ```

## Version bumps

- For `0.1.1` patch: update `version` in `package.json` and add a `CHANGELOG.md` section, then tag `v0.1.1`.
- For breaking changes later, consider `1.0.0` and document in `CHANGELOG.md`.

## What is not in the npm package

- Source TypeScript, tests, and `docs/` are **not** in the published tarball (by design). They remain on GitHub. Users only need `npx installsentry` and a project with `package-lock.json` v3.

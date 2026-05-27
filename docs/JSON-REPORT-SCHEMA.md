# JSON report schema

InstallSentry writes machine-readable reports when using `--format json` or `--format both`.

## Version

`installsentryReportVersion`: `"1.0"` — pin this field in CI consumers.

## Top-level fields

| Field | Type | Description |
| --- | --- | --- |
| `installsentryReportVersion` | string | Schema version |
| `installsentryVersion` | string | CLI package version |
| `generatedAt` | string | ISO-8601 timestamp |
| `target` | object | `{ name, version }` from root `package.json` |
| `packageManager` | string | `npm`, `pnpm`, or `yarn` |
| `nodeVersion` | string | Node.js version used for the run |
| `findings` | array | Severity-sorted findings (see below) |
| `analysis` | object | Counts: secret hits, network, trace events, lifecycle packages |
| `graph` | object | Node/edge counts and lifecycle package list |
| `policy` | object | Optional `{ mode, ciPassed }` when CI policy is active |

## Finding object

| Field | Type |
| --- | --- |
| `id` | string e.g. `secret-canary-network`, `network-egress` |
| `severity` | `CRITICAL` \| `HIGH` \| `MEDIUM` \| `LOW` |
| `package` | string display name |
| `title` | string short title |
| `detail` | string human-readable detail |
| `evidence` | object optional |
| `attribution` | `{ cwdPackage, npmPackageName?, npmLifecycleEvent?, confidence }` |

## Baseline workflow

1. `installsentry run . --save-baseline` → `.installsentry/baseline.json`
2. Each run also writes `.installsentry/last-run.json`
3. `installsentry diff .` compares last run to baseline

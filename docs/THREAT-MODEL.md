# Threat model and limitations

InstallSentry is an **observational** tool: it replays a sandboxed `npm install` and records what the **instrumented Node.js process** can see. It is **not** a guarantee that a dependency tree is “safe” or “malware-free”.

## What the tool is designed to surface

| Observation | Source |
|-------------|--------|
| **Filesystem reads** of files whose content matches known canary substrings (fake “secrets”) | Shim wraps `fs.readFile` / `readFileSync` |
| **Outbound HTTP(S)** to hosts and URLs, including canary substrings in URLs (exfil in query/body) | Shim wraps `http` / `https` |
| **Subprocess** creation (Node sees `child_process` calls that go through the patched API) | Logged, not used for policy by default |
| **Approximate “which package”** for a trace line | `process.cwd()` under `INSTALLSENTRY_PROJECT_ROOT` (or legacy env fallback) |

The **lockfile** (`package-lock.json` v3, **npm** only in this project) is turned into a **dependency graph**. Events attributed to a lockfile id can be mapped to **blast-radius paths** toward the root.

## What is inferred vs. proven

- **Blast paths** are graph walks from a suspicious node; they are only as good as the lockfile and attribution.
- **“Lifecycle scripts” in the graph** are detected by reading `package.json` in each lockfile path and looking for **script names** InstallSentry treats as install-time (see [graph.ts](../src/graph.ts)). The tracer does not prove npm actually ran a given script in your environment, only that the project declares it.

## Out of scope and known blind spots

1. **No shim in a child** — If a script spawns a **new** `node` process without the injected `--require` shim, that process is **not** traced. Native binaries, `bash -c`, other runtimes, etc. are not instrumented.
2. **`chdir` / workers** — If a script changes the working directory or uses worker threads, attribution may be **wrong** or incomplete.
3. **Non-Node I/O** — The shim only patches Node’s built-in modules. Operations through native add-ons, direct syscalls, or unhooked code paths are invisible.
4. **Malicious or altered registry** — A compromised or MITM’d registry can serve different tarballs; this tool does not verify **integrity** of tarballs from the network beyond your lockfile metadata.
5. **pnpm / Yarn** — This codebase targets **npm** and **lockfile v3** only. Other clients are not supported in the current parser and sandbox story.
6. **Policy vs. “any network”** — With a **host allowlist** in CI, traffic to the registry and other allowlisted hosts is permitted for the **gate**; other traffic still appears in the report as network egress. Denylist always fails matching hosts. See [docs/samples/README.md](samples/README.md#network-policy-anchor) and the main [README](../README.md) for flags and the [`example.installsentry.yaml`](samples/example.installsentry.yaml) template.
7. **Docker runner** — Optional. Isolation depends on the container runtime and how volumes are mounted; it is **defense in depth**, not a formal sandbox proof.

## Responsible use

Use the official **malware demo fixture** and similar tests only on machines and repositories you are allowed to run experiments on. Do not use the tool to attack or probe third-party systems.

## How malware might evade this design

- Run malicious logic in **subprocesses** that do not load the shim, or in **binaries** shipped with a package.
- Exfiltrate on **first connection** to an allowlisted host if policy is too broad.
- Trigger behavior only when **not** in a clean sandbox (e.g. environment/hostname checks not visible to the trace).
- Keep malicious behavior in **minified** or obfuscated `postinstall` with no canary and no disallowed host under your current policy (you would not fail `--ci` until policy or heuristics catch it).

Use this document when evaluating whether InstallSentry is appropriate for your org’s **supply-chain visibility** and **CI gates**—and pair it with dependency review, pinning, audit policies, and runtime hardening as needed.

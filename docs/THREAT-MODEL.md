# Threat model and limitations

InstallSentry is an **observational** tool: it replays a sandboxed package-manager install (`npm`, `pnpm`, or Yarn Berry) and records what the **instrumented Node.js process** can see. It is **not** a guarantee that a dependency tree is “safe” or “malware-free”.

## What the tool is designed to surface

| Observation | Source |
|-------------|--------|
| **Filesystem reads** of files whose content matches known canary substrings (fake “secrets”) | Shim wraps `fs.readFile` / `readFileSync` |
| **Outbound HTTP(S)** to hosts and URLs, including canary substrings in URLs (exfil in query/body) | Shim wraps `http` / `https` and global `fetch` |
| **DNS / TCP** | `dns.lookup`, `net.connect`, `tls.connect` (logged) |
| **Subprocess** creation | `spawn`, `exec`, `execFile`, `fork`, and sync variants (logged) |
| **Approximate “which package”** | `process.cwd()` under project root plus npm lifecycle env when present; confidence label on findings |

The **lockfile** (`package-lock.json` v3, `pnpm-lock.yaml`, or Yarn Berry `yarn.lock`) is turned into a **dependency graph**. Events attributed to a lockfile id can be mapped to **blast-radius paths** toward the root.

## What is inferred vs. proven

- **Blast paths** are graph walks from a suspicious node; they are only as good as the lockfile and attribution.
- **“Lifecycle scripts” in the graph** are detected by reading `package.json` in each lockfile path and looking for **script names** in `LIFECYCLE_SCRIPT_NAMES` ([`src/graph.ts`](../src/graph.ts)). The tracer does not prove npm actually ran a given script in your environment, only that the project declares it.

## Out of scope and known blind spots

1. **Child processes** — The shim attempts to pass `NODE_OPTIONS` to spawned `node` children, but shells, non-node binaries, and processes that clear env are still blind spots.
2. **`chdir` / workers** — If a script changes the working directory or uses worker threads, attribution may be **wrong** or incomplete.
3. **Non-Node I/O** — The shim only patches Node’s built-in modules. Operations through native add-ons, direct syscalls, or unhooked code paths are invisible.
4. **Malicious or altered registry** — A compromised or MITM’d registry can serve different tarballs; this tool does not verify **integrity** of tarballs from the network beyond your lockfile metadata.
5. **Yarn Classic / lockfile v2** — Not supported. Yarn Berry and pnpm use simplified lockfile parsers; complex workspace graphs may be incomplete.
6. **Policy modes** — `strict` fails on non-allowlisted network; `balanced` fails on canaries and denylisted hosts only. See [Config examples](samples/README.md) and [example.installsentry.yaml](samples/example.installsentry.yaml).
7. **Docker runner** — Optional. Isolation depends on the container runtime and how volumes are mounted; it is **defense in depth**, not a formal sandbox proof.

## Responsible use

Use the official **malware demo fixture** and similar tests only on machines and repositories you are allowed to run experiments on. Do not use the tool to attack or probe third-party systems.

## How malware might evade this design

- Run malicious logic in **subprocesses** that do not load the shim, or in **binaries** shipped with a package.
- Exfiltrate on **first connection** to an allowlisted host if policy is too broad.
- Trigger behavior only when **not** in a clean sandbox (e.g. environment/hostname checks not visible to the trace).
- Keep malicious behavior in **minified** or obfuscated `postinstall` with no canary and no disallowed host under your current policy (you would not fail `--ci` until policy or heuristics catch it).

Use this document when evaluating whether InstallSentry is appropriate for your org’s **supply-chain visibility** and **CI gates**—and pair it with dependency review, pinning, audit policies, and runtime hardening as needed.

# How InstallSentry compares

InstallSentry is **complementary** to other supply-chain tools. It answers a different question.

| Tool | Primary question |
| --- | --- |
| **npm audit** | Are there known CVEs in my resolved versions? |
| **Socket / Snyk** | Does package source/metadata look risky before install? |
| **LavaMoat allow-scripts** | Which lifecycle scripts am I willing to run? |
| **InstallSentry** | What did **this traced install** do (files, network, fake secrets)? |

## When to use InstallSentry

- You want **runtime evidence** from replaying your lockfile install in a sandbox.
- You need **blast-radius paths** from suspicious behavior to the root manifest.
- You want **CI gates** on canary exfiltration and network policy with SARIF output.
- You are evaluating a new dependency and want an HTML report of install-time behavior.

## When not to rely on InstallSentry alone

- It does not prove absence of malware (shim bypass, native code, other runtimes).
- It is not a registry-wide intelligence feed.
- It does not replace lockfile review, pinning, or `ignore-scripts` hardening.

Pair with Socket or static scanners for breadth, and with `allow-scripts` for prevention.

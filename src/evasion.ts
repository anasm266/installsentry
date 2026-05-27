import type { TraceEvent } from './types.js';
import type { Finding } from './findings.js';

const CI_ENV_PATTERNS = /^(CI|CONTINUOUS_INTEGRATION|GITHUB_ACTIONS|GITLAB_CI|BUILDKITE|TF_BUILD|JENKINS_URL)$/i;
const INSTALLSENTRY_PROBE = /^INSTALLSENTRY_/i;

export function buildEvasionHints(events: TraceEvent[]): Finding[] {
  const hints: Finding[] = [];
  const seen = new Set<string>();

  for (const event of events) {
    if (event.type !== 'fs.read') continue;
    const filePath = String(event.details.path || '');
    const base = filePath.split(/[/\\]/).pop() || filePath;

    if (CI_ENV_PATTERNS.test(base) || filePath.includes('/etc/os-release')) {
      const key = `ci-probe:${filePath}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hints.push({
        id: 'evasion-env-probe',
        severity: 'LOW',
        package: event.package || 'unknown',
        title: 'Possible environment probe',
        detail: `Read ${filePath} (may indicate CI/sandbox detection)`,
        evidence: { path: filePath, type: event.type },
        attribution: {
          cwdPackage: event.package || 'unknown',
          confidence: 'low',
        },
      });
    }

    if (INSTALLSENTRY_PROBE.test(base)) {
      const key = `anti:${filePath}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hints.push({
        id: 'evasion-anti-analysis',
        severity: 'LOW',
        package: event.package || 'unknown',
        title: 'InstallSentry environment read',
        detail: `Read ${filePath} (possible anti-analysis check)`,
        evidence: { path: filePath },
        attribution: {
          cwdPackage: event.package || 'unknown',
          confidence: 'low',
        },
      });
    }
  }

  return hints;
}

import { describe, expect, it } from 'vitest';
import { resolveInstallRunner } from '../src/runner-options.js';

describe('runner options', () => {
  it('uses the host runner by default', () => {
    expect(resolveInstallRunner({ runner: 'host' })).toBe('host');
    expect(resolveInstallRunner({})).toBe('host');
  });

  it('supports --runner docker', () => {
    expect(resolveInstallRunner({ runner: 'docker' })).toBe('docker');
  });

  it('treats --docker as an alias for --runner docker', () => {
    expect(resolveInstallRunner({ docker: true, runner: 'host' })).toBe('docker');
  });
});

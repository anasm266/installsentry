import { describe, expect, it } from 'vitest';
import { npmInstallArgs, parseNpmCommand } from '../src/npm-command.js';

describe('npm command options', () => {
  it('uses the provided fallback when no command is set', () => {
    expect(parseNpmCommand(undefined, 'install')).toBe('install');
    expect(parseNpmCommand(undefined, 'ci')).toBe('ci');
  });

  it('accepts install and ci only', () => {
    expect(parseNpmCommand('install', 'ci')).toBe('install');
    expect(parseNpmCommand('ci', 'install')).toBe('ci');
    expect(() => parseNpmCommand('publish', 'install')).toThrow(
      'Unsupported npm command: publish'
    );
  });

  it('builds npm install arguments without allowing arbitrary shell input', () => {
    expect(npmInstallArgs('install')).toEqual(['install', '--ignore-scripts=false']);
    expect(npmInstallArgs('ci')).toEqual(['ci', '--ignore-scripts=false']);
  });
});

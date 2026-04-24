import { readFileSync } from 'node:fs';
import type { TraceEvent } from './types.js';

export function readTrace(traceFile: string): TraceEvent[] {
  const content = readFileSync(traceFile, 'utf-8');
  const lines = content.split('\n').filter((l) => l.trim() !== '');
  return lines.map((line) => JSON.parse(line) as TraceEvent);
}

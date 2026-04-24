/**
 * Some editors and PowerShell on Windows write UTF-8 *with* BOM, which
 * `JSON.parse` does not accept. We strip a leading U+FEFF from text read as utf-8.
 */
export function stripBom(s: string): string {
  return s.length > 0 && s.codePointAt(0) === 0xfeff ? s.slice(1) : s;
}

export function parseJsonUtf8<T = unknown>(text: string): T {
  return JSON.parse(stripBom(text)) as T;
}

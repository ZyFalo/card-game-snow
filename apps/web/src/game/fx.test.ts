import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { artEntries } from '../art';

/* Toda textura de efecto que use la escena debe existir en el registro de arte. */
describe('Efectos (fase 2)', () => {
  it('cada textura fx-* mencionada en la escena está registrada', () => {
    const dir = new URL('.', import.meta.url).pathname;
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    const used = new Set<string>();
    for (const f of files) {
      for (const m of readFileSync(join(dir, f), 'utf8').matchAll(/'(fx-[a-z-]+)'/g)) used.add(m[1] as string);
    }
    const keys = new Set(artEntries().map((e) => e.key));
    expect(used.size).toBeGreaterThan(15);
    expect([...used].filter((k) => !keys.has(k))).toEqual([]);
  });
});

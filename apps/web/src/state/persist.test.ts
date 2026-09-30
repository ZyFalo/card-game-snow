import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings } from './persist';

/* Los ajustes guardados en el navegador se validan campo por campo al cargarlos. */

function storeSettings(value: unknown): void {
  const data: Record<string, string> = { 'ventisca:settings:v1': JSON.stringify(value) };
  vi.stubGlobal('window', {
    localStorage: { getItem: (k: string) => data[k] ?? null, setItem: () => undefined },
    matchMedia: () => ({ matches: false }),
  });
}

describe('Ajustes guardados', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('un valor inválido vuelve a su valor predeterminado y los válidos se conservan', () => {
    storeSettings({ pace: 'turbo', difficulty: 'pesadilla', tips: 'sí', sfx: false, music: 1, fastAnimations: true });
    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, sfx: false, fastAnimations: true });
  });

  it('ajustes ilegibles o que no son un objeto dan los predeterminados', () => {
    storeSettings(['normal']);
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    storeSettings(null);
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('se ignoran campos desconocidos', () => {
    storeSettings({ pace: 'expert', difficulty: 'storm', volumen: 11 });
    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, pace: 'expert', difficulty: 'storm' });
  });
});

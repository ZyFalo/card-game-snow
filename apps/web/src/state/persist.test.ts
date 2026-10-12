import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './persist';

/* Los ajustes guardados en el navegador se validan campo por campo al cargarlos. */

const KEY = 'ventisca:settings:v1';
/** Lo que hay en el almacenamiento del navegador de mentira. */
let data: Record<string, string> = {};

/** Deja el navegador con esos ajustes guardados; sin argumento, sin nada guardado. */
function storeSettings(...value: [unknown?]): void {
  data = value.length > 0 ? { [KEY]: JSON.stringify(value[0]) } : {};
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => data[k] ?? null,
      setItem: (k: string, v: string) => {
        data[k] = v;
      },
    },
    matchMedia: () => ({ matches: false }),
  });
}

/** Los ajustes tal como quedaron guardados. */
const stored = (): Record<string, unknown> | null => (data[KEY] ? JSON.parse(data[KEY]) : null);

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

  it('D-78: las ayudas de daño y de alcance vienen apagadas, y encendidas se conservan', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ aidDamage: false, aidReach: false });
    storeSettings({});
    expect(loadSettings()).toMatchObject({ aidDamage: false, aidReach: false });
    storeSettings({ aidDamage: true, aidReach: true });
    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, aidDamage: true, aidReach: true });
    // Como los demás ajustes: lo que no es sí o no vuelve a su valor predeterminado.
    storeSettings({ aidDamage: 'sí', aidReach: 1 });
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('un ritmo que solo existe como propiedad heredada no es válido (dejaría el reloj en NaN)', () => {
    for (const pace of ['toString', 'constructor']) {
      storeSettings({ pace, difficulty: pace });
      expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    }
  });

  /* D-79: "Pasar al siguiente ninja" viene apagado, y una migración única lo apaga en lo ya guardado. */
  describe('"Pasar al siguiente ninja" (D-79)', () => {
    it('D-79: viene apagado, como las demás opciones que ya vienen apagadas', () => {
      expect(DEFAULT_SETTINGS.autoAdvance).toBe(false);
      expect(DEFAULT_SETTINGS).toMatchObject({ fastAnimations: false, aidDamage: false, aidReach: false });
      // Sin nada guardado en el navegador, tampoco se guarda nada: valen los predeterminados.
      storeSettings();
      expect(loadSettings().autoAdvance).toBe(false);
      expect(stored()).toBeNull();
    });

    it('D-79: la migración lo apaga en los ajustes ya guardados, y conserva los demás', () => {
      storeSettings({ pace: 'expert', difficulty: 'storm', autoAdvance: true, fastAnimations: true, sfx: false });
      expect(loadSettings()).toEqual({
        ...DEFAULT_SETTINGS,
        pace: 'expert',
        difficulty: 'storm',
        autoAdvance: false,
        fastAnimations: true,
        sfx: false,
      });
      // Queda guardado ya apagado, y marcado como migrado.
      expect(stored()).toMatchObject({ pace: 'expert', autoAdvance: false, fastAnimations: true, version: 2 });
      // También si el ajuste no estaba guardado, que era lo mismo que tenerlo encendido.
      storeSettings({ pace: 'relaxed' });
      expect(loadSettings().autoAdvance).toBe(false);
      expect(stored()).toMatchObject({ pace: 'relaxed', autoAdvance: false, version: 2 });
    });

    it('D-79: la migración es única: después, cada persona decide', () => {
      storeSettings({ autoAdvance: true });
      const migrated = loadSettings();
      expect(migrated.autoAdvance).toBe(false);
      // La persona lo vuelve a encender, y así se queda las veces que abra el juego.
      saveSettings({ ...migrated, autoAdvance: true });
      expect(stored()).toMatchObject({ autoAdvance: true, version: 2 });
      expect(loadSettings().autoAdvance).toBe(true);
      expect(loadSettings().autoAdvance).toBe(true);
      expect(stored()).toMatchObject({ autoAdvance: true, version: 2 });
    });

    it('D-79: lo que se guarda lleva siempre la marca, también desde un navegador sin ajustes', () => {
      storeSettings();
      saveSettings({ ...loadSettings(), autoAdvance: true });
      expect(stored()).toMatchObject({ autoAdvance: true, version: 2 });
      expect(loadSettings().autoAdvance).toBe(true);
    });

    it('D-79: unos ajustes ya migrados no se tocan ni se vuelven a guardar', () => {
      const saved = { pace: 'expert', autoAdvance: true, version: 2 };
      storeSettings(saved);
      expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, pace: 'expert', autoAdvance: true });
      expect(stored()).toEqual(saved);
      // Una marca que no es un número no cuenta: se migra.
      storeSettings({ autoAdvance: true, version: '2' });
      expect(loadSettings().autoAdvance).toBe(false);
      expect(stored()).toMatchObject({ autoAdvance: false, version: 2 });
    });
  });
});

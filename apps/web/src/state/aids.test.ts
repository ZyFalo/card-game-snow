import { describe, expect, it } from 'vitest';
import { activeAids } from './aids';
import { DEFAULT_SETTINGS } from './persist';

/* D-78: las ayudas opcionales existen solo en las partidas locales, apagadas por defecto. */

describe('Ayudas opcionales (D-78)', () => {
  it('apagadas por defecto', () => {
    expect(activeAids({ settings: DEFAULT_SETTINGS, local: true })).toEqual({ damage: false, reach: false });
  });

  it('en una partida local vale la que la persona encendió, cada una por su lado', () => {
    const on = (patch: object) => activeAids({ settings: { ...DEFAULT_SETTINGS, ...patch }, local: true });
    expect(on({ aidDamage: true })).toEqual({ damage: true, reach: false });
    expect(on({ aidReach: true })).toEqual({ damage: false, reach: true });
    expect(on({ aidDamage: true, aidReach: true })).toEqual({ damage: true, reach: true });
  });

  it('en una partida que no es local no valen, aunque estén encendidas en los ajustes', () => {
    const settings = { ...DEFAULT_SETTINGS, aidDamage: true, aidReach: true };
    expect(activeAids({ settings, local: false })).toEqual({ damage: false, reach: false });
  });
});

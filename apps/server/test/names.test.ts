import { describe, expect, it } from 'vitest';
import { checkName, nameKey } from '../src/accounts/names';

/* Filtro de nombres visibles: la regla y los casos aprobados por el dueño de producto (2026-09-30). */
describe('Nombres visibles: filtro de palabras', () => {
  const allowed = [
    'Nigel',
    'Nigeria',
    'pera',
    'Zora',
    'bolera',
    'fagot',
    'Kirk',
    'Kaka',
    'Jugador148',
    'Ana1848',
    'computadora',
    'Disputa',
    'Vergara',
    'therapist',
    'Nazir',
    'Calculo',
    'Penelope',
    'canal',
    'peacock',
    'Robot',
  ];
  for (const name of allowed) {
    it(`deja pasar "${name}"`, () => {
      expect(checkName(name)).toBeNull();
    });
  }

  const offensive = [
    // Sin juntar letras: la entrada exige sus letras dobles, y las repetidas de más no la esquivan.
    'perra',
    'zorra',
    'faggot',
    'kkk',
    'nigga',
    'bollera',
    'perrrra',
    'zorrrra',
    'fagggot',
    'KKKK',
    'niggggga',
    'puuuta',
    'LaPerra',
    // 1488 se busca antes de traducir los números.
    'Juan1488',
    'Juan 14 88',
    // NFKC: letras de ancho completo.
    'ｐｕｔａ',
    'ｆｕｃｋ',
    'ＫＫＫ',
    // Excepciones: se quitan antes de buscar, así que no esconden una raíz pegada.
    'computaputa',
    // Palabra completa (lista B), con números leídos como letras.
    'ElCuloFeo',
    'p3n3',
    // El 1 se lee como i y como l.
    'cu1o',
  ];
  for (const name of offensive) {
    it(`bloquea "${name}"`, () => {
      expect(checkName(name)).toBe('offensive');
    });
  }

  for (const name of ['Admin', '4dmin', 'Bot', 'Brasa']) {
    it(`reserva "${name}"`, () => {
      expect(checkName(name)).toBe('reserved');
    });
  }
});

describe('Nombres visibles: formato', () => {
  it('de 3 a 16 caracteres', () => {
    expect(checkName('Al')).toBe('length');
    expect(checkName('Ana')).toBeNull();
    expect(checkName('Escarchadebosque')).toBeNull();
    expect(checkName('Escarchadebosques')).toBe('length');
  });

  it('letras con tildes y ñ, números, espacio, guion y guion bajo; nada más', () => {
    expect(checkName('Ñandú_de-Nieve 2')).toBeNull();
    expect(checkName('Nieve!')).toBe('characters');
    expect(checkName('Nieve❄')).toBe('characters');
  });

  it('los espacios de los bordes se quitan y los dobles se rechazan', () => {
    expect(checkName('  Nieve  ')).toBeNull();
    expect(checkName('Copo  de nieve')).toBe('spaces');
  });

  it('la unicidad no distingue mayúsculas ni tildes, pero sí la ñ', () => {
    expect(nameKey('Níeve')).toBe(nameKey('nieve'));
    expect(nameKey('NIEVE ')).toBe(nameKey('nieve'));
    expect(nameKey('Muñeco')).not.toBe(nameKey('Muneco'));
  });
});

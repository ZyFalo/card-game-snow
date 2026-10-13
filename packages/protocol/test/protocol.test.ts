import { ACHIEVEMENT_IDS } from '@ventisca/core';
import { describe, expect, it } from 'vitest';
import {
  achievementsSchema,
  apiError,
  apiErrorSchema,
  boxResultSchema,
  buyBoxSchema,
  chooseCaminoSchema,
  healthSchema,
  progressSchema,
} from '../src';

describe('Protocolo: API HTTP', () => {
  it('un error de la API lleva solo su código', () => {
    expect(apiError('not_found')).toEqual({ error: { code: 'not_found' } });
    expect(apiErrorSchema.parse(apiError('db_unavailable'))).toEqual({ error: { code: 'db_unavailable' } });
  });

  it('rechaza códigos de error que no existen', () => {
    expect(apiErrorSchema.safeParse({ error: { code: 'teapot' } }).success).toBe(false);
  });

  it('la salud solo es válida si la base de datos respondió', () => {
    expect(healthSchema.safeParse({ ok: true, db: 'ok', commit: null }).success).toBe(true);
    expect(healthSchema.safeParse({ ok: true, db: 'ok', commit: 'abc1234' }).success).toBe(true);
    expect(healthSchema.safeParse({ ok: true, db: 'down', commit: null }).success).toBe(false);
  });
});

describe('Protocolo: progreso en la cuenta', () => {
  const none = { matches: 0, rounds: 0, wins: 0 };
  /** Sin avance en ningún logro: así empieza una cuenta. */
  const nothing = Object.fromEntries(ACHIEVEMENT_IDS.map((id) => [id, { count: 0, done: false }]));
  const empty = { achievements: nothing, stats: { classic: none, storm: none } };
  const progress = {
    camino: 'snow',
    coins: 240,
    boxesOpened: 1,
    collection: { 'snow-18': 1, 'fire-01': 2 },
    achievements: { ...nothing, reviver: { count: 9, done: false }, combo3: { count: 3, done: true } },
    stats: { classic: { matches: 24, rounds: 61, wins: 19 }, storm: none },
  };

  it('una cuenta sin camino tiene un progreso vacío, y es válido', () => {
    expect(progressSchema.safeParse({ camino: null, coins: 0, boxesOpened: 0, collection: {}, ...empty }).success).toBe(
      true,
    );
    expect(progressSchema.parse(progress)).toEqual(progress);
  });

  it('rechaza un saldo negativo, una carta con cero copias y un camino que no existe', () => {
    expect(progressSchema.safeParse({ ...progress, coins: -1 }).success).toBe(false);
    expect(progressSchema.safeParse({ ...progress, coins: 1.5 }).success).toBe(false);
    expect(progressSchema.safeParse({ ...progress, collection: { 'fire-01': 0 } }).success).toBe(false);
    expect(progressSchema.safeParse({ ...progress, camino: 'tierra' }).success).toBe(false);
  });

  it('R-55: el avance trae los 12 logros del juego, cada uno con lo que lleva contado y si está completo', () => {
    expect(achievementsSchema.safeParse(nothing).success).toBe(true);
    expect(Object.keys(achievementsSchema.parse(progress.achievements)).sort()).toEqual([...ACHIEVEMENT_IDS].sort());
    const { reviver: _, ...missing } = nothing;
    expect(achievementsSchema.safeParse(missing).success).toBe(false);
    expect(achievementsSchema.safeParse({ ...nothing, logro_inventado: { count: 1, done: false } }).success).toBe(
      false,
    );
    for (const bad of [{ count: -1, done: false }, { count: 1.5, done: false }, { count: 1 }, { done: true }, 3]) {
      expect(achievementsSchema.safeParse({ ...nothing, reviver: bad }).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it('R-55 y R-42: los logros son los del juego, y las estadísticas, contadores sin negativos', () => {
    expect(progressSchema.safeParse({ ...progress, achievements: ['reviver'] }).success).toBe(false);
    expect(progressSchema.safeParse({ ...progress, achievements: undefined }).success).toBe(false);
    const stats = { classic: { matches: -1, rounds: 0, wins: 0 }, storm: none };
    expect(progressSchema.safeParse({ ...progress, stats }).success).toBe(false);
    expect(progressSchema.safeParse({ ...progress, stats: { classic: none } }).success).toBe(false);
  });

  const purchaseId = '0b9f4c2e-6f0a-4c56-9d3e-2a7c1e5b8d41';

  it('elegir el camino y comprar una caja piden un elemento del juego', () => {
    expect(chooseCaminoSchema.safeParse({ element: 'fire' }).success).toBe(true);
    expect(chooseCaminoSchema.safeParse({ element: 'tierra' }).success).toBe(false);
    expect(buyBoxSchema.safeParse({ element: 'water', size: 2, purchaseId }).success).toBe(true);
    expect(buyBoxSchema.safeParse({ element: 'tierra', size: 2, purchaseId }).success).toBe(false);
  });

  it('el tamaño de una caja es un entero positivo', () => {
    for (const size of [0, -1, 1.5, '2', null]) {
      expect(buyBoxSchema.safeParse({ element: 'fire', size, purchaseId }).success).toBe(false);
    }
  });

  it('D-66: cada compra lleva su identificador, un UUID que genera el cliente', () => {
    expect(buyBoxSchema.safeParse({ element: 'fire', size: 1 }).success).toBe(false);
    for (const id of ['', 'mi-compra', 12345, null]) {
      expect(buyBoxSchema.safeParse({ element: 'fire', size: 1, purchaseId: id }).success).toBe(false);
    }
  });

  it('la respuesta de una compra trae las cartas que salieron y el progreso ya actualizado', () => {
    expect(boxResultSchema.safeParse({ cards: ['fire-01', 'fire-01'], progress }).success).toBe(true);
    expect(boxResultSchema.safeParse({ cards: ['fire-01'] }).success).toBe(false);
  });
});

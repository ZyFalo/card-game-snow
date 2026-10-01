import { describe, expect, it } from 'vitest';
import {
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
  const progress = { camino: 'snow', coins: 240, boxesOpened: 1, collection: { 'snow-18': 1, 'fire-01': 2 } };

  it('una cuenta sin camino tiene un progreso vacío, y es válido', () => {
    expect(progressSchema.safeParse({ camino: null, coins: 0, boxesOpened: 0, collection: {} }).success).toBe(true);
    expect(progressSchema.parse(progress)).toEqual(progress);
  });

  it('rechaza un saldo negativo, una carta con cero copias y un camino que no existe', () => {
    expect(progressSchema.safeParse({ ...progress, coins: -1 }).success).toBe(false);
    expect(progressSchema.safeParse({ ...progress, coins: 1.5 }).success).toBe(false);
    expect(progressSchema.safeParse({ ...progress, collection: { 'fire-01': 0 } }).success).toBe(false);
    expect(progressSchema.safeParse({ ...progress, camino: 'tierra' }).success).toBe(false);
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

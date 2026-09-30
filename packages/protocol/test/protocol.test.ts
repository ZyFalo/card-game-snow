import { describe, expect, it } from 'vitest';
import { apiError, apiErrorSchema, healthSchema } from '../src';

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

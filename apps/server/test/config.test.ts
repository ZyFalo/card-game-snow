import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';

describe('Configuración del servidor', () => {
  it('con solo DATABASE_URL usa el puerto, el host y el nivel de registro por defecto', () => {
    expect(loadConfig({ DATABASE_URL: 'postgres://u:p@localhost:5432/ventisca' })).toEqual({
      databaseUrl: 'postgres://u:p@localhost:5432/ventisca',
      port: 3000,
      host: '0.0.0.0',
      logLevel: 'info',
    });
  });

  it('toma el puerto que da Railway en PORT', () => {
    expect(loadConfig({ DATABASE_URL: 'postgresql://db/ventisca', PORT: '8080' }).port).toBe(8080);
  });

  it('sin DATABASE_URL no arranca y dice qué variable falta', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });

  it('el error nombra la variable pero nunca muestra su valor, que puede traer la contraseña', () => {
    let message = '';
    try {
      loadConfig({ DATABASE_URL: 'mysql://root:secreto@db/ventisca', PORT: 'x' });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/DATABASE_URL/);
    expect(message).toMatch(/PORT/);
    expect(message).not.toMatch(/secreto/);
  });
});

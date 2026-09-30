import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../src/accounts/limits';

describe('Límites de abuso', () => {
  it('bloquea al llegar al límite dentro de la ventana y libera cuando el intento más viejo sale de ella', () => {
    let t = 0;
    const limiter = new RateLimiter(3, 60_000, () => new Date(t));
    for (let i = 0; i < 3; i++) {
      expect(limiter.blocked('a')).toBe(false);
      limiter.hit('a');
      t += 1_000;
    }
    expect(limiter.blocked('a')).toBe(true);
    expect(limiter.retryAfter('a')).toBe(57);
    t = 60_001;
    expect(limiter.blocked('a')).toBe(false);
  });

  it('cada clave cuenta aparte, y reset la libera', () => {
    const limiter = new RateLimiter(1, 60_000, () => new Date(0));
    limiter.hit('a');
    expect(limiter.blocked('a')).toBe(true);
    expect(limiter.blocked('b')).toBe(false);
    limiter.reset('a');
    expect(limiter.blocked('a')).toBe(false);
  });
});

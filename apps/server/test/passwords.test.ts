import { describe, expect, it } from 'vitest';
import { checkPassword, hashPassword, R45, verifyPassword } from '../src/accounts/passwords';

const me = { email: 'nieve.azul@example.com', displayName: 'Copo Veloz' };

describe('Contraseña (R-45)', () => {
  it('R-45: acepta 8 a 128 caracteres con mayúscula, número y símbolo', () => {
    expect(checkPassword('Tundra7#Oso', me)).toBeNull();
    expect(checkPassword(`Ab1!${'x'.repeat(124)}`, me)).toBeNull();
  });

  it('R-45: permite espacios, tildes, ñ y emojis', () => {
    expect(checkPassword('Ñandú corre 9 😀', me)).toBeNull();
  });

  it('R-45: explica qué regla falla', () => {
    expect(checkPassword('Ab1!', me)).toBe('length');
    expect(checkPassword(`Ab1!${'x'.repeat(125)}`, me)).toBe('length');
    expect(checkPassword('tundra7#oso', me)).toBe('uppercase');
    expect(checkPassword('Tundra#Oso', me)).toBe('digit');
    expect(checkPassword('Tundra7 Oso', me)).toBe('symbol');
    expect(checkPassword('Tundra7#\nOso', me)).toBe('newline');
  });

  it('R-45: una tilde escrita aparte (NFD) no cuenta como símbolo', () => {
    const nfd = 'abcdéfG1'.normalize('NFD');
    // Sin normalizar, la expresión aprobada la aceptaría: la tilde suelta pasa por símbolo.
    expect(R45.test(nfd)).toBe(true);
    expect(checkPassword(nfd, me)).toBe('symbol');
  });

  it('R-45: rechaza las contraseñas comunes, también con números y símbolos en los bordes', () => {
    expect(checkPassword('Password1!', me)).toBe('common');
    expect(checkPassword('Qwerty123$', me)).toBe('common');
    expect(checkPassword('Contraseña2024$', me)).toBe('common');
  });

  it('R-45: rechaza las que contienen el correo o el nombre visible', () => {
    expect(checkPassword('Nieve.Azul#7', me)).toBe('personal');
    expect(checkPassword('CopoVeloz#7', { ...me, displayName: 'CopoVeloz' })).toBe('personal');
    expect(checkPassword('mi Copo Veloz 7!', me)).toBe('personal');
  });
});

describe('Hash de contraseñas (D-54)', () => {
  it('usa Argon2id con 19 MiB, 2 pasadas y 1 hilo', async () => {
    expect(await hashPassword('Tundra7#Oso')).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it('la misma contraseña en NFC o en NFD coincide', async () => {
    const stored = await hashPassword('Ñandú corre 9!'.normalize('NFC'));
    expect(await verifyPassword(stored, 'Ñandú corre 9!'.normalize('NFD'))).toBe(true);
    expect(await verifyPassword(stored, 'Nandu corre 9!')).toBe(false);
  });
});

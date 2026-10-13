import { ACHIEVEMENT_IDS } from '@ventisca/core';
import { describe, expect, it } from 'vitest';
import {
  clientMessageSchema,
  formatRoomCode,
  isRoomCode,
  normalizeRoomCode,
  PLAY_LIMITS,
  PROTOCOL_VERSION,
  ROOM_CODE_ALPHABET,
  seatPlanSchema,
  serverMessageSchema,
} from '../src';

const v = PROTOCOL_VERSION;
const valid = (message: unknown) => clientMessageSchema.safeParse(message).success;

describe('Protocolo: del cliente al servidor', () => {
  it('cada mensaje lleva la versión, su número de secuencia y su tipo', () => {
    expect(valid({ v, seq: 0, type: 'queue.join', element: 'fire' })).toBe(true);
    expect(valid({ seq: 0, type: 'queue.join', element: 'fire' })).toBe(false);
    expect(valid({ v, type: 'queue.join', element: 'fire' })).toBe(false);
    expect(valid({ v, seq: -1, type: 'queue.join', element: 'fire' })).toBe(false);
    expect(valid({ v, seq: 0.5, type: 'queue.join', element: 'fire' })).toBe(false);
    expect(valid({ v, seq: 0, element: 'fire' })).toBe(false);
  });

  it('un mensaje de otra versión del protocolo no vale', () => {
    expect(valid({ v: v + 1, seq: 0, type: 'queue.leave' })).toBe(false);
  });

  it('no existen más tipos que los del protocolo, ni campos de más', () => {
    expect(valid({ v, seq: 0, type: 'coins.give', amount: 9999 })).toBe(false);
    expect(valid({ v, seq: 0, type: 'queue.leave', as: 'otra-persona' })).toBe(false);
    // Nadie dice de qué ninja es su plan: lo sabe el servidor por el asiento de la conexión.
    expect(valid({ v, seq: 0, type: 'plan.update', turn: 1, plan: {}, ninja: 'water' })).toBe(false);
    expect(valid({ v, seq: 0, type: 'plan.update', turn: 1, plan: { ninjaId: 'water' } })).toBe(false);
  });

  it('los ninjas son los tres elementos, y nada más', () => {
    for (const element of ['fire', 'water', 'snow'])
      expect(valid({ v, seq: 0, type: 'queue.join', element })).toBe(true);
    for (const element of ['tierra', '', null, 3])
      expect(valid({ v, seq: 0, type: 'room.create', element })).toBe(false);
  });

  it('los mensajes sin contenido propio valen solos', () => {
    for (const type of ['queue.leave', 'queue.acceptBot', 'room.start', 'room.leave', 'match.leave', 'notice.seen']) {
      expect(valid({ v, seq: 3, type }), type).toBe(true);
    }
  });
});

describe('Protocolo: el plan de un ninja', () => {
  const plan = (p: unknown) => seatPlanSchema.safeParse(p).success;

  it('vale vacío, con casilla, con acción o con las dos cosas', () => {
    expect(plan({})).toBe(true);
    expect(plan({ moveTo: { x: 3, y: 2 } })).toBe(true);
    expect(plan({ action: { type: 'attack', targetId: 'e4' } })).toBe(true);
    expect(plan({ moveTo: { x: 0, y: 0 }, action: { type: 'card', cardId: 'snow-2', at: { x: 8, y: 4 } } })).toBe(true);
    expect(plan({ action: { type: 'heal', targetId: 'water' } })).toBe(true);
    expect(plan({ action: { type: 'revive', targetId: 'fire' } })).toBe(true);
  });

  it('las casillas son las del tablero de 9×5, enteras', () => {
    for (const at of [
      { x: 9, y: 0 },
      { x: 0, y: 5 },
      { x: -1, y: 2 },
      { x: 1.5, y: 2 },
      { x: 1 },
      { x: 1, y: 2, z: 0 },
    ]) {
      expect(plan({ moveTo: at }), JSON.stringify(at)).toBe(false);
      expect(plan({ action: { type: 'card', cardId: 'fire-1', at } }), JSON.stringify(at)).toBe(false);
    }
  });

  it('no hay más acciones que atacar, curar, revivir y jugar una carta', () => {
    expect(plan({ action: { type: 'win' } })).toBe(false);
    expect(plan({ action: { type: 'attack' } })).toBe(false);
    expect(plan({ action: { type: 'attack', targetId: 'x'.repeat(40) } })).toBe(false);
    expect(plan({ action: { type: 'heal', targetId: 'e1' } })).toBe(false);
    expect(plan({ action: { type: 'card', cardId: 'fire-1' } })).toBe(false);
    expect(plan({ action: { type: 'card', cardId: 'fire-1', at: { x: 1, y: 1 }, value: 99 } })).toBe(false);
  });

  it('el plan más largo cabe de sobra en el tamaño máximo de un mensaje', () => {
    const longest = {
      v,
      seq: 999_999,
      type: 'plan.confirm',
      turn: 9999,
      plan: { moveTo: { x: 8, y: 4 }, action: { type: 'card', cardId: 'x'.repeat(16), at: { x: 8, y: 4 } } },
    };
    expect(valid(longest)).toBe(true);
    expect(JSON.stringify(longest).length).toBeLessThan(PLAY_LIMITS.maxMessageBytes / 4);
  });
});

describe('Protocolo: los códigos de sala (R-53)', () => {
  it('el alfabeto no tiene los caracteres que se confunden: ni O ni 0, ni I ni 1', () => {
    for (const confusing of ['O', '0', 'I', '1']) expect(ROOM_CODE_ALPHABET).not.toContain(confusing);
    expect(new Set(ROOM_CODE_ALPHABET).size).toBe(ROOM_CODE_ALPHABET.length);
    expect(ROOM_CODE_ALPHABET).toHaveLength(32);
  });

  it('un código son 6 caracteres de ese alfabeto', () => {
    expect(isRoomCode('KQ7RTX')).toBe(true);
    for (const bad of ['KQ7RT', 'KQ7RTXA', 'KQ7RT0', 'KQ7RTO', 'KQ1RTX', 'KQIRTX', 'kq7rtx', 'KQ7 RTX', '']) {
      expect(isRoomCode(bad), bad).toBe(false);
    }
  });

  it('lo que escribe la persona se normaliza: sin espacios ni guiones, y en mayúsculas', () => {
    expect(normalizeRoomCode(' kq7 rtx ')).toBe('KQ7RTX');
    expect(normalizeRoomCode('kq7-rtx')).toBe('KQ7RTX');
    expect(isRoomCode(normalizeRoomCode('kq7 rtx'))).toBe(true);
  });

  it('se muestra partido en dos, para dictarlo fácil', () => {
    expect(formatRoomCode('KQ7RTX')).toBe('KQ7 RTX');
  });
});

describe('Protocolo: del servidor al cliente', () => {
  const ok = (message: unknown) => serverMessageSchema.safeParse(message).success;
  const seats = [
    { element: 'fire', name: 'BrasaLuz' },
    { element: 'water', name: null },
    { element: 'snow', name: null },
  ];

  it('la cola lleva siempre los tres asientos', () => {
    const state = { v, seq: 4, type: 'queue.state', you: 'fire', seats, offer: null, waitedMs: 1200 };
    expect(ok(state)).toBe(true);
    expect(ok({ ...state, seats: seats.slice(0, 2) })).toBe(false);
    expect(ok({ ...state, offer: { bot: 'snow', accepted: true, waitingFor: 'OlaFria22' } })).toBe(true);
  });

  it('un error lleva solo un código de los conocidos', () => {
    expect(ok({ v, seq: 0, re: 7, type: 'error', code: 'room_full' })).toBe(true);
    expect(ok({ v, seq: 0, type: 'error', code: 'porque_si' })).toBe(false);
  });

  it('el resultado de una partida lleva las monedas, el avance de los logros y el saldo de esa persona', () => {
    const achievements = Object.fromEntries(ACHIEVEMENT_IDS.map((id) => [id, { count: 0, done: false }]));
    const end = {
      v,
      seq: 90,
      type: 'match.end',
      result: 'victory',
      coins: {
        lines: [
          { round: 1, coins: 60 },
          { round: 'bonus', coins: 120 },
        ],
        doubled: false,
        total: 180,
      },
      achievements: { ...achievements, reviver: { count: 4, done: false }, upAgain: { count: 1, done: true } },
      gained: { reviver: 2, upAgain: 1 },
      completed: ['upAgain'],
      balance: 430,
      room: null,
    };
    expect(ok(end)).toBe(true);
    expect(ok({ ...end, gained: {} })).toBe(true);
    expect(ok({ ...end, balance: -5 })).toBe(false);
    // R-55: lo que sumó la partida y lo que completó son de logros del juego, en cantidades enteras de 1 o más.
    expect(ok({ ...end, gained: { logro_inventado: 1 } })).toBe(false);
    expect(ok({ ...end, gained: { reviver: 0 } })).toBe(false);
    expect(ok({ ...end, gained: { reviver: 1.5 } })).toBe(false);
    expect(ok({ ...end, completed: ['logro_inventado'] })).toBe(false);
    expect(ok({ ...end, gained: undefined })).toBe(false);
    expect(ok({ ...end, completed: undefined })).toBe(false);
    // El avance trae los 12 logros: ni uno menos, ni uno de más.
    const { reviver: _, ...missing } = end.achievements;
    expect(ok({ ...end, achievements: missing })).toBe(false);
    expect(ok({ ...end, achievements: { ...end.achievements, combo2: { count: 1, done: true } } })).toBe(false);
    expect(ok({ ...end, achievements: ['reviver'] })).toBe(false);
  });
});

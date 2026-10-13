import { isRoomCode, ROOM_CODE_ALPHABET } from '@ventisca/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Player } from '../src/play/link';
import type { Team } from '../src/play/queue';
import { type Room, type RoomState, Rooms, randomRoomCode } from '../src/play/rooms';

/* Las salas con código (R-53): los asientos, quién puede empezar y cuándo se cierra una sala. */

const EMPTY_MS = 120_000;
let people = 0;
const player = (name: string): Player => {
  people += 1;
  return { userId: `u${people}`, name };
};

describe('Salas con código (R-53, D-89)', () => {
  let rooms: Rooms;
  let states: Map<string, RoomState>;
  let closed: { code: string; told: string[] }[];
  let codes: string[];

  beforeEach(() => {
    vi.useFakeTimers();
    states = new Map();
    closed = [];
    codes = [];
    rooms = new Rooms({
      emptyMs: EMPTY_MS,
      later: (task, ms) => {
        const timer = setTimeout(task, ms);
        return () => clearTimeout(timer);
      },
      onState: (userId, state) => states.set(userId, state),
      onClosed: (room, told) => closed.push({ code: room.code, told }),
      code: () => codes.shift() ?? randomRoomCode(),
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const view = (who: Player) => states.get(who.userId) as RoomState;
  const names = (who: Player) => view(who).seats.map((s) => s.name);
  const joined = (result: Room | string): Room => {
    expect(typeof result).toBe('object');
    return result as Room;
  };

  describe('El código', () => {
    it('R-53: tiene 6 caracteres, sin los que se confunden', () => {
      for (let i = 0; i < 200; i++) {
        const code = randomRoomCode();
        expect(isRoomCode(code), code).toBe(true);
        expect(code).not.toMatch(/[O0I1]/);
      }
    });

    it('R-53: usa todo el alfabeto, no siempre los mismos caracteres', () => {
      const seen = new Set<string>();
      for (let i = 0; i < 400; i++) for (const ch of randomRoomCode()) seen.add(ch);
      expect(seen.size).toBe(ROOM_CODE_ALPHABET.length);
    });

    it('R-53: dos salas nunca comparten código', () => {
      codes = ['AAAAAA', 'AAAAAA', 'AAAAAA', 'BBBBBB'];
      const first = rooms.create(player('Ana'), 'fire');
      const second = rooms.create(player('Beto'), 'fire');
      expect(first.code).toBe('AAAAAA');
      expect(second.code).toBe('BBBBBB');
    });

    it('R-53: se puede escribir en minúsculas, con espacios o con guion', () => {
      codes = ['KQ7RTX'];
      const ana = player('Ana');
      rooms.create(ana, 'fire');
      for (const text of ['kq7rtx', 'KQ7 RTX', ' kq7-rtx ']) {
        const guest = player('Invitado');
        expect(joined(rooms.join(guest, text, 'water')).code).toBe('KQ7RTX');
        rooms.leave(guest.userId);
      }
    });
  });

  describe('Unirse', () => {
    it('R-53: con un código que no existe, o mal escrito, no hay sala', () => {
      codes = ['KQ7RTX'];
      rooms.create(player('Ana'), 'fire');
      for (const text of ['KQ7RTY', 'KQ7RT', 'KQ7RTXX', 'KQ7RT0', '', '      ']) {
        expect(rooms.join(player('Beto'), text, 'water'), text).toBe('room_not_found');
      }
    });

    it('R-53: quien llega con un ninja libre ocupa su asiento', () => {
      const [ana, beto] = [player('Ana'), player('Beto')];
      const room = rooms.create(ana, 'fire');
      joined(rooms.join(beto, room.code, 'snow'));
      expect(names(ana)).toEqual(['Ana', null, 'Beto']);
      expect(view(beto)).toMatchObject({ host: 'Ana', you: { seat: 'snow', host: false, wanted: null } });
      expect(view(ana)).toMatchObject({ you: { seat: 'fire', host: true } });
      expect(view(ana).seats[0]).toMatchObject({ host: true, you: true, connected: true });
      expect(view(beto).seats[0]).toMatchObject({ host: true, you: false });
    });

    it('R-53: quien encuentra ocupado su ninja entra sin asiento y elige uno libre', () => {
      const [ana, beto] = [player('Ana'), player('Beto')];
      const room = rooms.create(ana, 'fire');
      joined(rooms.join(beto, room.code, 'fire'));
      expect(view(beto)).toMatchObject({ you: { seat: null, wanted: 'fire' }, choosing: ['Beto'] });
      expect(names(beto)).toEqual(['Ana', null, null]);
      // No puede quedarse con el de Ana.
      expect(rooms.pick(beto.userId, 'fire')).toBe('seat_taken');
      expect(rooms.pick(beto.userId, 'water')).toBeNull();
      expect(view(beto)).toMatchObject({ you: { seat: 'water', wanted: null }, choosing: [] });
      expect(names(ana)).toEqual(['Ana', 'Beto', null]);
    });

    it('R-53: la sala se llena con tres personas, aunque alguna siga eligiendo su ninja', () => {
      const ana = player('Ana');
      const room = rooms.create(ana, 'fire');
      joined(rooms.join(player('Beto'), room.code, 'fire'));
      joined(rooms.join(player('Caro'), room.code, 'snow'));
      expect(rooms.join(player('Dani'), room.code, 'water')).toBe('room_full');
    });

    it('R-53: a una sala con la partida empezada no se puede entrar', () => {
      const [ana, beto] = [player('Ana'), player('Beto')];
      const room = rooms.create(ana, 'fire');
      joined(rooms.join(beto, room.code, 'water'));
      expect(typeof rooms.start(ana.userId)).toBe('object');
      expect(rooms.join(player('Caro'), room.code, 'snow')).toBe('room_started');
    });

    it('unirse dos veces a la misma sala no duplica a nadie', () => {
      const [ana, beto] = [player('Ana'), player('Beto')];
      const room = rooms.create(ana, 'fire');
      joined(rooms.join(beto, room.code, 'water'));
      joined(rooms.join(beto, room.code, 'snow'));
      expect(names(ana)).toEqual(['Ana', 'Beto', null]);
    });
  });

  describe('Empezar', () => {
    it('D-89: sola, quien creó la sala no puede empezar', () => {
      const ana = player('Ana');
      rooms.create(ana, 'fire');
      expect(view(ana)).toMatchObject({ start: 'alone', bot: null });
      expect(rooms.start(ana.userId)).toBe('not_now');
    });

    it('D-89: con dos personas empieza con el bot, que toma el ninja libre', () => {
      const [ana, beto] = [player('Ana'), player('Beto')];
      const room = rooms.create(ana, 'water');
      joined(rooms.join(beto, room.code, 'fire'));
      expect(view(ana)).toMatchObject({ start: 'bot', bot: 'snow' });
      const team = rooms.start(ana.userId) as Team;
      expect(team).toEqual({
        bot: 'snow',
        members: [
          { player: ana, element: 'water' },
          { player: beto, element: 'fire' },
        ],
      });
    });

    it('D-89: con tres personas empieza la partida completa, sin bot', () => {
      const [ana, beto, caro] = [player('Ana'), player('Beto'), player('Caro')];
      const room = rooms.create(ana, 'fire');
      joined(rooms.join(beto, room.code, 'water'));
      joined(rooms.join(caro, room.code, 'snow'));
      expect(view(ana)).toMatchObject({ start: 'full', bot: null });
      expect((rooms.start(ana.userId) as Team).bot).toBeNull();
    });

    it('R-53: solo quien creó la sala puede empezar', () => {
      const [ana, beto] = [player('Ana'), player('Beto')];
      const room = rooms.create(ana, 'fire');
      joined(rooms.join(beto, room.code, 'water'));
      expect(rooms.start(beto.userId)).toBe('not_now');
      expect(rooms.start('nadie')).toBe('not_now');
    });

    it('R-53: mientras alguien elige su ninja, la partida no empieza', () => {
      const [ana, beto, caro] = [player('Ana'), player('Beto'), player('Caro')];
      const room = rooms.create(ana, 'fire');
      joined(rooms.join(beto, room.code, 'water'));
      joined(rooms.join(caro, room.code, 'fire'));
      expect(view(ana)).toMatchObject({ start: 'choosing', choosing: ['Caro'], bot: null });
      expect(rooms.start(ana.userId)).toBe('not_now');
      rooms.pick(caro.userId, 'snow');
      expect(view(ana)).toMatchObject({ start: 'full' });
    });

    it('R-53: no se empieza dos veces', () => {
      const [ana, beto] = [player('Ana'), player('Beto')];
      const room = rooms.create(ana, 'fire');
      joined(rooms.join(beto, room.code, 'water'));
      rooms.start(ana.userId);
      expect(rooms.start(ana.userId)).toBe('not_now');
      // Con la partida en curso tampoco se cambia de ninja.
      expect(rooms.pick(beto.userId, 'snow')).toBe('not_now');
    });

    it('R-53: quien está sin conexión al empezar pierde su lugar, y el bot toma su ninja', () => {
      const [ana, beto, caro] = [player('Ana'), player('Beto'), player('Caro')];
      const room = rooms.create(ana, 'fire');
      joined(rooms.join(beto, room.code, 'water'));
      joined(rooms.join(caro, room.code, 'snow'));
      rooms.disconnect(caro.userId);
      expect(view(ana)).toMatchObject({ start: 'bot', bot: 'snow' });
      expect(view(ana).seats[2]).toMatchObject({ name: 'Caro', connected: false });
      const team = rooms.start(ana.userId) as Team;
      expect(team.bot).toBe('snow');
      expect(team.members.map((m) => m.player.name)).toEqual(['Ana', 'Beto']);
      expect(rooms.of(caro.userId)).toBeUndefined();
    });
  });

  describe('Salir, desconectarse y cerrar', () => {
    it('R-53: si sale quien no la creó, su asiento queda libre', () => {
      const [ana, beto] = [player('Ana'), player('Beto')];
      const room = rooms.create(ana, 'fire');
      joined(rooms.join(beto, room.code, 'water'));
      rooms.leave(beto.userId);
      expect(names(ana)).toEqual(['Ana', null, null]);
      expect(rooms.of(beto.userId)).toBeUndefined();
      expect(closed).toEqual([]);
    });

    it('R-53: si sale quien la creó, la sala se cierra y se les avisa a los demás', () => {
      const [ana, beto, caro] = [player('Ana'), player('Beto'), player('Caro')];
      const room = rooms.create(ana, 'fire');
      joined(rooms.join(beto, room.code, 'water'));
      joined(rooms.join(caro, room.code, 'snow'));
      rooms.leave(ana.userId);
      expect(closed).toEqual([{ code: room.code, told: [beto.userId, caro.userId] }]);
      expect(rooms.size).toBe(0);
      for (const who of [ana, beto, caro]) expect(rooms.of(who.userId)).toBeUndefined();
      // El código ya no lleva a ninguna parte.
      expect(rooms.join(player('Dani'), room.code, 'fire')).toBe('room_not_found');
    });

    it('R-38: quien se desconecta conserva su asiento 2 minutos, y si vuelve lo recupera', () => {
      const [ana, beto] = [player('Ana'), player('Beto')];
      const room = rooms.create(ana, 'fire');
      joined(rooms.join(beto, room.code, 'water'));
      rooms.disconnect(beto.userId);
      expect(view(ana).seats[1]).toMatchObject({ name: 'Beto', connected: false });
      expect(view(ana)).toMatchObject({ start: 'alone' });
      vi.advanceTimersByTime(EMPTY_MS - 1);
      expect(rooms.reconnect(beto.userId)?.code).toBe(room.code);
      expect(view(ana).seats[1]).toMatchObject({ name: 'Beto', connected: true });
      // El plazo ya no corre.
      vi.advanceTimersByTime(EMPTY_MS * 2);
      expect(names(ana)).toEqual(['Ana', 'Beto', null]);
    });

    it('R-38: si se desconecta, vuelve y se desconecta otra vez, los 2 minutos cuentan desde la última', () => {
      const [ana, beto] = [player('Ana'), player('Beto')];
      const room = rooms.create(ana, 'fire');
      joined(rooms.join(beto, room.code, 'water'));
      rooms.disconnect(beto.userId);
      vi.advanceTimersByTime(60_000);
      rooms.reconnect(beto.userId);
      vi.advanceTimersByTime(50_000);
      rooms.disconnect(beto.userId);
      // Aquí vencería el plazo de la primera desconexión: ya no vale.
      vi.advanceTimersByTime(10_000);
      expect(names(ana)).toEqual(['Ana', 'Beto', null]);
      vi.advanceTimersByTime(EMPTY_MS - 10_000);
      expect(names(ana)).toEqual(['Ana', null, null]);
    });

    it('R-38: a los 2 minutos sin conexión, pierde su asiento', () => {
      const [ana, beto] = [player('Ana'), player('Beto')];
      const room = rooms.create(ana, 'fire');
      joined(rooms.join(beto, room.code, 'water'));
      rooms.disconnect(beto.userId);
      vi.advanceTimersByTime(EMPTY_MS);
      expect(names(ana)).toEqual(['Ana', null, null]);
      expect(rooms.reconnect(beto.userId)).toBeUndefined();
    });

    it('R-38: una sala sin nadie se cierra a los 2 minutos', () => {
      const ana = player('Ana');
      const room = rooms.create(ana, 'fire');
      rooms.disconnect(ana.userId);
      vi.advanceTimersByTime(EMPTY_MS - 1);
      expect(rooms.size).toBe(1);
      vi.advanceTimersByTime(1);
      expect(rooms.size).toBe(0);
      expect(closed).toEqual([{ code: room.code, told: [ana.userId] }]);
    });

    it('R-38: si quien la creó vuelve antes, la sala sigue', () => {
      const ana = player('Ana');
      rooms.create(ana, 'fire');
      rooms.disconnect(ana.userId);
      vi.advanceTimersByTime(EMPTY_MS - 1);
      rooms.reconnect(ana.userId);
      vi.advanceTimersByTime(EMPTY_MS * 3);
      expect(rooms.size).toBe(1);
      expect(closed).toEqual([]);
    });

    it('R-53: si quien la creó no vuelve, la sala se cierra aunque queden invitados', () => {
      const [ana, beto] = [player('Ana'), player('Beto')];
      const room = rooms.create(ana, 'fire');
      joined(rooms.join(beto, room.code, 'water'));
      rooms.disconnect(ana.userId);
      vi.advanceTimersByTime(EMPTY_MS);
      expect(closed).toEqual([{ code: room.code, told: [ana.userId, beto.userId] }]);
      expect(rooms.of(beto.userId)).toBeUndefined();
    });
  });

  describe('Después de una partida', () => {
    const playing = () => {
      const [ana, beto, caro] = [player('Ana'), player('Beto'), player('Caro')];
      const room = rooms.create(ana, 'fire');
      joined(rooms.join(beto, room.code, 'water'));
      joined(rooms.join(caro, room.code, 'snow'));
      rooms.start(ana.userId);
      states.clear();
      return { ana, beto, caro, room };
    };

    it('R-53: al terminar, el equipo vuelve a la sala con sus asientos, y se puede jugar otra', () => {
      const { ana, room } = playing();
      expect(rooms.finish(room.code, [])).toBe(true);
      expect(names(ana)).toEqual(['Ana', 'Beto', 'Caro']);
      expect(view(ana)).toMatchObject({ start: 'full' });
      expect(typeof rooms.start(ana.userId)).toBe('object');
    });

    it('R-39: quien abandonó la partida también sale de la sala', () => {
      const { ana, beto, room } = playing();
      expect(rooms.finish(room.code, [beto.userId])).toBe(true);
      expect(names(ana)).toEqual(['Ana', null, 'Caro']);
      expect(rooms.of(beto.userId)).toBeUndefined();
    });

    it('R-53: si abandonó quien creó la sala, la sala se cierra al terminar la partida', () => {
      const { ana, beto, caro, room } = playing();
      expect(rooms.finish(room.code, [ana.userId])).toBe(false);
      expect(closed).toEqual([{ code: room.code, told: [beto.userId, caro.userId] }]);
      expect(rooms.size).toBe(0);
    });

    it('R-38: durante la partida no corre el plazo de quien se desconecta; empieza al terminar', () => {
      const { ana, caro, room } = playing();
      rooms.disconnect(caro.userId);
      vi.advanceTimersByTime(EMPTY_MS * 5);
      expect(rooms.of(caro.userId)?.code).toBe(room.code);
      rooms.finish(room.code, []);
      expect(view(ana).seats[2]).toMatchObject({ name: 'Caro', connected: false });
      vi.advanceTimersByTime(EMPTY_MS);
      expect(names(ana)).toEqual(['Ana', 'Beto', null]);
    });

    it('terminar una sala que ya no existe no hace nada', () => {
      expect(rooms.finish('ZZZZZZ', [])).toBe(false);
    });
  });
});

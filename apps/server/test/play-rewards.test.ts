import { ACHIEVEMENT_IDS } from '@ventisca/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hub } from '../src/play/hub';
import { again, type FakeLink } from './support/fake-link';
import { board, duo, TIMINGS, trio, type World, watched, world } from './support/world';

/*
 * Recompensas y progreso (R-39, R-40, R-54 y R-55): las monedas pendientes y su acreditación, el abandono,
 * el reinicio del servidor, los logros por persona, el doble de monedas y las estadísticas. Con el centro
 * del juego y un almacén en memoria; las cuentas de verdad, contra Postgres, están en play-store.test.ts.
 */

const wait = (ms: number) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/** La ronda `round`, con un gólem a punto de caer junto a Brasa. Sin bonus: alguien ya cayó. */
const oneBlow = (round: 1 | 2 | 3) =>
  board({
    round,
    ninjas: { fire: { at: [3, 2] }, snow: { everKo: true } },
    golems: [{ kind: 'sniper', at: [5, 2], hp: 1 }],
  });

const blow = { action: { type: 'attack' as const, targetId: 'e1' } };

/** Ana da el golpe que cierra la ronda; los demás confirman sin hacer nada. */
async function clearRound(w: World, links: FakeLink[], turn: number): Promise<void> {
  await watched(w, links, turn - 1);
  for (const link of links) await w.say(link, { type: 'plan.confirm', turn, plan: link === links[0] ? blow : {} });
}

const seat = (w: World, link: FakeLink) => [...w.store.matches.values()][0]?.seats.get(link.player.userId);
const paid = (w: World, link: FakeLink) => w.store.ledger.filter((l) => l.userId === link.player.userId);

describe('Monedas por ronda (R-40)', () => {
  it('R-40: al ganar, cada persona recibe las monedas de la ronda, ya acreditadas, y su saldo', async () => {
    const w = world({ prepare: oneBlow(3) });
    const { ana, beto, caro } = await trio(w);
    await clearRound(w, [ana, beto, caro], 1);
    for (const link of [ana, beto, caro]) {
      expect(link.last('match.end')).toMatchObject({
        result: 'victory',
        coins: { lines: [{ round: 3, coins: 120 }], doubled: false, total: 120 },
        balance: 120,
      });
      expect(paid(w, link)).toMatchObject([{ round: 3, coins: 120 }]);
      expect(w.store.coins.get(link.player.userId)).toBe(120);
    }
  });

  it('R-40: las monedas de una ronda quedan pendientes: no entran al libro hasta que termina la partida', async () => {
    const w = world({ prepare: oneBlow(2) });
    const { ana, beto, caro } = await trio(w);
    await clearRound(w, [ana, beto, caro], 1);
    expect(ana.last('turn.result')?.state).toMatchObject({ status: 'playing', round: 3 });
    for (const link of [ana, beto, caro]) expect(seat(w, link)?.rounds).toEqual([2]);
    expect(w.store.ledger).toEqual([]);
    expect(w.store.coins.size).toBe(0);
  });

  it('R-29: la ronda 1 paga 60, y las rondas 2 y 3, 120', async () => {
    const w = world({ prepare: oneBlow(1) });
    const { ana, beto } = await duo(w);
    await clearRound(w, [ana, beto], 1);
    expect(seat(w, ana)?.rounds).toEqual([1]);
    await w.hub.shutdown();
    expect(paid(w, ana)).toMatchObject([{ round: 1, coins: 60 }]);
  });

  it('D-48: solo cobra una ronda quien estaba conectado al terminarla', async () => {
    const w = world({ prepare: oneBlow(2) });
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto, caro], 0);
    await w.hub.disconnect(caro);
    await w.say(ana, { type: 'plan.confirm', turn: 1, plan: blow });
    await w.say(beto, { type: 'plan.confirm', turn: 1, plan: {} });
    expect(seat(w, ana)?.rounds).toEqual([2]);
    expect(seat(w, beto)?.rounds).toEqual([2]);
    expect(seat(w, caro)?.rounds).toEqual([]);
    // Aunque vuelva después, esa ronda ya pasó.
    await w.back(caro);
    expect(seat(w, caro)?.rounds).toEqual([]);
  });

  it('D-48: el bot no cobra: no tiene cuenta ni asiento que pagar', async () => {
    const w = world({ prepare: oneBlow(3) });
    const { ana, beto } = await duo(w);
    await clearRound(w, [ana, beto], 1);
    expect(new Set(w.store.ledger.map((l) => l.userId))).toEqual(new Set([ana.player.userId, beto.player.userId]));
  });

  it('una derrota no paga la ronda en la que se cae', async () => {
    const w = world({
      prepare: board({
        round: 2,
        ninjas: { fire: { at: [4, 2], hp: 1 }, water: { hp: 0 }, snow: { hp: 0 } },
        golems: [{ kind: 'colossus', at: [5, 2] }],
      }),
    });
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto, caro], 0);
    await w.say(ana, { type: 'plan.confirm', turn: 1, plan: {} });
    expect(ana.last('match.end')).toMatchObject({
      result: 'defeat',
      coins: { lines: [], doubled: false, total: 0 },
      balance: 0,
    });
    expect(w.store.ledger).toEqual([]);
  });
});

describe('Abandono (R-39)', () => {
  it('R-39: quien sale con «Salir» pierde las monedas de esa partida', async () => {
    const w = world({ prepare: oneBlow(2) });
    const { ana, beto, caro } = await trio(w);
    await clearRound(w, [ana, beto, caro], 1);
    expect(seat(w, caro)?.rounds).toEqual([2]);
    await w.say(caro, { type: 'match.leave' });
    expect(w.store.abandoned).toEqual([{ matchId: [...w.store.matches.keys()][0], userId: caro.player.userId }]);
    expect(seat(w, caro)?.exit).toBe('abandoned');
    // El servidor se apaga: a quienes seguían se les acredita la ronda. A Caro, no.
    await w.hub.shutdown();
    expect(paid(w, ana)).toMatchObject([{ round: 2, coins: 120 }]);
    expect(paid(w, caro)).toEqual([]);
    expect(w.store.coins.get(caro.player.userId)).toBeUndefined();
  });

  it('R-39: quien abandona no recibe aviso después: ya sabe que salió', async () => {
    const w = world({ prepare: oneBlow(2) });
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto, caro], 0);
    await w.say(caro, { type: 'match.leave' });
    expect(caro.last('idle')).toMatchObject({ notice: null });
    expect((await w.back(caro)).last('idle')).toMatchObject({ notice: null });
  });

  it('R-39: quien no volvió antes del final abandonó: no cobra, y se entera la próxima vez, una sola vez', async () => {
    const w = world({ prepare: oneBlow(3) });
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto, caro], 0);
    await w.hub.disconnect(caro);
    await w.say(ana, { type: 'plan.confirm', turn: 1, plan: blow });
    await w.say(beto, { type: 'plan.confirm', turn: 1, plan: {} });
    expect(ana.last('match.end')).toMatchObject({ result: 'victory', coins: { total: 120 } });
    expect(paid(w, caro)).toEqual([]);
    expect(seat(w, caro)).toMatchObject({ exit: 'abandoned', notice: 'left_behind' });
    const caro2 = await w.back(caro);
    expect(caro2.last('idle')).toMatchObject({ notice: 'left_behind' });
    // Mientras no lo cierre, sigue pendiente: por ejemplo, si recarga la página.
    expect((await w.back(caro2)).last('idle')).toMatchObject({ notice: 'left_behind' });
    const caro4 = await w.back(caro);
    await w.say(caro4, { type: 'notice.seen' });
    expect((await w.back(caro4)).last('idle')).toMatchObject({ notice: null });
  });

  it('R-38: si se van todas las personas, nadie cobra', async () => {
    const w = world({ prepare: oneBlow(2) });
    const { ana, beto } = await duo(w);
    await clearRound(w, [ana, beto], 1);
    await w.hub.disconnect(ana);
    await w.hub.disconnect(beto);
    await wait(TIMINGS.emptyMs);
    expect(w.store.ledger).toEqual([]);
    for (const link of [ana, beto]) expect(seat(w, link)).toMatchObject({ exit: 'abandoned', notice: 'left_behind' });
  });
});

describe('Reinicio del servidor (R-54)', () => {
  it('R-54: al apagarse, se acreditan las rondas ya terminadas, y cada persona se entera al volver', async () => {
    const w = world({ prepare: oneBlow(2) });
    const { ana, beto, caro } = await trio(w);
    await clearRound(w, [ana, beto, caro], 1);
    await w.hub.shutdown();
    for (const link of [ana, beto, caro]) {
      expect(link.closedWith).toBe(1012);
      expect(paid(w, link)).toMatchObject([{ round: 2, coins: 120 }]);
      expect(seat(w, link)).toMatchObject({ exit: 'interrupted', notice: 'restart' });
    }
    // El servidor nuevo, con la misma base: quien vuelve llega al inicio en línea, con el aviso.
    const next = new Hub({ log: { info() {}, warn() {}, error() {} }, store: w.store });
    const ana2 = again(ana);
    await next.connect(ana2);
    expect(ana2.received.map((m) => m.type)).toEqual(['welcome', 'idle']);
    expect(ana2.last('idle')).toMatchObject({ reason: null, notice: 'restart' });
  });

  it('R-54: la partida perdida por un reinicio no cuenta como jugada, ganada ni perdida; sus rondas sí', async () => {
    const w = world({ prepare: oneBlow(2) });
    const { ana, beto } = await duo(w);
    await clearRound(w, [ana, beto], 1);
    await w.hub.shutdown();
    expect(w.store.statsOf(ana.player.userId)).toEqual({ matches: 0, rounds: 1, wins: 0 });
  });

  it('R-54: quien ya había abandonado no cobra por el reinicio, ni recibe ese aviso', async () => {
    const w = world({ prepare: oneBlow(2) });
    const { ana, beto, caro } = await trio(w);
    await clearRound(w, [ana, beto, caro], 1);
    await w.say(caro, { type: 'match.leave' });
    await w.hub.shutdown();
    expect(paid(w, caro)).toEqual([]);
    expect(seat(w, caro)).toMatchObject({ exit: 'abandoned', notice: null });
  });

  it('R-54: si otro proceso del servidor dio la partida por interrumpida, aquí también termina, sin pagar dos veces', async () => {
    const w = world({ prepare: oneBlow(2) });
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto, caro], 0);
    // El proceso nuevo arranca durante el despliegue y hace las cuentas de las partidas que encuentra vivas.
    expect(await w.store.interrupt(null)).toBe(1);
    for (const link of [ana, beto, caro]) link.fresh();
    await w.say(ana, { type: 'plan.confirm', turn: 1, plan: blow });
    await w.say(beto, { type: 'plan.confirm', turn: 1, plan: {} });
    await w.say(caro, { type: 'plan.confirm', turn: 1, plan: {} });
    for (const link of [ana, beto, caro]) {
      const got = link.fresh();
      // Ni el turno ni un resultado: de vuelta al inicio, con el aviso del reinicio.
      expect(got.filter((m) => m.type === 'turn.result' || m.type === 'match.end')).toEqual([]);
      expect(got.at(-1)).toMatchObject({ type: 'idle', notice: 'restart' });
    }
    expect(w.hub.live).toBe(0);
    // La ronda que se cerró después de la interrupción no se paga: las cuentas ya estaban hechas.
    expect(w.store.ledger).toEqual([]);
    // Y cada quien queda libre para jugar otra.
    await w.say(ana, { type: 'queue.join', element: 'fire' });
    expect(ana.last('queue.state')).toMatchObject({ you: 'fire' });
  });

  it('R-54: lo mismo si la interrupción llega justo antes del final de la partida', async () => {
    const w = world({
      prepare: board({
        ninjas: { fire: { at: [4, 2], hp: 1 }, water: { hp: 0 }, snow: { hp: 0 } },
        golems: [{ kind: 'colossus', at: [5, 2] }],
      }),
    });
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto, caro], 0);
    await w.store.interrupt(null);
    await w.say(ana, { type: 'plan.confirm', turn: 1, plan: {} });
    expect(ana.last('match.end')).toBeUndefined();
    expect(ana.last('idle')).toMatchObject({ notice: 'restart' });
    // No se anota como derrota: las estadísticas no cuentan esa partida.
    expect(w.store.statsOf(ana.player.userId)).toEqual({ matches: 0, rounds: 0, wins: 0 });
  });
});

describe('Logros por persona (R-55)', () => {
  const combo = () =>
    board({
      ninjas: { fire: { at: [3, 1], hand: [10] }, water: { at: [3, 3], hand: [9] } },
      golems: [{ kind: 'colossus', at: [5, 2] }],
    });
  const card = (id: string) => ({ action: { type: 'card' as const, cardId: id, at: { x: 4, y: 2 } } });

  it('R-55: el logro se guarda en el momento en que ocurre, para quien lo ganó', async () => {
    const w = world({ prepare: combo() });
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto, caro], 0);
    await w.say(ana, { type: 'plan.confirm', turn: 1, plan: card('fire-m1') });
    await w.say(beto, { type: 'plan.confirm', turn: 1, plan: card('water-m1') });
    await w.say(caro, { type: 'plan.confirm', turn: 1, plan: {} });
    expect(ana.last('turn.result')?.state.status).toBe('playing');
    expect(w.store.achievementsOf(ana.player.userId)).toEqual(['combo2']);
    expect(w.store.achievementsOf(beto.player.userId)).toEqual(['combo2']);
    // Caro no jugó carta: el combo no es suyo.
    expect(w.store.achievementsOf(caro.player.userId)).toEqual([]);
  });

  it('R-55: los logros se mantienen aunque después abandone', async () => {
    const w = world({ prepare: combo() });
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto, caro], 0);
    await w.say(ana, { type: 'plan.confirm', turn: 1, plan: card('fire-m1') });
    await w.say(beto, { type: 'plan.confirm', turn: 1, plan: card('water-m1') });
    await w.say(caro, { type: 'plan.confirm', turn: 1, plan: {} });
    await w.say(ana, { type: 'match.leave' });
    expect(w.store.achievementsOf(ana.player.userId)).toEqual(['combo2']);
  });

  it('R-55: quien está desconectado cuando pasa no gana el logro del equipo', async () => {
    const w = world({ prepare: oneBlow(3) });
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto, caro], 0);
    await w.hub.disconnect(caro);
    await w.say(ana, { type: 'plan.confirm', turn: 1, plan: blow });
    await w.say(beto, { type: 'plan.confirm', turn: 1, plan: {} });
    expect(ana.last('match.end')).toMatchObject({ result: 'victory' });
    // Escarcha había caído y ganó de pie, pero Caro no estaba: "De pie otra vez" no es para ella.
    expect(w.store.achievementsOf(caro.player.userId)).toEqual([]);
  });

  it('R-55: el resultado dice qué logros ganó en esa partida y todos los que tiene', async () => {
    const w = world({ prepare: oneBlow(3) });
    const { ana, beto, caro } = await trio(w);
    w.store.giveAchievements(caro.player.userId, ['combo2', 'reviver']);
    w.store.giveAchievements(beto.player.userId, ['upAgain']);
    await clearRound(w, [ana, beto, caro], 1);
    // Escarcha, que lleva Caro, había caído y terminó de pie una partida ganada.
    expect(caro.last('match.end')).toMatchObject({
      earned: ['upAgain'],
      achievements: ['combo2', 'reviver', 'upAgain'],
    });
    expect(ana.last('match.end')).toMatchObject({ earned: [], achievements: [] });
    expect(beto.last('match.end')).toMatchObject({ earned: [], achievements: ['upAgain'] });
  });

  it('R-55: un logro que ya tenía no vuelve a salir como nuevo', async () => {
    const w = world({ prepare: oneBlow(3) });
    const { ana, beto, caro } = await trio(w);
    w.store.giveAchievements(caro.player.userId, ['upAgain']);
    await clearRound(w, [ana, beto, caro], 1);
    expect(caro.last('match.end')).toMatchObject({ earned: [], achievements: ['upAgain'] });
  });
});

describe('El doble de monedas (R-29, D-103)', () => {
  it('R-29: con los 9 logros, las monedas de la partida valen el doble', async () => {
    const w = world({ prepare: oneBlow(3) });
    const { ana, beto, caro } = await trio(w);
    w.store.giveAchievements(ana.player.userId, ACHIEVEMENT_IDS);
    await clearRound(w, [ana, beto, caro], 1);
    expect(ana.last('match.end')).toMatchObject({
      coins: { lines: [{ round: 3, coins: 240 }], doubled: true, total: 240 },
      balance: 240,
    });
    // A quien no los tiene, lo normal.
    expect(beto.last('match.end')).toMatchObject({ coins: { doubled: false, total: 120 }, balance: 120 });
  });

  it('R-29: con 8 logros no hay doble', async () => {
    const w = world({ prepare: oneBlow(3) });
    const { ana, beto, caro } = await trio(w);
    w.store.giveAchievements(ana.player.userId, ACHIEVEMENT_IDS.slice(1));
    await clearRound(w, [ana, beto, caro], 1);
    expect(ana.last('match.end')).toMatchObject({ coins: { doubled: false, total: 120 } });
  });

  it('D-103: quien completa el amuleto en esa misma partida ya cobra el doble', async () => {
    const w = world({ prepare: oneBlow(3) });
    const { ana, beto, caro } = await trio(w);
    // A Caro solo le falta "De pie otra vez", que gana en el turno que termina la partida.
    w.store.giveAchievements(
      caro.player.userId,
      ACHIEVEMENT_IDS.filter((id) => id !== 'upAgain'),
    );
    await clearRound(w, [ana, beto, caro], 1);
    expect(caro.last('match.end')).toMatchObject({
      earned: ['upAgain'],
      coins: { lines: [{ round: 3, coins: 240 }], doubled: true, total: 240 },
    });
    expect(caro.last('match.end')?.achievements).toEqual([...ACHIEVEMENT_IDS]);
  });
});

describe('Estadísticas privadas (R-42)', () => {
  it('R-42: una victoria cuenta como partida jugada y ganada, con sus rondas', async () => {
    const w = world({ prepare: oneBlow(3) });
    const { ana, beto, caro } = await trio(w);
    await clearRound(w, [ana, beto, caro], 1);
    for (const link of [ana, beto, caro]) {
      expect(w.store.statsOf(link.player.userId)).toEqual({ matches: 1, rounds: 1, wins: 1 });
    }
  });

  it('R-42: una derrota cuenta como jugada y no ganada', async () => {
    const w = world({
      prepare: board({
        ninjas: { fire: { at: [4, 2], hp: 1 }, water: { hp: 0 }, snow: { hp: 0 } },
        golems: [{ kind: 'colossus', at: [5, 2] }],
      }),
    });
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto, caro], 0);
    await w.say(ana, { type: 'plan.confirm', turn: 1, plan: {} });
    expect(w.store.statsOf(ana.player.userId)).toEqual({ matches: 1, rounds: 0, wins: 0 });
  });

  it('R-42: una partida abandonada cuenta como jugada y no ganada, aunque el equipo gane después', async () => {
    const w = world({ prepare: oneBlow(3) });
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto, caro], 0);
    await w.say(caro, { type: 'match.leave' });
    await w.say(ana, { type: 'plan.confirm', turn: 1, plan: blow });
    await w.say(beto, { type: 'plan.confirm', turn: 1, plan: {} });
    expect(ana.last('match.end')).toMatchObject({ result: 'victory' });
    expect(w.store.statsOf(caro.player.userId)).toEqual({ matches: 1, rounds: 0, wins: 0 });
    expect(w.store.statsOf(ana.player.userId)).toEqual({ matches: 1, rounds: 1, wins: 1 });
  });

  it('R-42: las rondas que superó antes de abandonar cuentan', async () => {
    const w = world({ prepare: oneBlow(2) });
    const { ana, beto, caro } = await trio(w);
    await clearRound(w, [ana, beto, caro], 1);
    await w.say(caro, { type: 'match.leave' });
    expect(w.store.statsOf(caro.player.userId)).toEqual({ matches: 1, rounds: 1, wins: 0 });
  });

  it('R-42: quien no volvió antes del final cuenta la partida como jugada y no ganada', async () => {
    const w = world({ prepare: oneBlow(3) });
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto, caro], 0);
    await w.hub.disconnect(caro);
    await w.say(ana, { type: 'plan.confirm', turn: 1, plan: blow });
    await w.say(beto, { type: 'plan.confirm', turn: 1, plan: {} });
    expect(w.store.statsOf(caro.player.userId)).toEqual({ matches: 1, rounds: 0, wins: 0 });
  });
});

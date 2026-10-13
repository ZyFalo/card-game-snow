import { ACHIEVEMENT_IDS, achievementGoal } from '@ventisca/core';
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
  /** Brasa y Marea juegan su carta sobre el coloso: un combo de dos. */
  async function playCombo(w: World, links: FakeLink[]): Promise<void> {
    const [ana, beto, caro] = links as [FakeLink, FakeLink, FakeLink | undefined];
    await watched(w, links, 0);
    await w.say(ana, { type: 'plan.confirm', turn: 1, plan: card('fire-m1') });
    await w.say(beto, { type: 'plan.confirm', turn: 1, plan: card('water-m1') });
    if (caro) await w.say(caro, { type: 'plan.confirm', turn: 1, plan: {} });
  }
  /** La última ronda, a un golpe de llegar al bonus con los tres a vida completa. */
  const toBonus = () =>
    board({ round: 3, ninjas: { fire: { at: [3, 2] } }, golems: [{ kind: 'sniper', at: [5, 2], hp: 1 }] });

  it('R-55: el avance se suma en el turno en que pasa, y el de cada pliegue, solo a quien lleva a ese ninja', async () => {
    const w = world({ prepare: combo() });
    const { ana, beto, caro } = await trio(w);
    await playCombo(w, [ana, beto, caro]);
    expect(ana.last('turn.result')?.state.status).toBe('playing');
    // Ana, con Brasa, aturdió y quemó al coloso. Beto, con Marea, les dio Potencia a sus dos compañeros.
    expect(w.store.countsOf(ana.player.userId)).toEqual({ stunner: 1, blaze: 1 });
    expect(w.store.countsOf(beto.player.userId)).toEqual({ highTide: 2 });
    // Caro, con Escarcha, no hizo nada de lo suyo: lo de Brasa y lo de Marea no es para ella.
    expect(w.store.countsOf(caro.player.userId)).toEqual({});
  });

  it('R-55: el avance se mantiene aunque después abandone', async () => {
    const w = world({ prepare: combo() });
    const { ana, beto, caro } = await trio(w);
    await playCombo(w, [ana, beto, caro]);
    await w.say(ana, { type: 'match.leave' });
    expect(w.store.countsOf(ana.player.userId)).toEqual({ stunner: 1, blaze: 1 });
  });

  it('R-55: un turno que solo deja rondas superadas tampoco pide sumar hazañas', async () => {
    const w = world({ prepare: oneBlow(2) });
    const { ana, beto, caro } = await trio(w);
    await clearRound(w, [ana, beto, caro], 1);
    expect(seat(w, ana)?.rounds).toEqual([2]);
    expect(w.store.featsAsked).toBe(0);
  });

  it('R-55: lo que logra el equipo se le suma a todas las personas conectadas cuando pasa', async () => {
    const w = world({ prepare: toBonus() });
    const { ana, beto, caro } = await trio(w);
    await clearRound(w, [ana, beto, caro], 1);
    expect(ana.last('turn.result')?.state.round).toBe('bonus');
    for (const link of [ana, beto, caro]) expect(w.store.countsOf(link.player.userId)).toEqual({ untouched: 1 });
  });

  it('R-55: a quien está desconectado cuando pasa no se le suma, ni lo del equipo ni lo de su ninja', async () => {
    const team = world({ prepare: toBonus() });
    const first = await trio(team);
    await watched(team, [first.ana, first.beto, first.caro], 0);
    await team.hub.disconnect(first.caro);
    await team.say(first.ana, { type: 'plan.confirm', turn: 1, plan: blow });
    await team.say(first.beto, { type: 'plan.confirm', turn: 1, plan: {} });
    expect(first.ana.last('turn.result')?.state.round).toBe('bonus');
    expect(team.store.countsOf(first.ana.player.userId)).toEqual({ untouched: 1 });
    expect(team.store.countsOf(first.caro.player.userId)).toEqual({});

    // Marea había caído y gana de pie, pero Beto no estaba: "De pie otra vez" no se le suma.
    const own = world({
      prepare: board({
        round: 3,
        ninjas: { fire: { at: [3, 2] }, water: { everKo: true } },
        golems: [{ kind: 'sniper', at: [5, 2], hp: 1 }],
      }),
    });
    const second = await trio(own);
    await watched(own, [second.ana, second.beto, second.caro], 0);
    await own.hub.disconnect(second.beto);
    await own.say(second.ana, { type: 'plan.confirm', turn: 1, plan: blow });
    await own.say(second.caro, { type: 'plan.confirm', turn: 1, plan: {} });
    expect(second.ana.last('match.end')).toMatchObject({ result: 'victory' });
    expect(own.store.countsOf(second.beto.player.userId)).toEqual({});
  });

  it('R-55: el bot no suma: solo avanzan las cuentas de las personas', async () => {
    const w = world({ prepare: toBonus() });
    const { ana, beto } = await duo(w);
    await clearRound(w, [ana, beto], 1);
    expect(ana.last('turn.result')?.state.round).toBe('bonus');
    expect([...w.store.progress.keys()].sort()).toEqual([ana.player.userId, beto.player.userId].sort());
    expect(w.store.countsOf(beto.player.userId)).toEqual({ untouched: 1 });
  });

  it('R-55: un turno en que nadie hace nada de lo que cuentan no le pide nada a la base', async () => {
    const w = world({ prepare: combo() });
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto, caro], 0);
    for (const link of [ana, beto, caro]) await w.say(link, { type: 'plan.confirm', turn: 1, plan: {} });
    expect(ana.last('turn.result')?.turn).toBe(1);
    expect(w.store.featsAsked).toBe(0);
    expect([...w.store.progress.keys()]).toEqual([]);
    // En el turno siguiente sí hay hazañas, y se piden una sola vez.
    await watched(w, [ana, beto, caro], 1);
    await w.say(ana, { type: 'plan.confirm', turn: 2, plan: card('fire-m1') });
    await w.say(beto, { type: 'plan.confirm', turn: 2, plan: card('water-m1') });
    await w.say(caro, { type: 'plan.confirm', turn: 2, plan: {} });
    expect(w.store.featsAsked).toBe(1);
    expect(w.store.countsOf(ana.player.userId)).toEqual({ stunner: 1, blaze: 1 });
  });

  it('R-55: lo que un logro suma en varios turnos de la partida se junta en el resultado', async () => {
    // Dos gólems a un golpe de Marea, que derriba uno por turno: el coloso se queda a su lado, pegándole.
    // Sin bonus: Escarcha ya había caído.
    const w = world({
      prepare: board({
        round: 3,
        ninjas: { water: { at: [4, 2] }, snow: { everKo: true } },
        golems: [
          { kind: 'sniper', at: [5, 2], hp: 1 },
          { kind: 'colossus', at: [4, 3], hp: 1 },
        ],
      }),
    });
    const { ana, beto, caro } = await trio(w);
    const hit = (targetId: string) => ({ action: { type: 'attack' as const, targetId } });
    await watched(w, [ana, beto, caro], 0);
    await w.say(beto, { type: 'plan.confirm', turn: 1, plan: hit('e1') });
    await w.say(ana, { type: 'plan.confirm', turn: 1, plan: {} });
    await w.say(caro, { type: 'plan.confirm', turn: 1, plan: {} });
    expect(beto.last('turn.result')?.state.status).toBe('playing');
    expect(w.store.countsOf(beto.player.userId)).toEqual({ breakwater: 1 });
    await watched(w, [ana, beto, caro], 1);
    await w.say(beto, { type: 'plan.confirm', turn: 2, plan: hit('e2') });
    await w.say(ana, { type: 'plan.confirm', turn: 2, plan: {} });
    await w.say(caro, { type: 'plan.confirm', turn: 2, plan: {} });
    const end = beto.last('match.end');
    expect(end).toMatchObject({ result: 'victory', gained: { breakwater: 2 }, completed: [] });
    expect(end?.achievements.breakwater).toEqual({ count: 2, done: false });
    expect(ana.last('match.end')).toMatchObject({ gained: {}, completed: [] });
  });

  it('R-55: el resultado dice cuánto sumó cada logro en esa partida, entre todos sus turnos, y cómo queda', async () => {
    // Un gólem que aguanta la carta de Brasa y cae con su ataque del turno siguiente.
    const w = world({
      prepare: board({
        round: 3,
        ninjas: { fire: { at: [3, 2], hand: [10] }, snow: { everKo: true } },
        golems: [{ kind: 'sniper', at: [5, 2], hp: 11 }],
      }),
    });
    const { ana, beto, caro } = await trio(w);
    w.store.giveProgress(ana.player.userId, { stunner: 3 });
    await watched(w, [ana, beto, caro], 0);
    await w.say(ana, {
      type: 'plan.confirm',
      turn: 1,
      plan: { action: { type: 'card', cardId: 'fire-m1', at: { x: 5, y: 2 } } },
    });
    await w.say(beto, { type: 'plan.confirm', turn: 1, plan: {} });
    await w.say(caro, { type: 'plan.confirm', turn: 1, plan: {} });
    expect(ana.last('turn.result')?.state.status).toBe('playing');
    await clearRound(w, [ana, beto, caro], 2);
    const end = ana.last('match.end');
    expect(end).toMatchObject({ result: 'victory', gained: { stunner: 1 }, completed: [] });
    expect(end?.achievements.stunner).toEqual({ count: 4, done: false });
    expect(end?.achievements.blaze).toEqual({ count: 0, done: false });
    // A cada quien, lo suyo: Beto y Caro no sumaron nada.
    expect(beto.last('match.end')).toMatchObject({ gained: {}, completed: [] });
    expect(caro.last('match.end')?.achievements.stunner).toEqual({ count: 0, done: false });
  });

  /** La última ronda, con Marea de pie después de haber caído: al ganar, suma "De pie otra vez". */
  const upAgain = () =>
    board({
      round: 3,
      ninjas: { fire: { at: [3, 2] }, water: { everKo: true } },
      golems: [{ kind: 'sniper', at: [5, 2], hp: 1 }],
    });

  it('R-55: el logro que llega a su meta en la partida sale como recién completado', async () => {
    const w = world({ prepare: upAgain() });
    const { ana, beto, caro } = await trio(w);
    const goal = achievementGoal('upAgain');
    w.store.giveProgress(beto.player.userId, { upAgain: goal - 1 });
    await clearRound(w, [ana, beto, caro], 1);
    const end = beto.last('match.end');
    expect(end).toMatchObject({ gained: { upAgain: 1 }, completed: ['upAgain'] });
    expect(end?.achievements.upAgain).toEqual({ count: goal, done: true });
    expect(ana.last('match.end')).toMatchObject({ gained: {}, completed: [] });
  });

  it('R-55: un logro que ya estaba completo no vuelve a sumar ni a salir como nuevo', async () => {
    const w = world({ prepare: upAgain() });
    const { ana, beto, caro } = await trio(w);
    w.store.giveAchievements(beto.player.userId, ['upAgain']);
    await clearRound(w, [ana, beto, caro], 1);
    const end = beto.last('match.end');
    expect(end).toMatchObject({ gained: {}, completed: [] });
    expect(end?.achievements.upAgain).toEqual({ count: achievementGoal('upAgain'), done: true });
  });
});

describe('El doble de monedas (R-29, D-103)', () => {
  it('R-29: con los cuatro pliegues completos, las monedas de la partida valen el doble', async () => {
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

  it('R-29: con un pliegue sin completar no hay doble, aunque sea el de equipo', async () => {
    for (const missing of ['blaze', 'combo3'] as const) {
      const w = world({ prepare: oneBlow(3) });
      const { ana, beto, caro } = await trio(w);
      w.store.giveAchievements(
        ana.player.userId,
        ACHIEVEMENT_IDS.filter((id) => id !== missing),
      );
      await clearRound(w, [ana, beto, caro], 1);
      expect(ana.last('match.end'), missing).toMatchObject({ coins: { doubled: false, total: 120 } });
    }
  });

  it('D-103: quien completa el amuleto en esa misma partida ya cobra el doble', async () => {
    // Los tres cayeron y están de pie: al ganar, el equipo suma "Nadie se queda atrás".
    const w = world({
      prepare: board({
        round: 3,
        ninjas: { fire: { at: [3, 2], everKo: true }, water: { everKo: true }, snow: { everKo: true } },
        golems: [{ kind: 'sniper', at: [5, 2], hp: 1 }],
      }),
    });
    const { ana, beto, caro } = await trio(w);
    // A Caro solo le falta una vez de ese logro, que suma en el turno que termina la partida.
    w.store.giveAchievements(
      caro.player.userId,
      ACHIEVEMENT_IDS.filter((id) => id !== 'noOneLeft'),
    );
    w.store.giveProgress(caro.player.userId, { noOneLeft: achievementGoal('noOneLeft') - 1 });
    await clearRound(w, [ana, beto, caro], 1);
    expect(caro.last('match.end')).toMatchObject({
      gained: { noOneLeft: 1 },
      completed: ['noOneLeft'],
      coins: { lines: [{ round: 3, coins: 240 }], doubled: true, total: 240 },
    });
    expect(w.store.completedOf(caro.player.userId)).toEqual([...ACHIEVEMENT_IDS]);
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

import { createMatch, type MatchState, planTeam, resolveTurn, rngFrom, runReplay } from '@ventisca/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HostMessage } from './GameHost';
import { LocalHost } from './LocalHost';

/*
 * GameHost asíncrono (PRD de v2): pedir una partida y enviar los planes devuelven una promesa,
 * y lo que resuelve el motor llega después como mensaje, igual que llegará por la red.
 */
describe('LocalHost: GameHost asíncrono', () => {
  const opts = { seed: 42, difficulty: 'classic' as const };

  function listen(host: LocalHost): HostMessage[] {
    const got: HostMessage[] = [];
    host.subscribe((m) => got.push(m));
    return got;
  }

  it('start devuelve una promesa y el estado inicial llega como mensaje matchStart, después de la llamada', async () => {
    const host = new LocalHost();
    const got = listen(host);
    const pending = host.start(opts);
    expect(pending).toBeInstanceOf(Promise);
    expect(got).toEqual([]);
    await pending;
    expect(got).toEqual([{ type: 'matchStart', ...createMatch(opts) }]);
  });

  it('submit devuelve una promesa y el turno llega como mensaje turnResult, igual que con resolveTurn', async () => {
    const host = new LocalHost();
    const got = listen(host);
    await host.start(opts);
    const { state } = createMatch(opts);
    const plans = planTeam(state, { skill: 1, rng: rngFrom(7) });
    const pending = host.submit(plans);
    expect(pending).toBeInstanceOf(Promise);
    expect(got).toHaveLength(1);
    await pending;
    expect(got).toHaveLength(2);
    expect(got[1]).toEqual({ type: 'turnResult', ...resolveTurn(state, plans) });
  });

  it('una partida entera por mensajes deja los mismos hashes que su repetición (R-23)', async () => {
    const host = new LocalHost();
    const got = listen(host);
    await host.start(opts);
    const turnResults = () => got.filter((m) => m.type === 'turnResult');
    const rng = rngFrom(9);
    let state: MatchState = got[0]?.state ?? createMatch(opts).state;
    while (state.status === 'playing' && state.turn < 200) {
      await host.submit(planTeam(state, { skill: 1, rng }));
      state = turnResults().at(-1)?.state ?? state;
    }
    expect(state.status).not.toBe('playing');
    const replay = host.replay();
    expect(replay).not.toBeNull();
    // El primer hash de la repetición es el del estado inicial; los demás, uno por turno.
    if (replay) expect(runReplay(replay).hashes.slice(1)).toEqual(turnResults().map((m) => m.hash));
  });

  it('submit sin partida se rechaza', async () => {
    await expect(new LocalHost().submit([])).rejects.toThrow('No hay partida en curso.');
  });

  it('quien deja de escuchar no recibe más mensajes, ni los que ya estaban en camino', async () => {
    const host = new LocalHost();
    const got: HostMessage[] = [];
    const stop = host.subscribe((m) => got.push(m));
    const pending = host.start(opts);
    stop();
    await pending;
    expect(got).toEqual([]);
  });

  it('close descarta los mensajes en camino', async () => {
    const host = new LocalHost();
    const got = listen(host);
    const pending = host.start(opts);
    host.close();
    await pending;
    expect(got).toEqual([]);
  });
});

/* R-04: el reloj del sandbox vive en el host, no en el motor. */
describe('LocalHost: reloj del turno', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('R-04: vence a su hora y la pausa lo congela', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const host = new LocalHost();
    const onTimeout = vi.fn();
    host.startTimer(10_000, onTimeout);
    vi.advanceTimersByTime(4_000);
    host.pauseTimer();
    expect(host.timer()).toEqual({ deadline: null, remaining: 6_000 });
    vi.advanceTimersByTime(60_000);
    expect(onTimeout).not.toHaveBeenCalled();
    host.resumeTimer();
    vi.advanceTimersByTime(5_999);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('R-04: en ritmo Relajado no hay reloj', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const host = new LocalHost();
    const onTimeout = vi.fn();
    host.startTimer(null, onTimeout);
    expect(host.timer()).toEqual({ deadline: null, remaining: null });
    vi.advanceTimersByTime(600_000);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('close detiene el reloj', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const host = new LocalHost();
    const onTimeout = vi.fn();
    host.startTimer(10_000, onTimeout);
    host.close();
    vi.advanceTimersByTime(60_000);
    expect(onTimeout).not.toHaveBeenCalled();
  });
});

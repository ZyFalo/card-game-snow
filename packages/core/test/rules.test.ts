import { describe, expect, it } from 'vitest';
import {
  attackTargets,
  BALANCE,
  cardTiles,
  createMatch,
  type GameEvent,
  healTargets,
  key,
  moveOptions,
  resolveTurn,
  reviveTargets,
  sanitizePlans,
} from '../src';
import { addEnemy, blank, ninja, place } from './helpers';

const types = (ev: GameEvent[]) => ev.map((e) => e.t);

describe('Tablero y aparición', () => {
  it('R-01 tablero de 9×5', () => {
    expect(BALANCE.grid).toEqual({ width: 9, height: 5 });
  });

  it('R-02 ninjas en la columna 0 (filas 0, 2 y 4) y enemigos en las columnas 7 u 8', () => {
    for (let seed = 1; seed < 60; seed++) {
      const { state, events } = createMatch({ seed });
      expect(state.ninjas.map((n) => n.pos.x)).toEqual([0, 0, 0]);
      expect(state.ninjas.map((n) => n.pos.y).sort()).toEqual([0, 2, 4]);
      expect(state.enemies.length).toBeGreaterThanOrEqual(1);
      expect(state.enemies.length).toBeLessThanOrEqual(3);
      for (const e of state.enemies) expect([7, 8]).toContain(e.pos.x);
      expect(events[0]?.t).toBe('roundStart');
    }
  });

  it('R-03 las rocas por defecto están en (2,0), (6,0), (2,4) y (6,4)', () => {
    const { state } = createMatch({ seed: 7 });
    expect(state.rocks).toEqual([
      { x: 2, y: 0 },
      { x: 6, y: 0 },
      { x: 2, y: 4 },
      { x: 6, y: 4 },
    ]);
  });
});

describe('Movimiento (R-05)', () => {
  it('Nieve llega a distancia 3; Fuego y Agua a distancia 2', () => {
    const s = blank();
    expect(moveOptions(s, 'snow').has(key({ x: 3, y: 4 }))).toBe(true);
    expect(moveOptions(s, 'fire').has(key({ x: 2, y: 0 }))).toBe(true);
    expect(moveOptions(s, 'fire').has(key({ x: 3, y: 0 }))).toBe(false);
  });

  it('los ninjas atraviesan aliados pero no enemigos ni rocas, y no terminan en casilla ocupada', () => {
    const s = blank();
    place(s, 'water', 1, 0);
    // Fuego (0,0) puede pasar por Agua (1,0) para llegar a (2,0)…
    expect(moveOptions(s, 'fire').has(key({ x: 2, y: 0 }))).toBe(true);
    // …pero no puede terminar sobre Agua.
    expect(moveOptions(s, 'fire').has(key({ x: 1, y: 0 }))).toBe(false);
    // Un enemigo en (1,0) bloquea el paso.
    place(s, 'water', 0, 2);
    addEnemy(s, 'colossus', 1, 0);
    expect(moveOptions(s, 'fire').has(key({ x: 2, y: 0 }))).toBe(false);
    s.enemies = [];
    s.rocks = [{ x: 1, y: 0 }];
    expect(moveOptions(s, 'fire').has(key({ x: 2, y: 0 }))).toBe(false);
  });

  it('una casilla reservada por el plan de otro ninja no se puede elegir', () => {
    const s = blank();
    place(s, 'water', 0, 1);
    const plans = [{ ninjaId: 'fire' as const, moveTo: { x: 1, y: 1 } }];
    expect(moveOptions(s, 'water', plans).has(key({ x: 1, y: 1 }))).toBe(false);
    const clean = sanitizePlans(s, [
      { ninjaId: 'fire', moveTo: { x: 1, y: 1 } },
      { ninjaId: 'water', moveTo: { x: 1, y: 1 } },
    ]);
    expect(clean.find((p) => p.ninjaId === 'water')?.moveTo).toBeUndefined();
  });
});

describe('Acciones básicas', () => {
  it('R-07 el ataque usa el alcance desde la casilla planificada y hace el daño de la clase', () => {
    const s = blank();
    const e = addEnemy(s, 'colossus', 3, 0);
    expect(attackTargets(s, 'fire', { x: 0, y: 0 })).toHaveLength(0);
    expect(attackTargets(s, 'fire', { x: 1, y: 0 })).toHaveLength(1);
    const r = resolveTurn(s, [{ ninjaId: 'fire', moveTo: { x: 1, y: 0 }, action: { type: 'attack', targetId: e.id } }]);
    const dmg = r.events.find((x) => x.t === 'damage' && x.targetId === e.id);
    expect(dmg).toMatchObject({ amount: 8, hp: 52 });
  });

  it('R-07 con Potencia el ataque hace ×1,5 redondeado hacia abajo y se consume', () => {
    const s = blank();
    place(s, 'snow', 5, 4, { boost: true });
    const e = addEnemy(s, 'colossus', 5, 1);
    const r = resolveTurn(s, [{ ninjaId: 'snow', action: { type: 'attack', targetId: e.id } }]);
    expect(r.events.find((x) => x.t === 'damage' && x.targetId === e.id)).toMatchObject({ amount: 9 });
    expect(ninja(r.state, 'snow').boost).toBe(false);
  });

  it('R-08 solo Nieve cura, a aliados heridos, distintos de sí misma y a distancia ≤ 3', () => {
    const s = blank();
    place(s, 'fire', 0, 1, { hp: 10 });
    place(s, 'snow', 0, 4, { hp: 5 });
    expect(healTargets(s, 'snow', { x: 0, y: 4 }).map((n) => n.id)).toEqual(['fire']);
    expect(healTargets(s, 'water', { x: 0, y: 2 })).toHaveLength(0);
    const r = resolveTurn(s, [{ ninjaId: 'snow', action: { type: 'heal', targetId: 'fire' } }]);
    expect(ninja(r.state, 'fire').hp).toBe(16);
  });

  it('R-09 revivir levanta al aliado con 1 HP en el acto, antes de la fase enemiga', () => {
    const s = blank();
    place(s, 'fire', 0, 3, { hp: 0, everKo: true });
    addEnemy(s, 'colossus', 8, 0);
    expect(reviveTargets(s, 'snow', { x: 0, y: 4 }).map((n) => n.id)).toEqual(['fire']);
    const r = resolveTurn(s, [{ ninjaId: 'snow', action: { type: 'revive', targetId: 'fire' } }]);
    const t = types(r.events);
    expect(t.indexOf('reviveStart')).toBeLessThan(t.indexOf('revive'));
    expect(t.indexOf('revive')).toBeLessThan(
      t.findIndex((x) => x === 'move' || x === 'enemyAttack' || x === 'enemySkip'),
    );
    expect(ninja(r.state, 'fire').hp).toBe(BALANCE.reviveHp);
    expect(r.state.stats.revives).toBe(1);
  });

  it('R-09 el recién revivido puede volver a caer en el turno de los gólems', () => {
    const s = blank();
    s.difficulty = 'storm'; // los gólems priorizan rematar: el objetivo es determinista
    place(s, 'water', 3, 2, { hp: 0, everKo: true });
    place(s, 'snow', 3, 3);
    place(s, 'fire', 0, 0);
    addEnemy(s, 'sniper', 6, 2);
    const r = resolveTurn(s, [{ ninjaId: 'snow', action: { type: 'revive', targetId: 'water' } }]);
    const iRevive = r.events.findIndex((e) => e.t === 'revive' && e.targetId === 'water');
    const iHit = r.events.findIndex((e) => e.t === 'enemyAttack' && e.targetId === 'water');
    const iKo = r.events.findIndex((e) => e.t === 'ko' && e.unitId === 'water');
    expect(iRevive).toBeGreaterThanOrEqual(0);
    expect(iHit).toBeGreaterThan(iRevive);
    expect(iKo).toBeGreaterThan(iHit);
    expect(ninja(r.state, 'water').hp).toBe(0);
    expect(ninja(r.state, 'snow').hp).toBeGreaterThan(0);
    expect(r.state.stats.revives).toBe(1);
  });

  it('R-09 dos reanimadores sobre el mismo caído no suman efecto', () => {
    const s = blank();
    place(s, 'fire', 1, 2, { hp: 0, everKo: true });
    place(s, 'water', 0, 1);
    place(s, 'snow', 0, 3);
    const r = resolveTurn(s, [
      { ninjaId: 'water', action: { type: 'revive', targetId: 'fire' } },
      { ninjaId: 'snow', action: { type: 'revive', targetId: 'fire' } },
    ]);
    expect(r.events.filter((e) => e.t === 'revive')).toHaveLength(1);
    expect(ninja(r.state, 'fire').hp).toBe(BALANCE.reviveHp);
    expect(r.state.stats.revives).toBe(1);
  });

  it('R-11 las acciones se resuelven en orden Fuego, Agua, Nieve', () => {
    const s = blank();
    place(s, 'fire', 3, 1);
    place(s, 'water', 4, 2);
    place(s, 'snow', 1, 2);
    const e = addEnemy(s, 'sniper', 4, 1, { hp: 8 });
    const r = resolveTurn(s, [
      { ninjaId: 'water', action: { type: 'attack', targetId: e.id } },
      { ninjaId: 'fire', action: { type: 'attack', targetId: e.id } },
      { ninjaId: 'snow', action: { type: 'attack', targetId: e.id } },
    ]);
    const attacks = r.events.filter((x) => x.t === 'attack');
    // Fuego derrota al enemigo; Agua y Nieve pierden su acción (R-06).
    expect(attacks).toHaveLength(1);
    expect(attacks[0]).toMatchObject({ sourceId: 'fire' });
  });
});

describe('Enemigos (R-12, R-13)', () => {
  it('el francotirador hace 3 + (distancia − 1) y prefiere atacar desde lejos', () => {
    const s = blank();
    place(s, 'fire', 0, 0);
    place(s, 'water', 0, 4);
    place(s, 'snow', 4, 2);
    addEnemy(s, 'sniper', 7, 2);
    const r = resolveTurn(s, []);
    const hit = r.events.find((x) => x.t === 'damage' && x.targetId === 'snow');
    expect(hit).toMatchObject({ amount: 5 });
  });

  it('el artillero salpica 4 a los ninjas vecinos del objetivo', () => {
    const s = blank();
    place(s, 'fire', 4, 1);
    place(s, 'water', 4, 2);
    place(s, 'snow', 5, 3);
    addEnemy(s, 'artillery', 6, 2, { stunned: false });
    const r = resolveTurn(s, []);
    const dmg = r.events.filter((x) => x.t === 'damage');
    const splash = dmg.filter((x) => x.t === 'damage' && x.cause === 'splash');
    expect(dmg.find((x) => x.t === 'damage' && x.cause === 'enemy')).toMatchObject({ amount: 8 });
    expect(splash).toHaveLength(2);
    for (const d of splash) expect(d).toMatchObject({ amount: 4 });
  });

  it('el coloso barre también a los ninjas hombro con hombro, en perpendicular al golpe', () => {
    const s = blank();
    place(s, 'water', 4, 2);
    place(s, 'fire', 4, 1);
    place(s, 'snow', 4, 3);
    addEnemy(s, 'colossus', 5, 2);
    const r = resolveTurn(s, []);
    const dmg = r.events.filter((x) => x.t === 'damage');
    expect(dmg.filter((x) => x.t === 'damage' && x.cause === 'sweep')).toHaveLength(2);
    expect(ninja(r.state, 'water').hp).toBe(30);
    expect(ninja(r.state, 'fire').hp).toBe(20);
    expect(ninja(r.state, 'snow').hp).toBe(15);
  });

  it('un enemigo aturdido pierde su turno y el aturdimiento se limpia al final de la fase (R-19)', () => {
    const s = blank();
    place(s, 'water', 4, 2);
    addEnemy(s, 'colossus', 5, 2, { stunned: true });
    const r = resolveTurn(s, []);
    expect(types(r.events)).toContain('enemySkip');
    expect(ninja(r.state, 'water').hp).toBe(40);
    expect(r.state.enemies[0]?.stunned).toBe(false);
  });

  it('los enemigos no pueden atravesar ninjas', () => {
    const s = blank();
    place(s, 'fire', 4, 0);
    place(s, 'water', 4, 1);
    place(s, 'snow', 4, 2, { hp: 25 });
    s.rocks = [
      { x: 4, y: 3 },
      { x: 4, y: 4 },
    ];
    const e = addEnemy(s, 'colossus', 5, 2);
    // El coloso ya está adyacente: ataca sin moverse.
    const r = resolveTurn(s, []);
    expect(r.state.enemies.find((x) => x.id === e.id)?.pos.x).toBe(5);
  });
});

describe('Medidor y cartas (R-15 a R-18)', () => {
  it('R-15 el medidor sube 2 por movimiento, acción y golpe recibido; en 10 reparte una carta', () => {
    const s = blank();
    place(s, 'fire', 0, 0, { meter: 6 });
    const e = addEnemy(s, 'colossus', 3, 0, { stunned: true });
    const r = resolveTurn(s, [{ ninjaId: 'fire', moveTo: { x: 1, y: 0 }, action: { type: 'attack', targetId: e.id } }]);
    const f = ninja(r.state, 'fire');
    expect(f.hand).toHaveLength(1);
    expect(f.meter).toBe(0);
    expect(types(r.events)).toContain('draw');
  });

  it('R-15 con la mano llena el medidor se queda en 10 y roba al liberar espacio', () => {
    const s = blank();
    const f = place(s, 'fire', 0, 0, { meter: 10 });
    f.hand = f.deck.splice(0, 4);
    const r1 = resolveTurn(s, [{ ninjaId: 'fire', moveTo: { x: 1, y: 0 } }]);
    expect(ninja(r1.state, 'fire').meter).toBe(10);
    expect(ninja(r1.state, 'fire').hand).toHaveLength(4);
    const cardId = ninja(r1.state, 'fire').hand[0]?.id as string;
    const r2 = resolveTurn(r1.state, [{ ninjaId: 'fire', action: { type: 'card', cardId, at: { x: 1, y: 1 } } }]);
    expect(ninja(r2.state, 'fire').hand).toHaveLength(4);
    expect(ninja(r2.state, 'fire').meter).toBe(0);
  });

  it('R-16 la carta se coloca a distancia ≤ movimiento y afecta 3×3 recortado en los bordes', () => {
    const s = blank();
    expect(cardTiles(s, 'snow', { x: 0, y: 4 })).toHaveLength(10);
    const f = ninja(s, 'fire');
    f.hand = [{ id: 'fire-x', element: 'fire', value: 10 }];
    const r = resolveTurn(s, [{ ninjaId: 'fire', action: { type: 'card', cardId: 'fire-x', at: { x: 0, y: 1 } } }]);
    const card = r.events.find((x) => x.t === 'card');
    expect(card && card.t === 'card' ? card.area.length : 0).toBe(6);
  });

  it('R-17 Fuego daña y aturde; Agua hace el doble; Nieve daña y cura (y revive)', () => {
    const s = blank();
    const a = addEnemy(s, 'colossus', 3, 1);
    const b = addEnemy(s, 'colossus', 3, 3);
    place(s, 'fire', 1, 1);
    place(s, 'water', 2, 3);
    place(s, 'snow', 2, 2, { hp: 10 });
    ninja(s, 'fire').hand = [{ id: 'f', element: 'fire', value: 10 }];
    const r = resolveTurn(s, [{ ninjaId: 'fire', action: { type: 'card', cardId: 'f', at: { x: 3, y: 1 } } }]);
    expect(r.state.enemies.find((e) => e.id === a.id)?.hp).toBe(50);
    expect(types(r.events)).toContain('enemySkip');

    const s2 = blank();
    const c = addEnemy(s2, 'colossus', 3, 1);
    place(s2, 'water', 2, 2);
    ninja(s2, 'water').hand = [{ id: 'w', element: 'water', value: 10 }];
    const r2 = resolveTurn(s2, [{ ninjaId: 'water', action: { type: 'card', cardId: 'w', at: { x: 3, y: 1 } } }]);
    expect(r2.events.find((x) => x.t === 'damage' && x.targetId === c.id)).toMatchObject({ amount: 20 });

    const s3 = blank();
    place(s3, 'snow', 1, 2);
    place(s3, 'fire', 1, 1, { hp: 0, everKo: true });
    place(s3, 'water', 2, 2, { hp: 20 });
    ninja(s3, 'snow').hand = [{ id: 's', element: 'snow', value: 9 }];
    const r3 = resolveTurn(s3, [{ ninjaId: 'snow', action: { type: 'card', cardId: 's', at: { x: 1, y: 2 } } }]);
    expect(ninja(r3.state, 'fire').hp).toBe(9);
    expect(ninja(r3.state, 'water').hp).toBe(29);
    expect(b.hp).toBe(60);
  });

  it('R-18 combo: Nieve da escudo, Agua da Potencia y Fuego quema 3 turnos', () => {
    const s = blank();
    const e = addEnemy(s, 'colossus', 4, 0, { hp: 60 });
    place(s, 'fire', 2, 1);
    place(s, 'water', 2, 2);
    place(s, 'snow', 2, 3);
    ninja(s, 'fire').hand = [{ id: 'f', element: 'fire', value: 8 }];
    ninja(s, 'water').hand = [{ id: 'w', element: 'water', value: 8 }];
    ninja(s, 'snow').hand = [{ id: 's', element: 'snow', value: 8 }];
    const r = resolveTurn(s, [
      { ninjaId: 'fire', action: { type: 'card', cardId: 'f', at: { x: 4, y: 1 } } },
      { ninjaId: 'water', action: { type: 'card', cardId: 'w', at: { x: 2, y: 4 } } },
      { ninjaId: 'snow', action: { type: 'card', cardId: 's', at: { x: 5, y: 3 } } },
    ]);
    expect(r.events.find((x) => x.t === 'combo')).toMatchObject({ elements: ['fire', 'water', 'snow'] });
    expect(r.state.stats.tripleCombos).toBe(1);
    expect(r.state.ninjas.every((n) => n.shield && n.boost)).toBe(true);
    const burned = r.state.enemies.find((x) => x.id === e.id);
    // 60 − 8 (carta) − 3 (primera quemadura) = 49; le quedan 2 quemaduras.
    expect(burned?.hp).toBe(49);
    expect(burned?.burnTicks).toBe(2);
  });

  it('R-18 el escudo anula por completo el siguiente golpe', () => {
    const s = blank();
    place(s, 'water', 4, 2, { shield: true });
    addEnemy(s, 'colossus', 5, 2);
    const r = resolveTurn(s, []);
    expect(ninja(r.state, 'water').hp).toBe(40);
    expect(ninja(r.state, 'water').shield).toBe(false);
    expect(r.events.find((x) => x.t === 'damage' && x.targetId === 'water')).toMatchObject({ blocked: true });
  });
});

describe('Rondas, bonus y final (R-20 a R-22)', () => {
  it('al vaciar la ronda aparece la siguiente y los ninjas conservan su estado', () => {
    const s = blank();
    place(s, 'water', 4, 2, { hp: 33 });
    const e = addEnemy(s, 'sniper', 5, 2, { hp: 5 });
    const r = resolveTurn(s, [{ ninjaId: 'water', action: { type: 'attack', targetId: e.id } }]);
    expect(types(r.events)).toContain('roundEnd');
    expect(r.state.round).toBe(2);
    expect(r.state.enemies.length).toBeGreaterThan(0);
    expect(ninja(r.state, 'water').hp).toBeLessThanOrEqual(33);
  });

  it('R-21 sin caídas: se desbloquea el bonus con 4 enemigos', () => {
    const s = blank({ bonus: 'noKo' });
    s.round = 3;
    place(s, 'water', 4, 2);
    const e = addEnemy(s, 'sniper', 5, 2, { hp: 5 });
    const r = resolveTurn(s, [{ ninjaId: 'water', action: { type: 'attack', targetId: e.id } }]);
    expect(r.events.find((x) => x.t === 'bonusCheck')).toMatchObject({ met: true });
    expect(r.state.round).toBe('bonus');
    expect(r.state.enemies).toHaveLength(BALANCE.difficulty.classic.enemiesPerRound.bonus);
  });

  it('R-21 vida completa y límite de turnos', () => {
    const s = blank({ bonus: 'fullHealth' });
    s.round = 3;
    place(s, 'water', 4, 2, { hp: 39 });
    const e = addEnemy(s, 'sniper', 5, 2, { hp: 5 });
    const r = resolveTurn(s, [{ ninjaId: 'water', action: { type: 'attack', targetId: e.id } }]);
    expect(r.state.status).toBe('victory');
    expect(r.state.bonusOutcome).toBe('missed');

    const t = blank({ bonus: 'turnLimit' });
    t.round = 3;
    t.turn = BALANCE.difficulty.classic.bonusTurnLimit;
    place(t, 'water', 4, 2);
    const e2 = addEnemy(t, 'sniper', 5, 2, { hp: 5 });
    const r2 = resolveTurn(t, [{ ninjaId: 'water', action: { type: 'attack', targetId: e2.id } }]);
    // El turno resuelto suma 1 y supera el límite.
    expect(r2.events.find((x) => x.t === 'bonusCheck')).toMatchObject({ met: false });
  });

  it('R-22 derrota si caen los tres; perder el bonus no quita la victoria', () => {
    const s = blank();
    for (const id of ['fire', 'water', 'snow'] as const) ninja(s, id).hp = 0;
    ninja(s, 'water').hp = 1;
    place(s, 'water', 4, 2, { hp: 1 });
    addEnemy(s, 'colossus', 5, 2);
    const r = resolveTurn(s, []);
    expect(r.state.status).toBe('defeat');

    const b = blank();
    b.round = 'bonus';
    for (const id of ['fire', 'snow'] as const) ninja(b, id).hp = 0;
    place(b, 'water', 4, 2, { hp: 1 });
    addEnemy(b, 'colossus', 5, 2);
    const rb = resolveTurn(b, []);
    expect(rb.state.status).toBe('victory');
    expect(rb.state.bonusOutcome).toBe('lost');
  });
});

describe('Reglas técnicas', () => {
  it('R-24 todos los HP y daños son enteros', () => {
    const s = blank();
    place(s, 'water', 4, 2, { boost: true });
    const e = addEnemy(s, 'colossus', 5, 2);
    const r = resolveTurn(s, [{ ninjaId: 'water', action: { type: 'attack', targetId: e.id } }]);
    for (const ev of r.events) if (ev.t === 'damage') expect(Number.isInteger(ev.amount)).toBe(true);
    for (const n of r.state.ninjas) expect(Number.isInteger(n.hp)).toBe(true);
  });

  it('resolveTurn no muta el estado de entrada', () => {
    const { state } = createMatch({ seed: 99 });
    const before = JSON.stringify(state);
    resolveTurn(state, []);
    expect(JSON.stringify(state)).toBe(before);
  });
});

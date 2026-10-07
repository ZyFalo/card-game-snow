import { BALANCE, difficultyConfig, ELEMENTS } from './balance';
import { decideEnemy, enemyAttackArea, sniperDamage, sweepTiles } from './enemyAi';
import { area3x3, eq, key, neighbors8 } from './grid';
import { hashState } from './hash';
import {
  enemyStats,
  getEnemy,
  getNinja,
  livingNinjas,
  moveOptions,
  ninjaAt,
  ninjaStats,
  sanitizePlans,
  unitsInArea,
} from './queries';
import { type Rng, rngFrom } from './rng';
import { spawnRound } from './setup';
import type {
  BonusOutcome,
  DamageCause,
  ElementKind,
  Enemy,
  GameEvent,
  MatchState,
  MatchStatus,
  Ninja,
  Plan,
  TurnResult,
  Vec,
} from './types';

interface Ctx {
  s: MatchState;
  rng: Rng;
  ev: GameEvent[];
  /** Reanimaciones pendientes de este turno (R-09): quién revive a quién. */
  reviving: { sourceId: ElementKind; targetId: ElementKind }[];
}

/**
 * Resuelve un turno completo. Función pura: nunca muta `prev` y, con la misma
 * semilla y los mismos planes, siempre produce el mismo estado (R-23).
 */
export function resolveTurn(prev: MatchState, rawPlans: readonly Plan[]): TurnResult {
  if (prev.status !== 'playing') throw new Error('La partida ya terminó.');
  const s = structuredClone(prev);
  const ctx: Ctx = { s, rng: rngFrom(s.rng), ev: [{ t: 'turnStart', turn: s.turn + 1 }], reviving: [] };
  ninjaPhase(ctx, rawPlans);
  applyEnemyPhase(ctx);
  clearStuns(ctx);
  completeRevives(ctx);
  tickBurns(ctx);

  s.turn += 1;
  s.stats.turns = s.turn;
  checkRoundAndMatch(ctx);

  s.rng = ctx.rng.state();
  return { state: s, events: ctx.ev, hash: hashState(s) };
}

/** Pasos 1 a 3 de R-11, lo que hacen los ninjas: moverse, las acciones básicas y las cartas. */
function ninjaPhase(ctx: Ctx, rawPlans: readonly Plan[]): void {
  const plans = sanitizePlans(ctx.s, rawPlans);
  const planOf = (id: ElementKind): Plan | undefined => plans.find((p) => p.ninjaId === id);
  applyMoves(ctx, plans);
  applyBasicActions(ctx, planOf);
  applyCards(ctx, planOf);
}

/**
 * La vida que los planes le quitarían a cada gólem antes de que actúen los gólems: lo que hacen los
 * ninjas en los pasos 1 a 3 de R-11, con su Potencia y sus combos. Lo que viene después no cuenta: ni la
 * fase enemiga ni las quemaduras. Es una consulta: no cambia el estado ni gasta su azar.
 *
 * La usa la ayuda de ver el daño antes de confirmar (D-78). Corre la misma fase que `resolveTurn`, así
 * que no puede decir otra cosa.
 */
export function plannedDamage(prev: MatchState, rawPlans: readonly Plan[]): Record<string, number> {
  const s = structuredClone(prev);
  const ctx: Ctx = { s, rng: rngFrom(s.rng), ev: [], reviving: [] };
  ninjaPhase(ctx, rawPlans);

  const lost: Record<string, number> = {};
  for (const e of prev.enemies) {
    // Un gólem derrotado ya no está en el estado: perdió toda la vida que le quedaba.
    const hp = getEnemy(s, e.id)?.hp ?? 0;
    if (hp < e.hp) lost[e.id] = e.hp - hp;
  }
  return lost;
}

/* ---------- Paso 1: movimientos simultáneos (R-05) ---------- */

function applyMoves(ctx: Ctx, plans: Plan[]): void {
  const { s, ev } = ctx;
  const moves: { n: Ninja; to: Vec; path: Vec[] }[] = [];
  // Los caminos se calculan sobre el estado inicial: todos se mueven a la vez.
  for (const p of plans) {
    const n = getNinja(s, p.ninjaId);
    if (!n || n.hp <= 0 || !p.moveTo) continue;
    const path = moveOptions(s, n.id, plans).get(key(p.moveTo));
    if (path) moves.push({ n, to: p.moveTo, path });
  }
  for (const m of moves) {
    m.n.pos = { x: m.to.x, y: m.to.y };
    ev.push({ t: 'move', unitId: m.n.id, path: m.path });
  }
  for (const m of moves) chargeMeter(ctx, m.n);
}

/* ---------- Paso 2: acciones básicas en orden Fuego, Agua, Nieve ---------- */

function applyBasicActions(ctx: Ctx, planOf: (id: ElementKind) => Plan | undefined): void {
  const { s, ev } = ctx;
  for (const id of ELEMENTS) {
    const n = getNinja(s, id);
    const a = planOf(id)?.action;
    if (!n || n.hp <= 0 || !a || a.type === 'card') continue;

    if (a.type === 'attack') {
      const target = getEnemy(s, a.targetId);
      if (!target || target.hp <= 0) continue; // R-06: el objetivo ya no es válido
      const boosted = n.boost;
      const dmg = consumeBoost(ctx, n, ninjaStats(n).attack);
      ev.push({ t: 'attack', sourceId: n.id, targetId: target.id, boosted });
      damageEnemy(ctx, target, dmg, 'attack', n.id);
      chargeMeter(ctx, n);
    } else if (a.type === 'heal') {
      const target = getNinja(s, a.targetId);
      if (!target || target.hp <= 0) continue;
      const amount = consumeBoost(ctx, n, ninjaStats(n).heal);
      const hp = Math.min(target.maxHp, target.hp + amount);
      const healed = hp - target.hp;
      target.hp = hp;
      s.stats.basicHeals += 1;
      ev.push({ t: 'heal', sourceId: n.id, targetId: target.id, amount: healed, hp });
      chargeMeter(ctx, n);
    } else if (a.type === 'revive') {
      // R-09 (D-77): revivir no levanta todavía al aliado. La reanimación queda pendiente hasta el
      // paso 6 de R-11, y para entonces quien revive tiene que seguir en pie. Un caído solo tiene un
      // reanimador: sanitizePlans ya dejó al primero en el orden de R-11.
      const target = getNinja(s, a.targetId);
      if (!target || target.hp > 0) continue;
      ctx.reviving.push({ sourceId: n.id, targetId: target.id });
      ev.push({ t: 'reviveStart', sourceId: n.id, targetId: target.id });
      chargeMeter(ctx, n);
    }
  }
}

/** Aplica Potencia (×1,5, redondeo hacia abajo, R-24) y la consume. */
function consumeBoost(ctx: Ctx, n: Ninja, base: number): number {
  if (!n.boost) return base;
  n.boost = false;
  ctx.ev.push({ t: 'status', unitId: n.id, status: 'boost', on: false });
  return Math.floor(base * BALANCE.boostMultiplier);
}

/* ---------- Paso 3: cartas de poder y combos (R-16 a R-18) ---------- */

function applyCards(ctx: Ctx, planOf: (id: ElementKind) => Plan | undefined): void {
  const { s, ev } = ctx;
  const plays: { n: Ninja; cardId: string; at: Vec }[] = [];
  for (const id of ELEMENTS) {
    const n = getNinja(s, id);
    const a = planOf(id)?.action;
    if (!n || n.hp <= 0 || a?.type !== 'card') continue;
    if (!n.hand.some((c) => c.id === a.cardId)) continue;
    plays.push({ n, cardId: a.cardId, at: a.at });
  }
  const combo = plays.length >= 2;
  if (combo) {
    s.stats.combos += 1;
    if (plays.length >= 3) s.stats.tripleCombos += 1;
    ev.push({ t: 'combo', elements: plays.map((p) => p.n.element) });
  }

  for (const play of plays) {
    const { n } = play;
    const idx = n.hand.findIndex((c) => c.id === play.cardId);
    const card = n.hand.splice(idx, 1)[0];
    if (!card) continue;
    const area = area3x3(play.at);
    s.stats.cardsPlayed += 1;
    ev.push({ t: 'card', ninjaId: n.id, card, at: play.at, area, combo });

    const inArea = unitsInArea(s, area);
    const dmg = card.element === 'water' ? card.value * BALANCE.waterCardMultiplier : card.value;
    let hits = 0;
    for (const e of inArea.enemies) {
      hits += 1;
      const alive = damageEnemy(ctx, e, dmg, 'card', n.id);
      if (!alive) continue;
      if (card.element === 'fire' && !e.stunned) {
        e.stunned = true;
        ev.push({ t: 'status', unitId: e.id, status: 'stun', on: true });
      }
      if (combo && card.element === 'fire' && e.burnTicks === 0) {
        e.burnTicks = BALANCE.burn.ticks;
        ev.push({ t: 'status', unitId: e.id, status: 'burn', on: true });
      }
    }
    s.stats.maxEnemiesHitByCard = Math.max(s.stats.maxEnemiesHitByCard, hits);

    if (card.element === 'snow') {
      for (const ally of inArea.ninjas) healOrRevive(ctx, ally, card.value, n.id);
    }
    if (combo && card.element === 'water') {
      for (const ally of livingNinjas(s)) {
        if (ally.boost) continue;
        ally.boost = true;
        ev.push({ t: 'status', unitId: ally.id, status: 'boost', on: true });
      }
    }
    if (combo && card.element === 'snow') {
      for (const ally of livingNinjas(s)) {
        if (ally.shield) continue;
        ally.shield = true;
        ev.push({ t: 'status', unitId: ally.id, status: 'shield', on: true });
      }
    }
    // Al liberar un espacio en la mano, un medidor lleno reparte de inmediato (R-15).
    tryDraw(ctx, n);
  }
}

function healOrRevive(ctx: Ctx, n: Ninja, amount: number, sourceId: ElementKind): void {
  const { s, ev } = ctx;
  if (n.hp <= 0) {
    // La carta de Nieve revive en el acto (R-09). Si alguien lo estaba reviviendo, ya no hace falta.
    n.hp = Math.min(n.maxHp, amount);
    s.stats.revives += 1;
    ctx.reviving = ctx.reviving.filter((p) => p.targetId !== n.id);
    ev.push({ t: 'revive', sourceId, targetId: n.id, hp: n.hp, cause: 'card' });
    return;
  }
  if (n.hp >= n.maxHp) return;
  const hp = Math.min(n.maxHp, n.hp + amount);
  ev.push({ t: 'heal', sourceId, targetId: n.id, amount: hp - n.hp, hp });
  n.hp = hp;
}

/* ---------- Paso 4: fase enemiga (R-12, R-13) ---------- */

function applyEnemyPhase(ctx: Ctx): void {
  const { s, ev } = ctx;
  for (const id of s.enemies.map((e) => e.id)) {
    const e = getEnemy(s, id);
    if (!e || e.hp <= 0) continue;
    if (e.stunned) {
      ev.push({ t: 'enemySkip', unitId: e.id });
      continue;
    }
    const decision = decideEnemy(s, e, ctx.rng);
    const last = decision.path[decision.path.length - 1];
    if (last && !eq(last, e.pos)) {
      e.pos = { x: last.x, y: last.y };
      ev.push({ t: 'move', unitId: e.id, path: decision.path });
    }
    if (!decision.targetId) continue;
    const target = getNinja(s, decision.targetId);
    if (target && target.hp > 0) enemyAttack(ctx, e, target);
  }
}

function enemyAttack(ctx: Ctx, e: Enemy, target: Ninja): void {
  const { s, ev } = ctx;
  const st = enemyStats(e);
  ev.push({
    t: 'enemyAttack',
    sourceId: e.id,
    kind: e.kind,
    targetId: target.id,
    area: enemyAttackArea(e, e.pos, target.pos),
  });
  switch (e.kind) {
    case 'sniper':
      damageNinja(ctx, target, sniperDamage(e, e.pos, target.pos), 'enemy', e.id);
      break;
    case 'artillery': {
      const splashed = neighbors8(target.pos)
        .map((v) => ninjaAt(s, v))
        .filter((n): n is Ninja => !!n && n.hp > 0);
      damageNinja(ctx, target, st.attack, 'enemy', e.id);
      for (const n of splashed) damageNinja(ctx, n, st.splash ?? 0, 'splash', e.id);
      break;
    }
    case 'colossus': {
      const swept = sweepTiles(e.pos, target.pos)
        .map((v) => ninjaAt(s, v))
        .filter((n): n is Ninja => !!n && n.hp > 0);
      damageNinja(ctx, target, st.attack, 'enemy', e.id);
      for (const n of swept) damageNinja(ctx, n, st.sweep ?? 0, 'sweep', e.id);
      break;
    }
  }
}

/* ---------- Pasos 5 a 7 ---------- */

function clearStuns(ctx: Ctx): void {
  for (const e of ctx.s.enemies) {
    if (!e.stunned) continue;
    e.stunned = false;
    ctx.ev.push({ t: 'status', unitId: e.id, status: 'stun', on: false });
  }
}

/** Paso 6 (R-09, D-77): se levantan con 1 HP los caídos cuyo reanimador sigue en pie. */
function completeRevives(ctx: Ctx): void {
  const { s, ev } = ctx;
  // Quien cayó mientras revivía ya no está en la lista, y a quien levantó una carta tampoco lo espera nadie.
  for (const p of ctx.reviving) {
    const target = getNinja(s, p.targetId);
    if (!target) continue;
    target.hp = Math.min(target.maxHp, BALANCE.reviveHp);
    s.stats.revives += 1;
    ev.push({ t: 'revive', sourceId: p.sourceId, targetId: target.id, hp: target.hp, cause: 'basic' });
  }
  ctx.reviving = [];
}

function tickBurns(ctx: Ctx): void {
  const { s, ev } = ctx;
  for (const id of s.enemies.map((e) => e.id)) {
    const e = getEnemy(s, id);
    if (!e || e.hp <= 0 || e.burnTicks <= 0) continue;
    e.burnTicks -= 1;
    const alive = damageEnemy(ctx, e, BALANCE.burn.damage, 'burn', null);
    if (alive && e.burnTicks === 0) ev.push({ t: 'status', unitId: e.id, status: 'burn', on: false });
  }
}

/* ---------- Paso 8: rondas, bonus y final (R-20 a R-22) ---------- */

function checkRoundAndMatch(ctx: Ctx): void {
  const { s, ev, rng } = ctx;
  if (s.enemies.length === 0) {
    const round = s.round;
    ev.push({ t: 'roundEnd', round });
    if (round === 1 || round === 2) {
      spawnRound(s, rng, (round + 1) as 2 | 3, ev);
    } else if (round === 3) {
      s.stats.turnsToClearMain = s.turn;
      const met = bonusConditionMet(s);
      ev.push({ t: 'bonusCheck', condition: s.bonusCondition, met });
      if (met && livingNinjas(s).length > 0) {
        s.stats.bonusEntered = true;
        spawnRound(s, rng, 'bonus', ev);
      } else {
        endMatch(ctx, 'victory', 'missed');
        return;
      }
    } else {
      endMatch(ctx, 'victory', 'won');
      return;
    }
  }
  if (livingNinjas(s).length === 0) {
    if (s.round === 'bonus') endMatch(ctx, 'victory', 'lost');
    else endMatch(ctx, 'defeat', 'missed');
  }
}

/** R-21. Evalúa la condición sorteada al terminar la ronda 3. */
export function bonusConditionMet(s: MatchState): boolean {
  switch (s.bonusCondition) {
    case 'noKo':
      return s.ninjas.every((n) => !n.everKo);
    case 'fullHealth':
      return s.ninjas.every((n) => n.hp === n.maxHp);
    case 'turnLimit':
      return s.turn <= difficultyConfig(s.difficulty).bonusTurnLimit;
  }
}

function endMatch(ctx: Ctx, status: Exclude<MatchStatus, 'playing'>, bonusOutcome: BonusOutcome): void {
  ctx.s.status = status;
  ctx.s.bonusOutcome = bonusOutcome;
  ctx.ev.push({ t: 'matchEnd', status, bonusOutcome });
}

/* ---------- Daño, medidor y robo de cartas ---------- */

/** Devuelve true si el enemigo sigue en pie. */
function damageEnemy(ctx: Ctx, e: Enemy, amount: number, cause: DamageCause, sourceId: string | null): boolean {
  const { s, ev } = ctx;
  const before = e.hp;
  e.hp = Math.max(0, e.hp - amount);
  s.stats.damageDealt += before - e.hp;
  ev.push({ t: 'damage', targetId: e.id, amount, hp: e.hp, cause, sourceId, blocked: false });
  if (e.hp > 0) return true;
  ev.push({ t: 'ko', unitId: e.id });
  s.enemies = s.enemies.filter((x) => x.id !== e.id);
  s.stats.enemiesDefeated += 1;
  return false;
}

function damageNinja(ctx: Ctx, n: Ninja, amount: number, cause: DamageCause, sourceId: string): void {
  const { s, ev } = ctx;
  if (n.hp <= 0) return;
  if (n.shield) {
    n.shield = false;
    ev.push({ t: 'damage', targetId: n.id, amount: 0, hp: n.hp, cause, sourceId, blocked: true });
    ev.push({ t: 'status', unitId: n.id, status: 'shield', on: false });
    return;
  }
  n.hp = Math.max(0, n.hp - amount);
  ev.push({ t: 'damage', targetId: n.id, amount, hp: n.hp, cause, sourceId, blocked: false });
  if (n.hp > 0) {
    chargeMeter(ctx, n);
    return;
  }
  // Caída (R-10).
  ev.push({ t: 'ko', unitId: n.id });
  n.everKo = true;
  s.stats.ninjaKos += 1;
  if (!s.stats.fallenNinjas.includes(n.id)) s.stats.fallenNinjas.push(n.id);
  // R-09: si estaba reviviendo a un aliado, la reanimación se interrumpe y ese aliado no se levanta.
  for (const p of ctx.reviving) {
    if (p.sourceId === n.id) ev.push({ t: 'reviveInterrupted', sourceId: p.sourceId, targetId: p.targetId });
  }
  ctx.reviving = ctx.reviving.filter((p) => p.sourceId !== n.id);
}

/** R-15. +2 por evento; al llegar al máximo reparte una carta si hay espacio. */
function chargeMeter(ctx: Ctx, n: Ninja): void {
  if (n.hp <= 0) return;
  const max = BALANCE.meter.max;
  if (n.meter < max) {
    n.meter = Math.min(max, n.meter + BALANCE.meter.perEvent);
    ctx.ev.push({ t: 'meter', ninjaId: n.id, value: n.meter });
  }
  tryDraw(ctx, n);
}

function tryDraw(ctx: Ctx, n: Ninja): void {
  if (n.hp <= 0 || n.meter < BALANCE.meter.max) return;
  if (n.hand.length >= BALANCE.handMax || n.deck.length === 0) return;
  const idx = ctx.rng.int(0, n.deck.length - 1);
  const card = n.deck.splice(idx, 1)[0];
  if (!card) return;
  n.hand.push(card);
  n.meter = 0;
  ctx.ev.push({ t: 'draw', ninjaId: n.id, card });
  ctx.ev.push({ t: 'meter', ninjaId: n.id, value: 0 });
}

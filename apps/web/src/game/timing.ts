import { ELEMENTS, type ElementKind, type GameEvent } from '@ventisca/core';
import { GOLEM_CLIPS, NINJA_CLIPS } from './rig/clips';
import type { Clip } from './rig/Rig';

/*
 * Coreografía del turno (fase 3 de animación). Todos los tiempos del animador
 * viven aquí, en milisegundos a velocidad normal. Los tiempos de los gestos de
 * cada personaje salen de sus clips. El estimador recorre los eventos igual que
 * la escena para medir cuánto dura un turno sin necesidad de renderizarlo.
 */

export interface Timing {
  ninjaStep: number;
  enemyStep: number;
  projectile: { fire: number; snow: number; card: number; sniper: number; artillery: number };
  waterLunge: number;
  damageHold: number;
  areaHold: number;
  /** Golpes de carta: la cinemática ya mostró el impacto. */
  cardHitHold: number;
  blockedHold: number;
  statusHold: number;
  heal: { cranes: number; stagger: number; hold: number };
  reviveStart: number;
  reviveMax: number;
  card: {
    fire: { start: number; stagger: number; fall: number };
    water: { wave: number; stagger: number };
    snow: { flake: number; stagger: number };
    tail: number;
  };
  comboOverlay: number;
  roundBanner: number;
  bonusBanner: number;
  roundEnd: number;
  colossusTail: number;
  spawn: { stagger: number; tail: number };
  matchEnd: number;
  enemyKo: number;
  koCrossfade: number;
}

/** Valores de la fase 2, antes del pase de coreografía (se conservan para comparar). */
export const TIMING_V07: Timing = {
  ninjaStep: 170,
  enemyStep: 230,
  projectile: { fire: 300, snow: 260, card: 300, sniper: 240, artillery: 440 },
  waterLunge: 150,
  damageHold: 250,
  areaHold: 130,
  cardHitHold: 250,
  blockedHold: 240,
  statusHold: 110,
  heal: { cranes: 420, stagger: 70, hold: 200 },
  reviveStart: 320,
  reviveMax: 760,
  card: {
    fire: { start: 120, stagger: 45, fall: 230 },
    water: { wave: 620, stagger: 35 },
    snow: { flake: 540, stagger: 40 },
    tail: 140,
  },
  comboOverlay: 2100,
  roundBanner: 1650,
  bonusBanner: 1500,
  roundEnd: 380,
  colossusTail: 120,
  spawn: { stagger: 130, tail: 440 },
  matchEnd: 1400,
  enemyKo: 420,
  koCrossfade: 160,
};

/**
 * Pase de coreografía (v0.8): más ágil sin perder lectura. Metas vigiladas por
 * una prueba, a velocidad normal: turno sin combo con mediana de hasta 3,2 s en
 * Clásica y 3,8 s en Tormenta, y turno con combo de hasta 7 s. En un combo los
 * ninjas alzan sus cartas a la vez durante el cartel, y las cinemáticas se
 * encadenan sin repetir el gesto ni el vuelo de cada carta.
 * "Animaciones rápidas" multiplica todo por FAST_FACTOR.
 */
export const TIMING: Timing = {
  ninjaStep: 150,
  enemyStep: 170,
  projectile: { fire: 250, snow: 220, card: 240, sniper: 200, artillery: 360 },
  waterLunge: 130,
  damageHold: 180,
  areaHold: 90,
  cardHitHold: 80,
  blockedHold: 200,
  statusHold: 60,
  heal: { cranes: 360, stagger: 50, hold: 150 },
  reviveStart: 260,
  reviveMax: 650,
  card: {
    fire: { start: 80, stagger: 30, fall: 200 },
    water: { wave: 480, stagger: 22 },
    snow: { flake: 420, stagger: 25 },
    tail: 100,
  },
  comboOverlay: 1500,
  roundBanner: 1400,
  bonusBanner: 1300,
  roundEnd: 300,
  colossusTail: 80,
  spawn: { stagger: 110, tail: 380 },
  matchEnd: 1300,
  /** Parte bloqueante de la explosión de un gólem; el resto ocurre mientras sigue el turno. */
  enemyKo: 160,
  koCrossfade: 140,
};

/** Multiplicador de "Animaciones rápidas". */
export const FAST_FACTOR = 0.6;

export const clipMs = (clip: Clip): number => clip.frames.reduce((s, f) => s + f.ms, 0);

/** Momento del marcador dentro de un clip (fin del fotograma que lo lleva). */
export function markerMs(clip: Clip, marker = 'release'): number {
  let t = 0;
  for (const f of clip.frames) {
    t += f.ms;
    if (f.marker === marker) return t;
  }
  return t;
}

const isNinja = (id: string): id is ElementKind => (ELEMENTS as readonly string[]).includes(id);

export function cardCinematicMs(t: Timing, el: ElementKind, tiles: number): number {
  if (el === 'fire') return t.card.fire.start + (tiles - 1) * t.card.fire.stagger + t.card.fire.fall + t.card.tail;
  if (el === 'water') return t.card.water.wave + tiles * t.card.water.stagger + t.card.tail;
  return t.card.snow.flake + tiles * t.card.snow.stagger + t.card.tail;
}

/** Duración estimada de la animación de una lista de eventos, a velocidad normal. */
export function estimateEventsMs(events: readonly GameEvent[], t: Timing = TIMING, groupBurns = false): number {
  let total = 0;
  let i = 0;
  // Cartas cuyo gesto y vuelo ya ocurrieron durante el cartel del combo.
  let primed = 0;
  while (i < events.length) {
    const e = events[i] as GameEvent;
    if (e.t === 'move' && isNinja(e.unitId)) {
      let steps = 0;
      while (i < events.length) {
        const x = events[i] as GameEvent;
        if (x.t !== 'move' || !isNinja(x.unitId)) break;
        steps = Math.max(steps, x.path.length - 1);
        i += 1;
      }
      total += steps * t.ninjaStep;
      continue;
    }
    if (groupBurns && e.t === 'damage' && e.cause === 'burn') {
      let kills = 0;
      while (i < events.length) {
        const x = events[i] as GameEvent;
        const burnRelated =
          (x.t === 'damage' && x.cause === 'burn') || x.t === 'ko' || (x.t === 'status' && x.status === 'burn');
        if (!burnRelated) break;
        if (x.t === 'ko') kills += 1;
        i += 1;
      }
      total += t.damageHold + (kills > 0 ? t.enemyKo : 0);
      continue;
    }
    i += 1;
    switch (e.t) {
      case 'move':
        total += (e.path.length - 1) * t.enemyStep;
        break;
      case 'attack': {
        const rel = markerMs(NINJA_CLIPS[e.sourceId].attack);
        total += rel + (e.sourceId === 'fire' ? t.projectile.fire : e.sourceId === 'snow' ? t.projectile.snow : 0);
        break;
      }
      case 'damage':
        total += e.blocked
          ? t.blockedHold
          : e.cause === 'card'
            ? t.cardHitHold
            : e.cause === 'splash' || e.cause === 'sweep'
              ? t.areaHold
              : t.damageHold;
        break;
      case 'ko':
        total += isNinja(e.unitId) ? clipMs(NINJA_CLIPS.fire.koStart) + t.koCrossfade : t.enemyKo;
        break;
      case 'heal':
        total += e.sourceId
          ? markerMs(NINJA_CLIPS.snow.heal) + t.heal.cranes + 2 * t.heal.stagger + t.heal.hold
          : t.heal.hold;
        break;
      case 'reviveStart':
        total += t.reviveStart;
        break;
      case 'revive':
        total += Math.min(t.reviveMax, clipMs(NINJA_CLIPS.fire.revived));
        break;
      case 'combo':
        total += t.comboOverlay;
        primed = e.elements.length;
        break;
      case 'card':
        if (primed > 0) primed -= 1;
        else total += markerMs(NINJA_CLIPS[e.ninjaId].power) + t.projectile.card;
        total += cardCinematicMs(t, e.card.element, e.area.length);
        break;
      case 'status':
        // Varios estados seguidos comparten una sola pausa.
        if (e.on && (events[i] as GameEvent | undefined)?.t !== 'status') total += t.statusHold;
        break;
      case 'enemyAttack':
        total += markerMs(GOLEM_CLIPS[e.kind].attack) + (e.kind === 'colossus' ? t.colossusTail : t.projectile[e.kind]);
        break;
      case 'enemySkip':
        total += clipMs(GOLEM_CLIPS.sniper.dazedTurn);
        break;
      case 'roundEnd':
        total += t.roundEnd;
        break;
      case 'roundStart':
        total += t.roundBanner + e.enemies.length * t.spawn.stagger + t.spawn.tail;
        break;
      case 'bonusCheck':
        total += t.bonusBanner;
        break;
      case 'matchEnd':
        total += t.matchEnd;
        break;
      default:
        break;
    }
  }
  return total;
}

/** ¿Es un turno de combate puro (sin carteles de ronda, bonus ni final)? */
export const isCombatTurn = (events: readonly GameEvent[]): boolean =>
  !events.some((e) => e.t === 'roundStart' || e.t === 'bonusCheck' || e.t === 'matchEnd');

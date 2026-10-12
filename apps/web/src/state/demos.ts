import {
  BALANCE,
  type Card,
  createMatch,
  ELEMENTS,
  type ElementKind,
  type Enemy,
  type EnemyKind,
  type GameEvent,
  type MatchState,
  type Plan,
  resolveTurn,
  type StatusKind,
  type Vec,
} from '@ventisca/core';
import { DEMO_TEXT } from '../i18n/es';
import { applyEvent } from './present';

/*
 * Demostraciones (D-81): qué hace una carta, enseñado en un tablero en miniatura. Cada una la juega el
 * propio motor sobre un tablero preparado: aquí se arma ese tablero, se le pide al motor que resuelva el
 * turno y se guarda lo que la demostración enseña. La escena lo anima con el arte y las animaciones del
 * juego; nada de esto mira la partida en curso.
 */

/** Lo que se lee sobre una unidad cuando la demostración termina: "−9 · aturdido". */
export interface DemoLabel {
  at: Vec;
  text: string;
}

export interface Demo {
  /** La parte del tablero que se ve, en casillas. */
  view: { x: number; y: number; w: number; h: number };
  before: MatchState;
  /** Lo que juega cada ninja en el turno de la demostración. */
  plans: Plan[];
  /** Lo que resolvió el motor, hasta donde llega lo que se enseña. */
  events: GameEvent[];
  after: MatchState;
  labels: DemoLabel[];
  /** `false` con la mano vacía: el efecto se enseña sin números. */
  numbers: boolean;
}

/*
 * El tablero en miniatura de las cartas: a la izquierda, quien juega; a la derecha, el área de 3×3 de su
 * carta, con dos gólems. Lo que se lee sobre cada unidad al terminar va encima de su casilla, así que
 * nadie está justo debajo de otro: una prueba lo mide.
 */
const CARD_VIEW = { x: 2, y: 1, w: 4, h: 3 } as const;
/** Quien juega la carta, a su alcance, y dónde la coloca: en el centro del área. */
const CASTER: Vec = { x: 2, y: 2 };
const CARD_AT: Vec = { x: 4, y: 2 };
/** Quien juega la otra carta del combo, y dónde: en una esquina del área, sin alcanzar a ningún gólem. */
const PARTNER: Vec = { x: 4, y: 3 };
const PARTNER_CARD_AT: Vec = { x: 3, y: 3 };
/** Los dos gólems del área: arriba y abajo, a la derecha. */
const GOLEMS: readonly { kind: EnemyKind; at: Vec }[] = [
  { kind: 'sniper', at: { x: 5, y: 1 } },
  { kind: 'colossus', at: { x: 5, y: 3 } },
];
/** Fuera del tablero en miniatura: el ninja que no participa. */
const AWAY: Vec = { x: 0, y: 0 };

/** Dónde está cada ninja, con qué vida, y quién juega la otra carta del combo. */
const CARD_CAST: Record<
  ElementKind,
  { partner: ElementKind; at: Partial<Record<ElementKind, Vec>>; hp?: Partial<Record<ElementKind, number>> }
> = {
  fire: { partner: 'water', at: { fire: CASTER, water: PARTNER } },
  water: { partner: 'fire', at: { water: CASTER, fire: PARTNER } },
  // La carta de Nieve también cura y revive: Brasa está herido y Marea, caída, los dos dentro del área.
  // Escarcha la coloca desde más lejos, que su paso es 3.
  snow: {
    partner: 'fire',
    at: { snow: { x: 2, y: 3 }, fire: PARTNER, water: { x: 3, y: 1 } },
    hp: { fire: BALANCE.ninjas.fire.hp - 15, water: 0 },
  },
};

const enemy = (id: string, kind: EnemyKind, at: Vec): Enemy => {
  const hp = BALANCE.enemies[kind].hp;
  return { id, kind, pos: { x: at.x, y: at.y }, hp, maxHp: hp, stunned: false, burnTicks: 0 };
};

const demoCard = (element: ElementKind, value: number): Card => ({ id: `${element}-demo`, element, value });
const play = (ninjaId: ElementKind, at: Vec): Plan => ({
  ninjaId,
  action: { type: 'card', cardId: `${ninjaId}-demo`, at: { x: at.x, y: at.y } },
});

/** ¿Empieza con ese evento la respuesta de los gólems? Ahí termina lo que enseña una carta. */
const isEnemyPhase = (e: GameEvent): boolean =>
  e.t === 'enemyAttack' ||
  e.t === 'enemySkip' ||
  (e.t === 'move' && !(ELEMENTS as readonly string[]).includes(e.unitId));

const STATUS_WORD: Record<StatusKind, string> = {
  stun: DEMO_TEXT.stunned,
  burn: DEMO_TEXT.burning,
  boost: DEMO_TEXT.boost,
  shield: DEMO_TEXT.shield,
};

/**
 * Lo que la carta de ese ninja le hizo a cada unidad que se ve, en el orden en que pasó: el daño o la
 * cura, y los estados que deja. Solo cuenta lo de su carta: en un combo, lo de la otra carta no es suyo.
 */
function cardLabels(demo: Omit<Demo, 'labels'>, caster: ElementKind): DemoLabel[] {
  const parts = new Map<string, string[]>();
  const add = (unitId: string, text: string | null) => {
    if (text) parts.set(unitId, [...(parts.get(unitId) ?? []), text]);
  };
  const amount = (sign: string, n: number) => (demo.numbers ? `${sign}${n}` : null);
  let mine = false;
  for (const e of demo.events) {
    if (e.t === 'card') mine = e.ninjaId === caster;
    if (!mine) continue;
    if (e.t === 'damage' && !e.blocked) add(e.targetId, amount('−', e.amount));
    if (e.t === 'heal') add(e.targetId, amount('+', e.amount));
    if (e.t === 'revive') {
      add(e.targetId, DEMO_TEXT.revived);
      add(e.targetId, amount('+', e.hp));
    }
    // En una demostración los estados solo se encienden: una prueba lo mide.
    if (e.t === 'status') add(e.unitId, STATUS_WORD[e.status]);
  }
  const { view, after } = demo;
  const seen = (at: Vec) => at.x >= view.x && at.x < view.x + view.w && at.y >= view.y && at.y < view.y + view.h;
  return [...after.enemies, ...after.ninjas]
    .filter((u) => parts.has(u.id) && seen(u.pos))
    .map((u) => ({ at: { x: u.pos.x, y: u.pos.y }, text: (parts.get(u.id) ?? []).join(' · ') }));
}

/**
 * La demostración de la carta de un elemento. `value` es el valor de la carta que se enseña, o `null` con
 * la mano vacía: entonces el efecto se ve sin números. Con `combo`, otro ninja juega su carta en el mismo
 * turno, en otra casilla: el combo necesita dos o más cartas a la vez (R-18).
 */
export function cardDemo(element: ElementKind, value: number | null, combo: boolean): Demo {
  const cast = CARD_CAST[element];
  const before = createMatch({ seed: 1, mapId: 'cumbre', bonusCondition: 'noKo' }).state;
  for (const n of before.ninjas) {
    const at = cast.at[n.id] ?? AWAY;
    n.pos = { x: at.x, y: at.y };
    n.hp = cast.hp?.[n.id] ?? n.maxHp;
    n.everKo = n.hp <= 0;
    n.hand = [];
    if (n.id === element) n.hand = [demoCard(element, value ?? BALANCE.starter.value)];
    else if (combo && n.id === cast.partner) n.hand = [demoCard(n.id, BALANCE.starter.value)];
  }
  before.enemies = GOLEMS.map((g, i) => enemy(`e${i + 1}`, g.kind, g.at));
  before.nextEnemySeq = before.enemies.length + 1;

  const plans = ELEMENTS.flatMap((id): Plan[] => {
    if (id === element) return [play(id, CARD_AT)];
    return combo && id === cast.partner ? [play(id, PARTNER_CARD_AT)] : [];
  });
  const resolved = resolveTurn(before, plans).events;
  const end = resolved.findIndex(isEnemyPhase);
  // El turno ya lo abre la demostración, y los medidores no se ven: quedan fuera.
  const events = (end < 0 ? resolved : resolved.slice(0, end)).filter((e) => e.t !== 'turnStart' && e.t !== 'meter');
  const after = events.reduce(applyEvent, before);
  const demo = { view: { ...CARD_VIEW }, before, plans, events, after, numbers: value !== null };
  // Las etiquetas van en el orden del tablero, por si se leen de corrido: de arriba abajo.
  const labels = cardLabels(demo, element).sort((a, b) => a.at.y - b.at.y || a.at.x - b.at.x);
  return { ...demo, labels };
}

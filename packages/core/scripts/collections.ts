import {
  addToCollection,
  bankFor,
  type Collection,
  type DeckCard,
  ELEMENTS,
  type ElementKind,
  openBox,
  reserveFor,
  reservesFor,
  rngFrom,
  STARTER_CARDS,
  starterCollection,
} from '../src';

/*
 * Colecciones de ejemplo para simular la progresión (§18.3 del PRD). En el juego,
 * la reserva de cada ninja es la colección del jugador (R-26), así que el balance
 * se mide por etapas: jugador nuevo, tras sus primeras cajas y colección completa.
 */

export const COLLECTION_PRESETS = [
  'fixed',
  'empty',
  'starter-no-path',
  'starter',
  'box',
  'random8',
  'full',
  'top7',
] as const;

export type CollectionPreset = (typeof COLLECTION_PRESETS)[number];

/** Descripción de cada colección, con el nombre de su fila en la tabla del §18.3. */
export const PRESET_LABELS: Record<CollectionPreset, string> = {
  fixed: 'Mazo fijo de v1 (6 cartas de 8 a 12; no es la reserva del juego)',
  empty: '0 cartas',
  'starter-no-path': '1 carta de 9 (inicio de R-30, sin camino)',
  starter: '1 carta de 9 + carta de camino (un 12)',
  box: 'Tras una caja de 3 por elemento',
  random8: '8 cartas al azar del banco',
  full: 'Las 20 (colección completa)',
  top7: 'Solo las 7 más altas (11 y 12)',
};

export const isCollectionPreset = (s: string): s is CollectionPreset =>
  (COLLECTION_PRESETS as readonly string[]).includes(s);

/**
 * Colección de un jugador de ejemplo. Las que tienen azar (`box` y `random8`) usan un
 * RNG propio sembrado con la semilla de la partida, así la simulación es reproducible.
 * Con `fixed` no hay colección: la partida usa el mazo fijo de v1.
 */
export function presetCollection(preset: CollectionPreset, seed: number, path: ElementKind): Collection | null {
  const rng = rngFrom((seed ^ 0x51a7c0de) >>> 0);
  switch (preset) {
    case 'fixed':
      return null;
    case 'empty':
      return {};
    case 'starter-no-path':
      return addToCollection(
        {},
        ELEMENTS.map((el) => ({ id: STARTER_CARDS[el] })),
      );
    case 'starter':
      return starterCollection(path);
    case 'box':
      return ELEMENTS.reduce((c, el) => addToCollection(c, openBox(el, 3, rng)), starterCollection(path));
    case 'random8':
      return addToCollection(
        {},
        ELEMENTS.flatMap((el) => rng.shuffle(bankFor(el)).slice(0, 8)),
      );
    case 'full':
      return addToCollection(
        {},
        ELEMENTS.flatMap((el) => bankFor(el)),
      );
    case 'top7':
      return addToCollection(
        {},
        ELEMENTS.flatMap((el) => bankFor(el).filter((c) => c.value >= 11)),
      );
  }
}

/** Reserva de cada ninja para `createMatch` (R-26), o `undefined` con el mazo fijo. */
export function presetDecks(
  preset: CollectionPreset,
  seed: number,
  path: ElementKind,
): Record<ElementKind, DeckCard[]> | undefined {
  const c = presetCollection(preset, seed, path);
  return c ? reservesFor(c) : undefined;
}

/*
 * Asientos del modo en línea (PRD de v2, R-33 y R-34). Cada ninja lo lleva una persona, que juega
 * con su propia colección de ese elemento, o el bot, con el mazo de referencia (D-47). Un mismo
 * equipo puede juntar una colección nueva con una completa: con estos asientos se mide (P-20).
 */

export const SEAT_PRESETS = ['bot', 'new-off', 'new', 'box', 'box3', 'full'] as const;

export type SeatPreset = (typeof SEAT_PRESETS)[number];

/** Quién lleva cada ninja. */
export type Team = Record<ElementKind, SeatPreset>;

export const SEAT_LABELS: Record<SeatPreset, string> = {
  bot: 'Bot (mazo de referencia: 8, 9, 10, 10, 11 y 12)',
  'new-off': 'Nueva, con un ninja que no es el de su camino (solo su 9)',
  new: 'Nueva, con el ninja de su camino (su 9 y su 12)',
  box: 'Tras una caja de 3 de su elemento (5 cartas)',
  box3: 'Tras tres cajas de 3 de su elemento (11 cartas)',
  full: 'Completa (las 20 de su elemento)',
};

/** Nombre corto de cada asiento, para las tablas. */
export const SEAT_SHORT: Record<SeatPreset, string> = {
  bot: 'Bot',
  'new-off': 'Nueva fuera de su camino',
  new: 'Nueva',
  box: 'Una caja',
  box3: 'Tres cajas',
  full: 'Completa',
};

export const isSeatPreset = (s: string): s is SeatPreset => (SEAT_PRESETS as readonly string[]).includes(s);

/** Cajas de 3 cartas que abrió la persona de cada asiento, todas de su elemento (R-28). */
const SEAT_BOXES: Partial<Record<SeatPreset, number>> = { box: 1, box3: 3 };

/**
 * Reserva del ninja de `element` según quién lo lleva (R-34), o `undefined` para el bot: sin reserva
 * propia, `createMatch` le da el mazo de referencia. Las cajas se sortean con un RNG propio de cada
 * asiento, sembrado con la semilla de la partida.
 */
export function seatDeck(preset: SeatPreset, element: ElementKind, seed: number): DeckCard[] | undefined {
  if (preset === 'bot') return undefined;
  if (preset === 'full') return reserveFor(addToCollection({}, bankFor(element)), element);
  // Fuera de su camino, la carta de camino de la persona es de otro elemento y no entra a esta reserva.
  const camino = preset === 'new-off' ? (ELEMENTS.find((el) => el !== element) as ElementKind) : element;
  const index = ELEMENTS.indexOf(element);
  const rng = rngFrom((seed ^ 0x51a7c0de ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0);
  let collection = starterCollection(camino);
  for (let i = 0; i < (SEAT_BOXES[preset] ?? 0); i++)
    collection = addToCollection(collection, openBox(element, 3, rng));
  return reserveFor(collection, element);
}

/** Reservas de un equipo para `createMatch`. Los asientos del bot no aparecen. */
export function teamDecks(team: Team, seed: number): Partial<Record<ElementKind, DeckCard[]>> {
  const decks: Partial<Record<ElementKind, DeckCard[]>> = {};
  for (const el of ELEMENTS) {
    const deck = seatDeck(team[el], el, seed);
    if (deck) decks[el] = deck;
  }
  return decks;
}

/** Lee un equipo escrito como `fire=new,water=full,snow=bot`. Lanza un error que dice qué no entendió. */
export function parseTeam(text: string): Team {
  const team: Partial<Team> = {};
  for (const part of text.split(',')) {
    const [ninja = '', seat = ''] = part.split('=').map((x) => x.trim());
    if (!(ELEMENTS as readonly string[]).includes(ninja)) {
      throw new Error(`Ninja desconocido: ${ninja}. Opciones: ${ELEMENTS.join(', ')}.`);
    }
    if (!isSeatPreset(seat)) throw new Error(`Asiento desconocido: ${seat}. Opciones: ${SEAT_PRESETS.join(', ')}.`);
    if (team[ninja as ElementKind]) throw new Error(`El ninja ${ninja} aparece dos veces.`);
    team[ninja as ElementKind] = seat;
  }
  for (const el of ELEMENTS) if (!team[el]) throw new Error(`Falta el asiento de ${el}.`);
  return team as Team;
}

/** Las formas distintas de repartir tres asientos entre Fuego, Agua y Nieve. */
export function arrangements(seats: readonly [SeatPreset, SeatPreset, SeatPreset]): Team[] {
  const [a, b, c] = seats;
  const orders = [
    [a, b, c],
    [a, c, b],
    [b, a, c],
    [b, c, a],
    [c, a, b],
    [c, b, a],
  ] as const;
  const seen = new Set<string>();
  const out: Team[] = [];
  for (const [fire, water, snow] of orders) {
    const key = `${fire}|${water}|${snow}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ fire, water, snow });
  }
  return out;
}

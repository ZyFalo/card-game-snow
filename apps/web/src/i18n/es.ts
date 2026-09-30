import type { AchievementId, BonusCondition, Difficulty, ElementKind, EnemyKind } from '@ventisca/core';

/* Todos los textos de la interfaz viven aquí (P-11: listos para traducir). */

export type Pace = 'relaxed' | 'normal' | 'expert';

export const ES = {
  title: 'Ventisca',
  tagline: 'Tres aprendices de papel contra la tormenta',
  play: 'Jugar',
  howToPlay: 'Cómo jugar',
  back: 'Volver',
  close: 'Cerrar',
  startMatch: 'Comenzar partida',
  confirmTurn: 'Confirmar turno',
  resolving: 'Resolviendo…',
  preparing: 'Preparando…',
  suggest: 'Sugerir jugada',
  pause: 'Pausa',
  resume: 'Continuar',
  restart: 'Reiniciar partida',
  quit: 'Salir al menú',
  playAgain: 'Jugar otra vez',
  menu: 'Menú principal',
  team: 'Tu equipo',
  teamIntro:
    'Controlas a los tres. Cada turno planeas un movimiento y una acción por ninja; después responden los gólems.',
  pace: 'Ritmo del reloj',
  difficulty: 'Dificultad',
  tipsMode: 'Consejos en pantalla',
  autoAdvance: 'Pasar al siguiente ninja',
  sound: 'Efectos de sonido',
  music: 'Música',
  reducedMotion: 'Animaciones reducidas',
  fastAnimations: 'Animaciones rápidas',
  accelerate: 'Mantén para acelerar',
  accelerating: 'Acelerando…',
  settings: 'Ajustes',
  seed: 'Semilla',
  copyReplay: 'Copiar repetición',
  copied: 'Repetición copiada',
  copyFailed: 'Selecciona el texto y cópialo',
  noTimer: 'Sin reloj',
  seconds: 's',
  hand: (name: string) => `Cartas de ${name}`,
  deck: (n: number) => `Mazo ${n}`,
  emptySlot: 'Vacío',
  round: (r: number | 'bonus') => (r === 'bonus' ? 'Ronda bonus' : `Ronda ${r} de 3`),
  roundBanner: (r: number | 'bonus') => (r === 'bonus' ? 'Ronda bonus' : `Ronda ${r}`),
  bonusLocked: 'Bonus',
  /** Bonus contra el reloj (R-21): el turno t de un límite de n y los que quedan contando ese. */
  turnLimitProgress: (t: number, n: number) =>
    t <= n ? `Turno ${t} de ${n} · quedan ${n - t + 1}` : `Turno ${t} de ${n} · límite superado`,
  combo: '¡Combo!',
  victory: 'Victoria',
  defeat: 'Derrota',
  newAchievement: 'Nuevo',
  achievements: 'Logros',
  achievementsProgress: (n: number, total: number) => `Logros · ${n} de ${total}`,
  blocked: 'Bloqueado',
  statsTitle: 'Resumen de la partida',
  loading: 'Doblando a los aprendices…',
  noWebglTitle: 'Este navegador no puede mostrar el tablero',
  noWebglBody:
    'Ventisca dibuja el tablero con WebGL y aquí no está disponible. Activa la aceleración por hardware en la configuración del navegador, o prueba con una versión reciente de Chrome, Edge, Firefox o Safari, y vuelve a abrir la página.',
} as const;

export const PACES: Record<Pace, { label: string; detail: string }> = {
  relaxed: { label: 'Relajado', detail: 'Sin reloj. Piensa cada turno con calma.' },
  normal: { label: 'Normal', detail: '10 s por ninja: 30 s por turno.' },
  expert: { label: 'Experto', detail: '5 s por ninja: 15 s por turno.' },
};

export const DIFFICULTIES: Record<Difficulty, { label: string; detail: string }> = {
  classic: { label: 'Clásica', detail: 'Los valores del juego original.' },
  storm: { label: 'Tormenta', detail: 'Más gólems, más resistentes y que rematan al más débil.' },
};

export const NINJA_TEXT: Record<
  ElementKind,
  {
    name: string;
    element: string;
    role: string;
    card: string;
    combo: string;
    /** El efecto de combo sin el "En combo," inicial (pantalla de equipo). */
    comboShort: string;
    basic: string;
  }
> = {
  fire: {
    name: 'Brasa',
    element: 'Fuego',
    role: 'Alcance medio',
    basic: 'Lanza dardos de papel a 2 casillas.',
    card: 'Daña y aturde a los gólems del área: pierden su próximo turno.',
    combo: 'En combo, además los quema: 3 de daño por turno durante 3 turnos.',
    comboShort: 'además los quema: 3 de daño por turno durante 3 turnos.',
  },
  water: {
    name: 'Marea',
    element: 'Agua',
    role: 'Cuerpo a cuerpo',
    basic: 'Golpea con sus guanteletes a 1 casilla. La que más aguanta.',
    card: 'Hace el doble del valor de la carta a los gólems del área.',
    combo: 'En combo, da Potencia a todo el equipo: el siguiente golpe o cura hace un 50 % más.',
    comboShort: 'da Potencia a todo el equipo: el siguiente golpe o cura hace un 50 % más.',
  },
  snow: {
    name: 'Escarcha',
    element: 'Nieve',
    role: 'Largo alcance y curación',
    basic: 'Lanza estrellas a 3 casillas o cura 6 a un aliado.',
    card: 'Daña a los gólems y cura a los ninjas del área. Revive a los caídos.',
    combo: 'En combo, da Escudo a todo el equipo: anula el siguiente golpe.',
    comboShort: 'da Escudo a todo el equipo: anula el siguiente golpe.',
  },
};

export const ENEMY_TEXT: Record<EnemyKind, { name: string; role: string; tip: string }> = {
  sniper: {
    name: 'Carámbano',
    role: 'Francotirador',
    tip: 'Pega más fuerte de lejos (3 a 5). Acércate para que duela menos.',
  },
  artillery: {
    name: 'Granizo',
    role: 'Artillero',
    tip: 'Su granizo salpica 4 a los vecinos del objetivo. No se amontonen.',
  },
  colossus: {
    name: 'Témpano',
    role: 'Coloso',
    tip: 'Lento pero brutal: barre tres casillas. No se pongan hombro con hombro frente a él.',
  },
};

export const BONUS_TEXT: Record<BonusCondition, (limit: number) => string> = {
  noKo: () => 'Desbloquea el bonus si ningún ninja cae en toda la partida.',
  fullHealth: () => 'Desbloquea el bonus si terminas la ronda 3 con todos a vida completa.',
  turnLimit: (n) => `Desbloquea el bonus si superas las rondas 1 a 3 en ${n} turnos o menos.`,
};

export const MAP_NAMES: Record<'cumbre' | 'desfiladero' | 'bosque', string> = {
  cumbre: 'Cumbre',
  desfiladero: 'Desfiladero',
  bosque: 'Bosque nevado',
};

export const BONUS_SHORT: Record<BonusCondition, string> = {
  noKo: 'Bonus: sin caídas',
  fullHealth: 'Bonus: vida completa',
  turnLimit: 'Bonus: contra el reloj',
};

export const ACHIEVEMENT_TEXT: Record<AchievementId, { name: string; detail: string }> = {
  combo2: { name: 'Combo doble', detail: 'Juega dos cartas en el mismo turno.' },
  combo3: { name: 'Combo triple', detail: 'Los tres ninjas juegan carta en el mismo turno.' },
  reviver: { name: 'Reanimador', detail: 'Revive a un ninja caído.' },
  upAgain: { name: 'De pie otra vez', detail: 'Gana con un ninja que cayó y fue revivido.' },
  noOneLeft: { name: 'Nadie se queda atrás', detail: 'Gana después de que los tres hayan caído alguna vez.' },
  healer15: { name: 'Mano sanadora', detail: 'Cura 15 veces en una partida.' },
  perfectStorm: { name: 'Tormenta perfecta', detail: 'Alcanza a 3 gólems con una sola carta.' },
  bonusWon: { name: 'Bonus conquistado', detail: 'Gana la ronda bonus.' },
  untouched: { name: 'Sin un rasguño', detail: 'Llega al bonus con todos a vida completa.' },
};

export const TIPS: readonly string[] = [
  'Si dos o más ninjas juegan carta en el mismo turno, desatan un combo.',
  'Las cartas golpean 9 casillas. Busca atrapar a varios gólems a la vez.',
  'Carámbano pega más fuerte de lejos. Acércate para que duela menos.',
  'Granizo salpica a los vecinos de su objetivo. No se amontonen.',
  'Témpano barre tres casillas. No se pongan hombro con hombro frente a él.',
  'Revivir ocupa tu acción: el ninja vuelve con 1 de vida antes del turno de los gólems. Revive lejos de su alcance.',
  'El medidor sube al moverte, al actuar y al recibir golpes. Llénalo para ganar cartas.',
  'Las acciones se resuelven en orden: primero Fuego, luego Agua y al final Nieve.',
  'Pasa el cursor sobre un gólem para ver hasta dónde puede atacar el próximo turno.',
  'Una carta de Fuego aturde: el gólem pierde su próximo turno.',
  'Escarcha puede revivir con su carta a quien esté dentro del área.',
];

export const STAT_LABELS = {
  turns: 'Turnos',
  combos: 'Combos',
  cardsPlayed: 'Cartas jugadas',
  enemiesDefeated: 'Gólems derrotados',
  ninjaKos: 'Caídas',
  basicHeals: 'Curaciones',
  revives: 'Reanimaciones',
  damageDealt: 'Daño total',
} as const;

export const BONUS_OUTCOME_TEXT = {
  pending: '',
  missed: 'No se desbloqueó la ronda bonus.',
  won: 'Ganaste la ronda bonus.',
  lost: 'La ronda bonus se perdió, pero la victoria es tuya.',
} as const;

/* ---------- Planificación y combate ---------- */

const ORDER_NAMES = `${NINJA_TEXT.fire.name}, ${NINJA_TEXT.water.name} y ${NINJA_TEXT.snow.name}`;

/** Avisos al planear un paso que no vale (§9.3). */
export const NOTICE = {
  cardOutOfRange: 'Esa casilla queda fuera del alcance de la carta.',
  exposedRevive: (name: string) => `Ojo: ${name} volverá con 1 de vida y ahí lo pueden alcanzar.`,
  reviveFromNeighbor: (name: string) => `Para revivir a ${name}, planea terminar en una casilla vecina.`,
  enemyOutOfRange: 'Ese gólem está fuera de alcance desde la casilla planeada.',
  actionLost: 'La acción anterior ya no alcanza desde aquí: elige otra.',
  tileReserved: (name: string) => `Esa casilla ya la reservó ${name}.`,
  rock: 'Ahí hay una roca.',
  outOfReach: (name: string) => `${name} no llega hasta ahí este turno.`,
} as const;

/** Estado del plan de cada ninja, en su panel. */
export const PLAN_TEXT = {
  ko: 'Caído',
  none: 'Sin plan',
  move: 'Solo moverse',
  attack: (target?: string) => (target ? `Atacar a ${target}` : 'Atacar'),
  heal: (target?: string) => (target ? `Curar a ${target}` : 'Curar'),
  revive: (target?: string) => (target ? `Revivir a ${target}` : 'Revivir'),
  card: (value?: number) => (value === undefined ? 'Carta' : `Carta ${value}`),
} as const;

/** Consejo en pantalla según la fase del turno (§9.5). */
export const TIP_TEXT = {
  intro: 'Los gólems bajan de la montaña.',
  holdToBoost: 'Mantén Espacio para acelerar.',
  ninjas: (hint: string) => `Actúan tus ninjas: ${ORDER_NAMES}, en ese orden. ${hint}`,
  enemies: (hint: string) => `Responden los gólems, uno por uno. ${hint}`,
  end: (hint: string) => `Final del turno: quemaduras y cierre de ronda. ${hint}`,
  enemy: (name: string, role: string, hp: number, maxHp: number, tip: string) =>
    `${name}, ${role.toLowerCase()} (${hp}/${maxHp}). ${tip}`,
  confirm: 'Confirma el turno.',
  placeCard: (name: string) => `Elige dónde colocar la carta de ${name}. Afecta un área de 3×3.`,
  start: (name: string) => `${name}: elige a dónde moverte, un objetivo o una carta.`,
  action: (name: string) => `${name}: elige un objetivo desde la nueva casilla o juega una carta.`,
  pending: (names: readonly string[]) => `Tab pasa al siguiente ninja. Falta planear a ${names.join(' y ')}.`,
  ready: 'Todo listo. Confirma el turno con Espacio.',
} as const;

/** Progreso de la condición del bonus en la ficha de ronda (R-21). */
export const BONUS_PROGRESS = {
  unlocked: 'Desbloqueado',
  noKoOk: 'Nadie ha caído',
  noKoBad: 'Alguien cayó',
  fullOk: 'Todos a tope',
  fullBad: 'Hay heridos',
} as const;

/** Paneles de los ninjas y mano de cartas. */
export const HUD = {
  panelLabel: (name: string, hp: number, maxHp: number, plan: string) => `${name}, ${hp} de ${maxHp} de vida. ${plan}`,
  orderTitle: 'Orden de resolución',
  meterFull: 'Medidor lleno: juega una carta para robar otra',
  meter: (value: number, max: number) => `Medidor ${value} de ${max}`,
  shield: 'Escudo',
  shieldTitle: 'Escudo: anula el siguiente golpe',
  boost: 'Potencia',
  boostTitle: 'Potencia: +50 % en el siguiente golpe o cura',
  handHint: 'Teclas 1 a 4 · clic derecho o Esc deshace',
  card: (element: string, value: number) => `Carta de ${element} de valor ${value}`,
} as const;

/** Carteles de combo y de bonus. */
export const COMBO_EFFECT: Record<ElementKind, string> = {
  fire: 'Quemadura: 3 de daño por turno durante 3 turnos',
  water: 'Potencia para todo el equipo',
  snow: 'Escudo para todo el equipo',
};

export const OVERLAY_TEXT = {
  bonusRound: 'Última oleada. Pase lo que pase, la victoria ya es suya.',
  bonusMet: '¡Bonus desbloqueado!',
  bonusMetDetail: 'Llega una última oleada de gólems.',
  bonusMissed: 'Sin ronda bonus',
  bonusMissedDetail: 'No se cumplió la condición. Será para la próxima.',
} as const;

/* ---------- Pantallas ---------- */

export const SCREEN_TEXT = {
  kicker: 'Tácticas por turnos · 1 jugador',
  collection: 'Colección',
  credits: 'Proyecto de clase. Arte, sonido y música generados en código.',
  welcome: (camino: string, card: string | undefined) =>
    `Bienvenida al ${camino}: recibiste ${card ?? 'tu carta de camino'} y un 9 de cada elemento.`,
  reserveTitle: 'Cartas de tu reserva para esta partida',
  cardLabel: 'Carta:',
  comboLabel: 'Combo:',
  stats: { hp: 'Vida', attack: 'Daño', range: 'Alcance', move: 'Paso' },
  aids: 'Ayudas',
  tip: 'Consejo',
  victory: 'Los tres aprendices resistieron la tormenta.',
  defeat: 'La escarcha cubrió a los tres. Revisa el orden de acciones y vuelve a intentarlo.',
  coinLine: (round: number | 'bonus') => (round === 'bonus' ? 'Bonus' : `Ronda ${round}`),
  total: 'Total',
  balance: 'Ahora tienes',
  matchMeta: (difficulty: string, map: string) => `Dificultad ${difficulty}, mapa ${map}.`,
  clearedIn: (turns: number) => `Rondas 1 a 3 en ${turns} turnos.`,
} as const;

/* ---------- Ayuda ---------- */

export const HELP = {
  intro:
    'Tres aprendices de papel contra gólems de escarcha en un tablero de 9×5. Supera tres rondas y, si cumples la condición de bonus, una cuarta. Pierdes si caen los tres a la vez.',
  turnTitle: 'Cada turno',
  turn: [
    'Planea a cada ninja: primero a dónde se mueve (casillas azules) y luego qué hace.',
    'Haz clic en un gólem para atacarlo, en un aliado para curarlo (Escarcha) o revivirlo, o elige una carta y su casilla central.',
    `Confirma el turno. Se resuelve en orden: ${ORDER_NAMES}; después actúan los gólems, que siempre atacan si pueden.`,
    'El reloj da 10 segundos por ninja. Si se acaba, se juega lo que hayas planeado.',
  ],
  teamTitle: 'Tu equipo',
  ninjaStats: (hp: number, attack: number, range: number, move: number) =>
    `Vida ${hp}, daño ${attack}, alcance ${range}, paso ${move}.`,
  golemsTitle: 'Los gólems',
  golemStats: (hp: number, range: number, move: number) => `Vida ${hp}, alcance ${range}, paso ${move}.`,
  cardsTitle: 'Cartas y combos',
  cards: [
    'El medidor sube con cada movimiento, acción o golpe recibido. Al llenarse, ganas una carta (máximo 4).',
    'Las cartas afectan un área de 3×3 y se colocan dentro del alcance de movimiento del ninja.',
    'Si dos o tres ninjas juegan carta el mismo turno, hay combo: Fuego quema, Agua da Potencia y Nieve da Escudo.',
  ],
  koTitle: 'Caer y revivir',
  ko: [
    'Un ninja caído no actúa, pero puede ser revivido desde una casilla vecina (también en diagonal).',
    'Revivir ocupa la acción. El caído se levanta al instante con 1 de vida, antes de que actúen los gólems: si lo alcanzan, puede volver a caer ese mismo turno.',
  ],
  coinsTitle: 'Monedas, cajas y colección',
  coins: [
    'Cada ronda superada paga al instante: 60, 120 y 120, más 120 si ganas el bonus. Lo cobrado no se pierde aunque después caigas o salgas. Con los 9 logros, las monedas se duplican.',
    'Con monedas compras cajas de 1, 2 o 3 cartas del elemento que elijas. Los números altos son menos comunes.',
    'Tu reserva en cada partida es toda tu colección de ese elemento, con repetidas: al llenarse el medidor sale una al azar. Más cartas, más combos.',
  ],
  keysTitle: 'Controles',
  keys: [
    ['Clic', 'Seleccionar ninja, casilla u objetivo'],
    ['Clic derecho · Esc', 'Deshacer el último paso del plan'],
    ['Tab', 'Siguiente ninja (Shift + Tab: anterior)'],
    ['1 a 4', 'Elegir carta'],
    ['Espacio', 'Confirmar turno'],
    ['S', 'Sugerir jugada para el ninja activo'],
    ['Mantén Espacio', 'Acelerar la resolución del turno'],
    ['P', 'Pausa'],
  ],
  backToPause: 'Volver a la pausa',
} as const;

/* ---------- Progresión (§18) ---------- */

export const CAMINO_TITLE: Record<ElementKind, string> = {
  fire: 'Camino del Fuego',
  water: 'Camino del Agua',
  snow: 'Camino de la Nieve',
};

export const PROGRESSION = {
  caminoTitle: 'Elige tu camino',
  caminoIntro:
    'Es tu primera carta de poder y define tu camino ninja: tu título, tu color y, en el multijugador, el ninja que llevarás. La elección es permanente.',
  caminoNote: 'Además recibes una carta de 9 de cada elemento para empezar.',
  caminoPick: 'Elige una carta',
  collection: 'Colección y tienda',
  collectionIntro:
    'Tus cartas forman tu reserva en cada partida: todas, con repetidas, salen al azar al llenarse el medidor.',
  coins: 'Monedas',
  reserve: (n: number) => (n === 1 ? '1 carta' : `${n} cartas`),
  box: (element: string) => `Caja de ${element}`,
  boxSize: (n: number) => (n === 1 ? '1 carta' : `${n} cartas`),
  repeatedNote: 'Puede salir repetida: las repetidas también entran a tu reserva.',
  earnHint: 'Ganas monedas por cada ronda superada: 60, 120 y 120, más 120 si ganas el bonus.',
  revealTitle: (element: string) => `Tu caja de ${element}`,
  fresh: 'Nueva',
  repeated: 'Repetida',
  keepGoing: 'Seguir',
  noCoins: 'Esta vez no superaste ninguna ronda, así que no hubo monedas.',
  doubleCoins: 'Monedas dobles (9 logros)',
  stormWarning: 'Tormenta es casi imposible con menos de 4 cartas por elemento. Junta más antes de intentarlo.',
} as const;

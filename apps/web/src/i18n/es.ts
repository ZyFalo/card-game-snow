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
  autoAdvance: 'Pasar al siguiente ninja al terminar su plan',
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
  turnsLeft: (n: number) => (n === 1 ? 'queda 1 turno' : `quedan ${Math.max(0, n)} turnos`),
  combo: '¡Combo!',
  victory: 'Victoria',
  defeat: 'Derrota',
  newAchievement: 'Nuevo',
  achievements: 'Logros',
  statsTitle: 'Resumen de la partida',
  loading: 'Doblando a los aprendices…',
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
  { name: string; element: string; role: string; card: string; combo: string; basic: string }
> = {
  fire: {
    name: 'Brasa',
    element: 'Fuego',
    role: 'Alcance medio',
    basic: 'Lanza dardos de papel a 2 casillas.',
    card: 'Daña y aturde a los gólems del área: pierden su próximo turno.',
    combo: 'En combo, además los quema: 3 de daño por turno durante 3 turnos.',
  },
  water: {
    name: 'Marea',
    element: 'Agua',
    role: 'Cuerpo a cuerpo',
    basic: 'Golpea con sus guanteletes a 1 casilla. La que más aguanta.',
    card: 'Hace el doble del valor de la carta a los gólems del área.',
    combo: 'En combo, da Potencia a todo el equipo: el siguiente golpe o cura hace un 50 % más.',
  },
  snow: {
    name: 'Escarcha',
    element: 'Nieve',
    role: 'Largo alcance y curación',
    basic: 'Lanza estrellas a 3 casillas o cura 6 a un aliado.',
    card: 'Daña a los gólems y cura a los ninjas del área. Revive a los caídos.',
    combo: 'En combo, da Escudo a todo el equipo: anula el siguiente golpe.',
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

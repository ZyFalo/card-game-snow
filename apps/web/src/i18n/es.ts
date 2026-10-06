import type { BonusCondition, Difficulty, ElementKind, EnemyKind } from '@ventisca/core';

/* Todos los textos de la interfaz viven aquí (P-11: listos para traducir). */

export type Pace = 'relaxed' | 'normal' | 'expert';

export const ES = {
  title: 'Ventisca',
  tagline: 'Tres aprendices de papel contra la tormenta',
  play: 'Jugar',
  howToPlay: 'Cómo jugar',
  back: 'Volver',
  close: 'Cerrar',
  sending: 'Enviando…',
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
  round: (r: number | 'bonus') => (r === 'bonus' ? 'Ronda bonus' : `Ronda ${r} de 3`),
  roundBanner: (r: number | 'bonus') => (r === 'bonus' ? 'Ronda bonus' : `Ronda ${r}`),
  bonusLocked: 'Bonus',
  /** Bonus contra el reloj (R-21): el turno t de un límite de n y los que quedan contando ese. */
  turnLimitProgress: (t: number, n: number) =>
    t <= n ? `Turno ${t} de ${n} · quedan ${n - t + 1}` : `Turno ${t} de ${n} · límite superado`,
  combo: '¡Combo!',
  victory: 'Victoria',
  defeat: 'Derrota',
  blocked: 'Bloqueado',
  statsTitle: 'Resumen de la partida',
  loading: 'Doblando a los aprendices…',
  noWebglTitle: 'Este navegador no puede mostrar el tablero',
  noWebglBody:
    'Ventisca dibuja el tablero con WebGL y aquí no está disponible. Activa la aceleración por hardware en la configuración del navegador, o prueba con una versión reciente de Chrome, Edge, Firefox o Safari, y vuelve a abrir la página.',
} as const;

export const PACES: Record<Pace, { label: string; detail: string }> = {
  relaxed: { label: 'Relajado', detail: 'Sin reloj. Piensa cada turno con calma.' },
  normal: { label: 'Normal', detail: '10 s por ninja en pie (30 s con los tres).' },
  expert: { label: 'Experto', detail: '5 s por ninja en pie (15 s con los tres).' },
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
  /** La mano de un ninja que todavía no tiene cartas. */
  handEmpty: 'Llena el medidor para ganar cartas',
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
  /** Pie de la portada (D-75). */
  pilot: 'Piloto de un proyecto personal',
  cardLabel: 'Carta:',
  comboLabel: 'Combo:',
  stats: { hp: 'Vida', attack: 'Daño', range: 'Alcance', move: 'Paso' },
  aids: 'Ayudas',
  tip: 'Consejo',
  victory: 'Los tres aprendices resistieron la tormenta.',
  defeat: 'La escarcha cubrió a los tres. Revisa el orden de acciones y vuelve a intentarlo.',
  matchMeta: (difficulty: string, map: string) => `Dificultad ${difficulty}, mapa ${map}.`,
  clearedIn: (turns: number) => `Rondas 1 a 3 en ${turns} turnos.`,
} as const;

/*
 * Créditos (D-76): Ventisca reconoce su inspiración. Los tres primeros párrafos son el "Texto corto para
 * el juego" de CREDITOS.md, tal como lo escribió el dueño de producto (una prueba los compara); el último
 * es la frase que estaba en el pie de la portada. Es el único lugar del juego que nombra al original (D-01).
 */
export const CREDITS_TEXT = {
  title: 'Créditos',
  body: [
    'Ventisca es un homenaje a Card-Jitsu Nieve, de la saga Card-Jitsu de Club Penguin. De ahí viene la idea; los personajes, el arte, la música, los sonidos y el código son propios.',
    'Club Penguin y Card-Jitsu son marcas de Disney, y Ventisca no está afiliado ni respaldado por Disney.',
    'Gracias al equipo de Club Penguin y a su comunidad.',
    'Arte, sonido y música generados en código.',
  ],
} as const;

/* ---------- Ayuda ---------- */

export const HELP = {
  intro:
    'Tres aprendices de papel contra gólems de escarcha en un tablero de 9×5. Supera tres rondas y, si cumples la condición de bonus, una cuarta. Pierdes si caen los tres a la vez.',
  turnTitle: 'Cada turno',
  turn: [
    'Planea a cada ninja: primero a dónde se mueve (las casillas de su color) y luego qué hace.',
    'Haz clic en un gólem para atacarlo, en un aliado para curarlo (Escarcha) o revivirlo, o elige una carta y su casilla central.',
    `Confirma el turno. Se resuelve en orden: ${ORDER_NAMES}; después actúan los gólems, que siempre atacan si pueden.`,
    'El reloj da 10 s por cada ninja en pie en ritmo Normal (5 s en Experto; sin reloj en Relajado). Si se acaba, se juega lo que hayas planeado.',
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

/* ---------- Cuentas (modo en línea, PRD de v2) ---------- */

export const ACCOUNT_TEXT = {
  playSandbox: 'Jugar sin cuenta',
  enter: 'Entrar',
  myAccount: 'Mi cuenta',
  privacy: 'Aviso de privacidad',
  back: 'Volver',
  email: 'Correo',
  password: 'Contraseña',
  passwordRepeat: 'Repite la contraseña',
  newPassword: 'Contraseña nueva',
  newPasswordRepeat: 'Repite la contraseña nueva',
  currentPassword: 'Contraseña actual',
  displayName: 'Nombre visible',
  displayNameHint: 'De 3 a 16 caracteres. Lo ven las personas con quienes juegas.',
  passwordHint: 'De 8 a 128 caracteres, con una mayúscula, un número y un símbolo.',
  code: 'Código de 6 dígitos',
  loginTitle: 'Entrar',
  loginIntro: 'Con tu cuenta guardas tu progreso. Pronto podrás jugar en línea.',
  loginSubmit: 'Entrar',
  toRegister: 'Crear una cuenta',
  toRecover: '¿Olvidaste tu contraseña?',
  toRevert: 'Deshacer un cambio de correo',
  registerTitle: 'Crear una cuenta',
  registerIntro: 'Solo te pedimos un correo, un nombre visible y una contraseña.',
  /** Lo que da una cuenta (lineamientos, sección 5). */
  benefits: {
    progress: 'Tu progreso queda guardado',
    online: 'Juega en línea con amigos',
    collection: 'Tu colección de cartas',
  },
  /** Marca de un beneficio que todavía no existe. */
  soon: 'Próximamente',
  registerSubmit: 'Crear cuenta',
  acceptPrivacy: 'Leí y acepto el',
  captchaWaiting: 'Comprobando que no eres un programa…',
  verifyTitle: 'Verifica tu correo',
  verifyIntro: (email: string) =>
    `Revisa ${email}: si la cuenta es nueva, te llegó un código de 6 dígitos que vence en 15 minutos.`,
  verifySubmit: 'Verificar',
  resend: 'Pedir otro código',
  resendWait: (s: number) => `Pedir otro código (${s} s)`,
  resendDone:
    'Si ese correo tiene una cuenta pendiente, te llega un código nuevo. Revisa también el correo no deseado.',
  recoverTitle: 'Recuperar la contraseña',
  recoverIntro: 'Te mandamos un código al correo de tu cuenta para crear una contraseña nueva.',
  recoverSteps: ['Escribe el correo de tu cuenta.', 'Te llega un código de 6 dígitos.', 'Elige una contraseña nueva.'],
  recoverSubmit: 'Enviar código',
  recoverCodeIntro: (email: string) =>
    `Si ${email} tiene una cuenta, te llegó un código. Escríbelo con tu contraseña nueva. Al terminar se cierran tus demás sesiones.`,
  recoverCodeSubmit: 'Cambiar la contraseña',
  revertTitle: 'Deshacer un cambio de correo',
  revertIntro: 'Si alguien cambió el correo de tu cuenta, te llegó un aviso al correo anterior con un código.',
  revertSteps: [
    'Busca el aviso en tu correo anterior.',
    'Escribe ese correo y el código, que vale 7 días.',
    'Elige una contraseña nueva: quien hizo el cambio conocía la anterior.',
  ],
  revertEmail: 'Correo anterior',
  revertSubmit: 'Deshacer el cambio',
  revertDone: 'Listo: tu cuenta volvió a su correo anterior. Entra con tu contraseña nueva.',
  profileTitle: (name: string) => `Hola, ${name}`,
  profileIntro: 'Aquí ves tu progreso y administras tu cuenta. El juego en línea llega en las próximas versiones.',
  changePassword: 'Cambiar la contraseña',
  savePassword: 'Guardar la contraseña',
  accountRow: 'Tu cuenta',
  accountRowDetail: 'Borrarla no se puede deshacer.',
  changePasswordDone: 'Tu contraseña cambió. Cerramos tus otras sesiones.',
  changeEmail: 'Cambiar el correo',
  newEmail: 'Correo nuevo',
  changeEmailSent: 'Te mandamos un código al correo nuevo. Escríbelo aquí para confirmar el cambio.',
  changeEmailSubmit: 'Confirmar el correo nuevo',
  changeEmailDone: (email: string) => `Listo: tu correo ahora es ${email}.`,
  logout: 'Cerrar sesión',
  deleteAccount: 'Borrar la cuenta',
  deleteWarning:
    'Se borran tu cuenta, tus sesiones y tu progreso, y no se puede deshacer. En las partidas pasadas, tu lugar queda anónimo.',
  deleteSubmit: 'Borrar mi cuenta',
  deleteDone: 'Tu cuenta se borró.',
  send: 'Enviar',
  cancel: 'Cancelar',
  invite: '¿Te gustó? Crea una cuenta: guarda tu progreso y pronto podrás jugar en línea.',
  inviteButton: 'Crear una cuenta',
  passwordsDiffer: 'Las dos contraseñas no coinciden.',
} as const;

/* ---------- Progreso en la cuenta (PRD §18; D-34) ---------- */

export const CAMINO_TITLE: Record<ElementKind, string> = {
  fire: 'Camino del Fuego',
  water: 'Camino del Agua',
  snow: 'Camino de la Nieve',
};

const cards = (n: number) => (n === 1 ? '1 carta' : `${n} cartas`);

export const PROGRESS_TEXT = {
  /* Elegir el camino (R-30) */
  caminoTitle: 'Elige tu camino',
  caminoIntro:
    'Es tu primera carta de poder y define tu camino ninja: tu título, tu color y el ninja que llevarás en línea. La elección es permanente.',
  caminoNote: 'Además recibes una carta de 9 de cada elemento para empezar.',
  caminoPick: 'Elige una carta',
  caminoChoose: (title: string) => `Elegir el ${title}`,
  caminoDone: (title: string) => `Listo: elegiste el ${title} y recibiste tu mazo inicial.`,
  /* El resumen del perfil */
  summaryLabel: 'Tu progreso',
  summaryLoading: 'Cargando tu progreso…',
  summaryError: 'No se pudo cargar tu progreso. Revisa tu conexión e inténtalo de nuevo.',
  retry: 'Reintentar',
  noCaminoTitle: 'Todavía no eliges tu camino',
  noCaminoBody: 'Tu primera carta de poder define tu camino ninja. Con ella recibes tu mazo inicial.',
  toCamino: 'Elegir mi camino',
  toCollection: 'Colección y tienda',
  distinct: (n: number, of: number) => `${n} de ${of}`,
  boxes: 'Cajas',
  boxesOpened: (n: number) => (n === 1 ? 'abierta' : 'abiertas'),
  /* Colección y tienda (R-25 a R-28) */
  collection: 'Colección y tienda',
  collectionIntro:
    'Tus cartas serán tu reserva en las partidas en línea: todas, con repetidas, saldrán al azar al llenarse el medidor.',
  tabs: 'Elemento',
  cardOwned: (name: string, element: string, value: number, qty: number) =>
    `${name}: carta de ${element} de ${value}${qty > 1 ? `, tienes ${qty}` : ''}`,
  cardMissing: (element: string, value: number) => `Carta de ${element} de ${value} que aún no tienes`,
  missingName: '? ? ?',
  box: (element: string) => `Caja de ${element}`,
  /** "Tienes" + la cantidad en negrita + "de Fuego". */
  owned: 'Tienes',
  ofElement: (element: string) => `de ${element}`,
  average: 'promedio',
  distinctLong: (n: number, of: number) => `${n} de ${of} distintas`,
  boxSize: cards,
  buy: (size: number, element: string, price: number) =>
    `Comprar una caja de ${cards(size)} de ${element} por ${price} monedas`,
  buying: 'Comprando…',
  /** La respuesta de una compra se perdió: reintentar es seguro (D-66). */
  purchaseUnknown: 'No llegó la respuesta. Compra de nuevo esa caja: no se cobra dos veces.',
  odds: (list: string) => `Probabilidad por carta: ${list}.`,
  repeatedNote: 'Puede salir repetida. Las repetidas también sirven: cada copia irá a tu reserva.',
  earnHint: (rounds: string, bonus: number) =>
    `Ganarás monedas en las partidas en línea, por cada ronda superada: ${rounds}, más ${bonus} si ganas el bonus.`,
  coinsWord: (n: number) => (n === 1 ? 'moneda' : 'monedas'),
  /* Una caja recién abierta */
  revealTitle: (element: string) => `Tu caja de ${element}`,
  fresh: 'Nueva',
  repeated: 'Repetida',
  keepGoing: 'Seguir',
  revealNote: (fresh: number) =>
    fresh === 0
      ? 'Todas eran repetidas. Igual sirven: cada copia irá a tu reserva y será más probable robarla.'
      : fresh === 1
        ? 'Una carta nueva para tu colección.'
        : `${fresh} cartas nuevas para tu colección.`,
} as const;

/** Mensajes para cada error de la API (el servidor solo manda códigos). */
export const ACCOUNT_ERRORS = {
  offline: 'No hay conexión con el servidor. Inténtalo de nuevo en un rato.',
  bad_request: 'Revisa los datos del formulario.',
  badEmail: 'Revisa el correo: no parece una dirección válida.',
  sameEmail: 'Ese ya es tu correo.',
  privacy_not_accepted: 'Para crear la cuenta, acepta el aviso de privacidad.',
  name_taken: 'Ese nombre ya está en uso. Prueba con otro.',
  name: {
    length: 'El nombre va de 3 a 16 caracteres.',
    characters: 'El nombre solo puede tener letras, números, espacios, guiones y guiones bajos.',
    spaces: 'El nombre no puede tener espacios dobles.',
    offensive: 'Ese nombre no está permitido. Prueba con otro.',
    reserved: 'Ese nombre está reservado. Prueba con otro.',
  },
  password: {
    length: 'La contraseña va de 8 a 128 caracteres.',
    newline: 'La contraseña no puede tener saltos de línea.',
    uppercase: 'Agrega al menos una mayúscula.',
    digit: 'Agrega al menos un número.',
    symbol: 'Agrega al menos un símbolo, como # o !.',
    common: 'Esa contraseña es muy común. Elige otra.',
    personal: 'La contraseña no puede contener tu correo ni tu nombre.',
  },
  invalid_code: 'El código no es válido o ya venció. Revísalo o pide uno nuevo.',
  attemptsLeft: (n: number) => (n === 1 ? 'Te queda 1 intento.' : `Te quedan ${n} intentos.`),
  code_expired: 'El código venció. Pide uno nuevo.',
  too_many_attempts: 'Ese código ya no sirve. Pide uno nuevo.',
  invalid_credentials: 'Correo o contraseña incorrectos.',
  email_not_verified: 'Falta verificar tu correo. Escribe el código que te enviamos o pide uno nuevo.',
  too_many_requests: 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.',
  captcha_failed: 'No pudimos comprobar que no eres un programa. Inténtalo de nuevo.',
  captcha_unavailable: 'El registro no está disponible en este momento.',
  email_unavailable: 'No podemos enviar correos en este momento. Inténtalo más tarde.',
  email_taken: 'Ese correo ya tiene otra cuenta.',
  unauthorized: 'Tu sesión terminó. Vuelve a entrar.',
  camino_required: 'Primero elige tu camino.',
  camino_already_chosen: 'Ya habías elegido tu camino, y es permanente.',
  not_enough_coins: 'No te alcanzan las monedas para esa caja.',
  generic: 'Algo falló en el servidor. Inténtalo de nuevo.',
} as const;

/*
 * Aviso de privacidad, aprobado por el dueño de producto el 2026-09-30, con la frase de Resend (envío desde
 * São Paulo) y la del plazo de los códigos (R-50) aprobadas en la revisión del PR #11. El contacto pasa a
 * ventisca@wpena.dev (D-62). Su primer párrafo cambió con D-75: Ventisca dejó de ser un proyecto de clase y
 * es el piloto de un proyecto personal. La fecha de vigencia es la de la fusión de ese cambio.
 */
export const PRIVACY_NOTICE = {
  title: 'Aviso de privacidad de Ventisca',
  since: 'Vigente desde el 6 de octubre de 2026',
  sections: [
    {
      title: '',
      body: [
        'Ventisca es el piloto de un proyecto personal, que su responsable, William Andrés Peña Vargas, avanza en sus ratos libres. Hoy el juego es gratuito: no vende nada ni muestra publicidad. Para cualquier tema de este aviso, escribe a ventisca@wpena.dev.',
      ],
    },
    {
      title: 'Al abrir el juego',
      body: [
        'Como en cualquier página web, al abrir Ventisca tu navegador se conecta a nuestro servidor. Railway, la empresa que lo aloja, anota en cada visita tu dirección IP, tu navegador y la página pedida. Nosotros podemos consultar esas anotaciones durante 7 días y solo las usamos para resolver fallas. Jugar sin cuenta no envía nada más, ni a nosotros ni a otras empresas.',
      ],
    },
    {
      title: 'Si creas una cuenta, guardamos',
      items: [
        'Tu correo, para verificar tu cuenta, recuperarla y avisarte de cambios en ella o en este aviso.',
        'Una huella de tu contraseña (Argon2id), que no permite recuperarla. Tu contraseña nunca se guarda.',
        'Tu nombre visible, que ven las personas con quienes juegas.',
        'Tu progreso: carta de camino, monedas, cajas abiertas, colección y logros.',
        'Tus estadísticas de combate. Solo las ves tú.',
        'Las partidas en línea que jugaste: con qué ninja, cuándo entraste y cuándo saliste.',
        'Una cookie necesaria para mantener tu sesión abierta.',
      ],
      body: [
        'Para frenar abusos, como intentos repetidos de entrar a una cuenta, el servidor recuerda tu IP durante 15 minutos, solo en memoria. No la guardamos en la base de datos.',
        'No pedimos tu edad, tu nombre real ni tu ubicación. No hay pagos ni chat.',
      ],
    },
    {
      title: 'Para qué los usamos',
      body: [
        'Solo para que el juego funcione: tu cuenta, tu progreso, las partidas en línea y la protección contra abusos. No los vendemos. No hay publicidad ni analítica.',
      ],
    },
    {
      title: 'Quién más los procesa',
      body: [],
      items: [
        'Railway aloja el servidor y la base de datos en Estados Unidos.',
        'Resend envía los correos con tus códigos y avisos desde São Paulo (Brasil), y guarda cada correo (dirección, asunto y contenido) durante 30 días en Estados Unidos. No medimos si abres los correos ni en qué enlaces haces clic.',
        'Cloudflare Turnstile, solo en la página de registro, comprueba que no seas un programa automático. Recibe tu IP y datos técnicos de tu navegador, y los usa para detectar programas automáticos y para mejorar esa detección. Cloudflare no publica cuánto tiempo los guarda y dice que no los usa para publicidad.',
        'Cloudflare recibe los mensajes que escribes a ventisca@wpena.dev y los reenvía al buzón del responsable. Según Cloudflare, no lee ni guarda su contenido. Su panel muestra al responsable quién escribió y cuándo, durante un tiempo que Cloudflare no publica.',
      ],
    },
    {
      title: 'Cuánto tiempo los guardamos',
      body: [
        'Mientras tengas la cuenta. Las sesiones vencen a los 30 días, y los códigos que enviamos por correo, a los 15 minutos, salvo el que sirve para deshacer un cambio de correo, que vale 7 días.',
      ],
    },
    {
      title: 'Borrar tu cuenta',
      body: [
        'Desde tu perfil, confirmando con tu contraseña. Al instante se borran tu cuenta, tus sesiones, tus códigos, tu progreso y tus estadísticas. En las partidas pasadas, tu lugar queda anónimo, como el del bot. Los correos que ya te enviamos siguen en Resend hasta cumplir sus 30 días.',
      ],
    },
    {
      title: 'Tus derechos',
      body: [
        'Puedes conocer, actualizar, corregir y borrar tus datos. También puedes retirar tu autorización borrando la cuenta. Para ejercerlos, escribe a ventisca@wpena.dev. En Colombia, estos derechos los reconoce la Ley 1581 de 2012; si no te respondemos, puedes acudir a la Superintendencia de Industria y Comercio.',
      ],
    },
    {
      title: 'Menores de edad',
      body: [
        'El juego es para todo el mundo y no pedimos la edad. Si eres menor de edad, lee este aviso con un adulto responsable antes de crear tu cuenta.',
      ],
    },
    {
      title: 'Cambios',
      body: ['Si cambia este aviso, lo avisaremos en el juego y por correo antes de que rija.'],
    },
  ],
} as const;

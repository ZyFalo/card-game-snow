import { sql } from 'drizzle-orm';
import { bigint, check, index, integer, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

/*
 * Esquema de Postgres (Drizzle, D-52). Cada tabla llega con la función que la usa. Tras cambiarlo,
 * `pnpm db:generate` escribe la migración en drizzle/ y el servidor la aplica al arrancar.
 */

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

/** La cuenta (PRD de v2, "Modelo de datos"). Borrarla borra su progreso en cascada (D-56). */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** En minúsculas y NFC: dos formas de escribir el mismo correo son la misma cuenta. */
  email: text('email').notNull().unique(),
  /** Argon2id (D-54). */
  passwordHash: text('password_hash').notNull(),
  /** Tal como lo escribió la persona. */
  displayName: text('display_name').notNull(),
  /** Sin mayúsculas ni tildes: la unicidad del nombre visible no los distingue. */
  displayNameKey: text('display_name_key').notNull().unique(),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  createdAt: createdAt(),
});

/**
 * Sesiones con cookie (PRD de v2, "Cuentas"). El id es la huella HMAC del token de la cookie: con la
 * base en la mano no se puede suplantar a nadie.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
);

export const EMAIL_CODE_PURPOSES = ['verify', 'recover', 'change_email', 'revert_email'] as const;

/**
 * Códigos de 6 dígitos de un solo uso (R-43): se guarda su huella HMAC, nunca el código. `revert_email`
 * es el que deshace un cambio de correo desde el correo anterior (R-50).
 */
export const emailCodes = pgTable(
  'email_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: text('purpose', { enum: EMAIL_CODE_PURPOSES }).notNull(),
    codeHash: text('code_hash').notNull(),
    /**
     * El correo que se aplica al usar el código: el nuevo al cambiarlo (R-48), o el anterior al
     * deshacer el cambio (R-50).
     */
    newEmail: text('new_email'),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('email_codes_user_purpose_idx').on(t.userId, t.purpose),
    check('email_codes_purpose_check', sql`${t.purpose} in ('verify', 'recover', 'change_email', 'revert_email')`),
    index('email_codes_purpose_new_email_idx').on(t.purpose, t.newEmail),
  ],
);

/* ---------- Progreso en la cuenta (D-34; R-25 a R-32) ---------- */

export const CAMINO_ELEMENTS = ['fire', 'water', 'snow'] as const;

/**
 * Estado del progreso. La fila nace cuando la persona elige su carta de camino (R-30), que es
 * permanente: sin fila, todavía no eligió. Se borra con la cuenta (D-56).
 */
export const profiles = pgTable(
  'profiles',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    caminoElement: text('camino_element', { enum: CAMINO_ELEMENTS }).notNull(),
    coins: integer('coins').notNull().default(0),
    boxesOpened: integer('boxes_opened').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    check('profiles_camino_element_check', sql`${t.caminoElement} in ('fire', 'water', 'snow')`),
    // El saldo nunca baja de cero: ni dos compras a la vez pueden gastar de más (R-28).
    check('profiles_coins_check', sql`${t.coins} >= 0`),
    check('profiles_boxes_opened_check', sql`${t.boxesOpened} >= 0`),
  ],
);

/** Cartas del banco que tiene cada persona, con sus copias repetidas (R-25, R-26). */
export const collection = pgTable(
  'collection',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.userId, { onDelete: 'cascade' }),
    /** Id de la carta en el banco de `packages/core` (por ejemplo, `fire-18`). */
    cardId: text('card_id').notNull(),
    count: integer('count').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.cardId] }), check('collection_count_check', sql`${t.count} > 0`)],
);

export const LEDGER_ROUNDS = ['1', '2', '3', 'bonus'] as const;

/* ---------- Partidas en línea (PRD de v2, R-33 a R-55) ---------- */

/**
 * Cómo está una partida. `playing` es la única que sigue viva; de ahí sale una sola vez, y quien la saca
 * hace las cuentas: `finished` (terminó, con victoria o derrota), `abandoned` (se fueron todas las
 * personas, R-38) o `interrupted` (el servidor se reinició, R-54).
 */
export const MATCH_STATUSES = ['playing', 'finished', 'abandoned', 'interrupted'] as const;
export const MATCH_DIFFICULTIES = ['classic', 'storm'] as const;

/**
 * Una partida en línea. Mientras se juega vive en la memoria del servidor: aquí queda quién jugó, cómo
 * terminó y, en `match_players`, las rondas que cada persona tiene por cobrar. El estado de cada turno no
 * se guarda (D-94).
 */
export const matches = pgTable(
  'matches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** El código de la sala desde la que se jugó; sin él, la partida salió de la cola pública. */
    roomCode: text('room_code'),
    difficulty: text('difficulty', { enum: MATCH_DIFFICULTIES }).notNull(),
    /** La semilla del azar de la partida (R-23): entero sin signo de 32 bits. */
    seed: bigint('seed', { mode: 'number' }).notNull(),
    status: text('status', { enum: MATCH_STATUSES }).notNull().default('playing'),
    /** Al terminar: si el equipo ganó, y qué pasó con la ronda bonus. */
    outcome: text('outcome', { enum: ['victory', 'defeat'] }),
    bonusOutcome: text('bonus_outcome', { enum: ['missed', 'won', 'lost'] }),
    /** Turnos resueltos. */
    turns: integer('turns').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (t) => [
    check('matches_status_check', sql`${t.status} in ('playing', 'finished', 'abandoned', 'interrupted')`),
    check('matches_difficulty_check', sql`${t.difficulty} in ('classic', 'storm')`),
    // Para encontrar al arrancar las que dejó vivas un reinicio (R-54).
    index('matches_status_idx').on(t.status),
  ],
);

/** Cómo salió una persona de una partida: la terminó, la abandonó (R-39) o el servidor se reinició (R-54). */
export const MATCH_EXITS = ['finished', 'abandoned', 'interrupted'] as const;
/** El aviso que la persona verá una sola vez sobre "Jugar en línea". */
export const MATCH_NOTICES = ['left_behind', 'restart'] as const;

/**
 * Quién jugó qué ninja. El bot no tiene cuenta, y el lugar de una cuenta borrada queda anónimo, igual
 * que el suyo (D-56): en los dos casos `user_id` va vacío.
 */
export const matchPlayers = pgTable(
  'match_players',
  {
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    /** El ninja: hay un asiento por elemento (R-33). */
    seat: text('seat', { enum: CAMINO_ELEMENTS }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    /**
     * Las rondas que la persona tiene por cobrar: las que el equipo superó con ella conectada (D-48). Se
     * acreditan al terminar la partida o si el servidor se reinicia, y se pierden si abandona (D-93).
     */
    rounds: text('rounds').array().notNull().default(sql`'{}'::text[]`),
    /** Vacío mientras la persona sigue en la partida. */
    exit: text('exit', { enum: MATCH_EXITS }),
    notice: text('notice', { enum: MATCH_NOTICES }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp('left_at', { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.matchId, t.seat] }),
    check('match_players_seat_check', sql`${t.seat} in ('fire', 'water', 'snow')`),
    check('match_players_exit_check', sql`${t.exit} in ('finished', 'abandoned', 'interrupted')`),
    check('match_players_notice_check', sql`${t.notice} in ('left_behind', 'restart')`),
    index('match_players_user_id_idx').on(t.userId),
  ],
);

/**
 * El avance de cada persona en cada logro (R-55): las veces que repitió su hazaña, entre todas sus partidas
 * en línea, y desde cuándo lo tiene completo. El avance no pasa de la meta del logro, que está en
 * `balance.json`. Con los 12 completos, las monedas se duplican (R-29): el servidor lo decide contando las
 * filas completas, nunca lo recibe del cliente. Solo lo ve su dueño, y se borra con la cuenta.
 */
export const achievements = pgTable(
  'achievements',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** El id del logro en `packages/core` (por ejemplo, `reviver`). */
    achievementId: text('achievement_id').notNull(),
    /** Las veces que lleva contadas. */
    progress: integer('progress').notNull().default(0),
    /** Cuándo llegó a la meta. Vacío mientras le falta. */
    unlockedAt: timestamp('unlocked_at', { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.achievementId] }),
    check('achievements_progress_check', sql`${t.progress} >= 0`),
  ],
);

/**
 * Estadísticas privadas de cada persona, por dificultad (R-42). En la Beta, las básicas (D-86): partidas
 * jugadas, rondas superadas y victorias. Solo las ve su dueño.
 */
export const playerStats = pgTable(
  'player_stats',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    difficulty: text('difficulty', { enum: MATCH_DIFFICULTIES }).notNull(),
    matches: integer('matches').notNull().default(0),
    rounds: integer('rounds').notNull().default(0),
    wins: integer('wins').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.difficulty] }),
    check('player_stats_difficulty_check', sql`${t.difficulty} in ('classic', 'storm')`),
    check('player_stats_counts_check', sql`${t.matches} >= 0 and ${t.rounds} >= 0 and ${t.wins} >= 0`),
  ],
);

/**
 * Libro de monedas: un renglón por cada movimiento del saldo, que es siempre la suma del libro.
 * - Un cobro de ronda (R-29) es positivo y lleva la partida y la ronda. Su restricción única hace que
 *   una ronda no se pague dos veces, aunque el cobro llegue repetido tras un reintento o un reinicio.
 *   Las monedas de una partida se acreditan cuando termina (D-93).
 * - Una compra de caja (R-28, D-66) es negativa y lleva el identificador que generó el cliente y las
 *   cartas que salieron. Su restricción única hace que un reintento con el mismo identificador no
 *   cobre de nuevo: se devuelve el resultado guardado aquí.
 */
export const coinLedger = pgTable(
  'coin_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.userId, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    matchId: uuid('match_id').references(() => matches.id),
    round: text('round', { enum: LEDGER_ROUNDS }),
    purchaseId: uuid('purchase_id'),
    /** Las cartas que salieron de la caja, en orden. */
    cards: text('cards').array(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('coin_ledger_user_match_round_key').on(t.userId, t.matchId, t.round),
    unique('coin_ledger_user_purchase_key').on(t.userId, t.purchaseId),
    check('coin_ledger_round_check', sql`${t.round} in ('1', '2', '3', 'bonus')`),
    // Cada renglón es un cobro de ronda o una compra, nunca las dos cosas ni ninguna.
    check(
      'coin_ledger_kind_check',
      sql`(${t.matchId} is not null and ${t.round} is not null and ${t.purchaseId} is null and ${t.cards} is null and ${t.amount} > 0) or (${t.purchaseId} is not null and ${t.cards} is not null and ${t.matchId} is null and ${t.round} is null and ${t.amount} < 0)`,
    ),
  ],
);

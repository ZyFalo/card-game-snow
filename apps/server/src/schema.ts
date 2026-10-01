import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

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

/**
 * Libro de monedas (R-29, D-31): un renglón por cada ronda cobrada. La restricción única hace que una
 * ronda no se pague dos veces, aunque el cobro llegue repetido tras una reconexión o un reinicio.
 * `match_id` apuntará a `matches` cuando existan las partidas en línea (M8).
 */
export const coinLedger = pgTable(
  'coin_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.userId, { onDelete: 'cascade' }),
    matchId: uuid('match_id').notNull(),
    round: text('round', { enum: LEDGER_ROUNDS }).notNull(),
    amount: integer('amount').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('coin_ledger_user_match_round_key').on(t.userId, t.matchId, t.round),
    check('coin_ledger_round_check', sql`${t.round} in ('1', '2', '3', 'bonus')`),
    check('coin_ledger_amount_check', sql`${t.amount} > 0`),
  ],
);

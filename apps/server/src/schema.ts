import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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

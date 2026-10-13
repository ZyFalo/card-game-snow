import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';

/*
 * Utilidades de las e2e de cuentas y de progreso, contra el servidor de verdad. Los correos no se
 * envían: el servidor de pruebas los guarda en una carpeta y de ahí se leen los códigos. El script de
 * Turnstile se reemplaza por uno falso, así las pruebas no dependen de Cloudflare.
 */

export const OUTBOX = fileURLToPath(new URL('../.e2e-outbox', import.meta.url));

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/**
 * Un correo de la carpeta, o `null` si todavía no se puede leer. El servidor lo escribe desde otro proceso,
 * y por un instante el archivo existe vacío: quien busca su correo lo salta, y lo lee en el intento siguiente.
 */
function readMail(file: string): Mail | null {
  try {
    return JSON.parse(readFileSync(`${OUTBOX}/${file}`, 'utf8')) as Mail;
  } catch {
    return null;
  }
}

/** El último correo a `to` cuyo asunto contenga `subject`; espera a que llegue. */
export async function lastMail(to: string, subject: RegExp): Promise<Mail> {
  let found: Mail | undefined;
  await expect
    .poll(
      () => {
        const files = (() => {
          try {
            return readdirSync(OUTBOX).sort();
          } catch {
            return [];
          }
        })();
        found = files
          .map(readMail)
          .filter((m): m is Mail => m !== null && m.to === to && subject.test(m.subject))
          .at(-1);
        return found !== undefined;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  return found as Mail;
}

export const codeOf = (mail: Mail) => mail.text.match(/^(\d{6})$/m)?.[1] ?? '';

export async function stubTurnstile(page: Page) {
  await page.route('https://challenges.cloudflare.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: "window.turnstile = { render(el, o) { setTimeout(() => o.callback('XXXX.DUMMY.TOKEN.XXXX'), 50); return 'w'; }, remove() {} };",
    }),
  );
}

/**
 * Letras para los nombres al azar. Sin vocales, sin dígitos y sin las letras de las siglas que el filtro
 * de nombres rechaza: seis de estas nunca forman un nombre prohibido.
 */
const NAME_LETTERS = 'bfgjnqrvwxz';

/**
 * Una persona nueva. Su correo y su nombre llevan azar, y no solo la hora: dos archivos de pruebas crean
 * cuentas a la vez, cada uno en su proceso, y con la hora sola podían pedir el mismo correo.
 */
export function person() {
  const tag = [...randomBytes(6)].map((b) => NAME_LETTERS[b % NAME_LETTERS.length]).join('');
  return {
    email: `e2e.${Date.now().toString(36)}.${tag}@example.com`,
    displayName: `Prueba ${tag}`,
    password: 'Tundra7#Oso',
  };
}

export type Camino = 'Fuego' | 'Agua' | 'Nieve';

/** En "Elige tu camino": marca la carta de ese elemento y confirma la elección (R-30). */
export async function chooseCamino(page: Page, camino: Camino) {
  await page.getByRole('button', { name: new RegExp(`Camino (del|de la) ${camino}`), pressed: false }).click();
  await page.getByRole('button', { name: new RegExp(`^Elegir el Camino (del|de la) ${camino}$`) }).click();
}

/**
 * Registro y verificación por la interfaz. Al verificar, la cuenta llega a elegir su camino (R-30):
 * con `camino` lo elige; sin él, lo deja para después. Termina con la sesión abierta en "Mi cuenta".
 */
export async function signUp(page: Page, who = person(), camino?: Camino) {
  await stubTurnstile(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByRole('button', { name: 'Crear una cuenta' }).click();
  await page.getByLabel('Correo', { exact: true }).fill(who.email);
  await page.getByLabel('Nombre visible', { exact: true }).fill(who.displayName);
  await page.getByLabel('Contraseña', { exact: true }).fill(who.password);
  await page.getByRole('checkbox').check();
  await expect(page.getByRole('button', { name: 'Crear cuenta' })).toBeEnabled();
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('heading', { name: 'Verifica tu correo' })).toBeVisible();
  const code = codeOf(await lastMail(who.email, /Tu código para Ventisca/));
  await page.getByLabel('Código de 6 dígitos').fill(code);
  await page.getByRole('button', { name: 'Verificar' }).click();
  await expect(page.getByRole('heading', { name: 'Elige tu camino' })).toBeVisible();
  if (camino) await chooseCamino(page, camino);
  else await page.getByRole('button', { name: 'Volver' }).click();
  await expect(page.getByRole('heading', { name: `Hola, ${who.displayName}` })).toBeVisible();
  return who;
}

export async function logIn(page: Page, email: string, password: string) {
  await page.getByLabel('Correo', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  // En la pantalla de cuenta, "Entrar" es el botón que envía el formulario, abajo a la derecha.
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}

const SERVER = fileURLToPath(new URL('../../server', import.meta.url));

/**
 * Le paga `matches` partidas completas (420 monedas cada una) a una cuenta de la base de las e2e: así las
 * pruebas de la tienda no tienen que jugar partidas enteras para tener monedas.
 */
export function giveCoins(email: string, matches = 1): void {
  execFileSync(`${SERVER}/node_modules/.bin/tsx`, [`${SERVER}/test/support/e2e-coins.ts`, email, String(matches)], {
    stdio: 'pipe',
  });
}

/**
 * Deja el avance de los logros de una cuenta de la base de las e2e como la prueba lo necesita, en la tabla
 * donde el servidor lo cuenta: así una prueba del doble de monedas (R-29) no tiene que completar el amuleto
 * jugando. `progress` dice lo que lleva contado cada logro, por su id; con `all`, los que no se nombran
 * quedan completos. Lo que llega a su meta queda completo.
 */
export function giveAchievements(
  email: string,
  progress: { all?: boolean } & Record<string, number | boolean | undefined> = { all: true },
): void {
  const args = [`${SERVER}/test/support/e2e-achievements.ts`, email, JSON.stringify(progress)];
  execFileSync(`${SERVER}/node_modules/.bin/tsx`, args, { stdio: 'pipe' });
}

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { startMatch, type TestWindow } from './helpers';

/*
 * Cuentas en el cliente, contra el servidor de verdad (PRD de v2, R-43 a R-50). Los correos no se envían:
 * el servidor de pruebas los guarda en una carpeta y de ahí se leen los códigos. El script de Turnstile
 * se reemplaza por uno falso, así las pruebas no dependen de Cloudflare.
 */

const OUTBOX = fileURLToPath(new URL('../.e2e-outbox', import.meta.url));

interface Mail {
  to: string;
  subject: string;
  text: string;
}

/** El último correo a `to` cuyo asunto contenga `subject`; espera a que llegue. */
async function lastMail(to: string, subject: RegExp): Promise<Mail> {
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
          .map((f) => JSON.parse(readFileSync(`${OUTBOX}/${f}`, 'utf8')) as Mail)
          .filter((m) => m.to === to && subject.test(m.subject))
          .at(-1);
        return found !== undefined;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  return found as Mail;
}

const codeOf = (mail: Mail) => mail.text.match(/^(\d{6})$/m)?.[1] ?? '';

async function stubTurnstile(page: Page) {
  await page.route('https://challenges.cloudflare.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: "window.turnstile = { render(el, o) { setTimeout(() => o.callback('XXXX.DUMMY.TOKEN.XXXX'), 50); return 'w'; }, remove() {} };",
    }),
  );
}

let n = 0;
function person() {
  n += 1;
  const id = `${Date.now().toString(36)}${n}`;
  return { email: `e2e.${id}@example.com`, displayName: `Prueba ${id.slice(-6)}`, password: 'Tundra7#Oso' };
}

/** Registro y verificación por la interfaz; termina con la sesión abierta en "Mi cuenta". */
async function signUp(page: Page, who = person()) {
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
  await expect(page.getByRole('heading', { name: `Hola, ${who.displayName}` })).toBeVisible();
  return who;
}

async function logIn(page: Page, email: string, password: string) {
  await page.getByLabel('Correo', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.locator('form').getByRole('button', { name: 'Entrar' }).click();
}

test('R-44: registro, verificación con el código del correo, y la sesión sigue al recargar', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const apiUrls: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/')) apiUrls.push(r.url());
  });
  const who = await signUp(page);
  await page.reload();
  await page.getByRole('button', { name: 'Mi cuenta' }).click();
  await expect(page.getByRole('heading', { name: `Hola, ${who.displayName}` })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await logIn(page, who.email, who.password);
  await expect(page.getByRole('heading', { name: `Hola, ${who.displayName}` })).toBeVisible();
  expect(errors).toEqual([]);
  // Correo, contraseña y código viajan en el cuerpo, nunca en la URL: los registros del servidor la guardan.
  expect(apiUrls.length).toBeGreaterThan(5);
  for (const url of apiUrls) {
    const { pathname, search } = new URL(url);
    expect(search).toBe('');
    expect(pathname).toMatch(/^\/api\/(config|auth\/[a-z/]+)$/);
  }
});

test('los errores del servidor llegan como mensajes claros', async ({ page }) => {
  await stubTurnstile(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await logIn(page, 'nadie@example.com', 'Tundra7#Oso');
  await expect(page.getByRole('alert')).toHaveText('Correo o contraseña incorrectos.');
  await page.getByRole('button', { name: 'Crear una cuenta' }).click();
  const who = person();
  await page.getByLabel('Correo', { exact: true }).fill(who.email);
  await page.getByLabel('Nombre visible', { exact: true }).fill(who.displayName);
  await page.getByLabel('Contraseña', { exact: true }).fill('Tundra7Oso');
  await page.getByRole('checkbox').check();
  await expect(page.getByRole('button', { name: 'Crear cuenta' })).toBeEnabled();
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('alert')).toHaveText('Agrega al menos un símbolo, como # o !.');
});

test('R-46: recuperar la contraseña con el código del correo', async ({ page }) => {
  const who = await signUp(page);
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByRole('button', { name: 'Olvidé mi contraseña' }).click();
  await page.getByLabel('Correo', { exact: true }).fill(who.email);
  await page.getByRole('button', { name: 'Enviar código' }).click();
  const code = codeOf(await lastMail(who.email, /recuperar tu contraseña/));
  await page.getByLabel('Código de 6 dígitos').fill(code);
  await page.getByLabel('Contraseña nueva', { exact: true }).fill('Glaciar8$Nuevo');
  await page.getByLabel('Repite la contraseña nueva', { exact: true }).fill('Glaciar8$Nuevo');
  await page.getByRole('button', { name: 'Cambiar la contraseña' }).click();
  await expect(page.getByRole('heading', { name: `Hola, ${who.displayName}` })).toBeVisible();
});

test('R-48 y R-50: cambiar el correo, y deshacerlo desde el correo anterior', async ({ page }) => {
  const who = await signUp(page);
  const newEmail = `nuevo.${who.email}`;
  await page.getByRole('button', { name: 'Cambiar el correo' }).click();
  await page.getByLabel('Correo nuevo', { exact: true }).fill(newEmail);
  await page.getByLabel('Contraseña actual', { exact: true }).fill(who.password);
  await page.getByRole('button', { name: 'Enviar' }).click();
  const code = codeOf(await lastMail(newEmail, /Confirma tu correo nuevo/));
  await page.getByLabel('Código de 6 dígitos').fill(code);
  await page.getByRole('button', { name: 'Confirmar el correo nuevo' }).click();
  await expect(page.getByRole('status')).toHaveText(`Listo: tu correo ahora es ${newEmail}.`);

  // Quien tenía el correo anterior deshace el cambio, sin sesión.
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByRole('button', { name: 'Deshacer un cambio de correo' }).click();
  const revert = codeOf(await lastMail(who.email, /El correo de tu cuenta de Ventisca cambió/));
  await page.getByLabel('Correo anterior', { exact: true }).fill(who.email);
  await page.getByLabel('Código de 6 dígitos').fill(revert);
  await page.getByLabel('Contraseña nueva', { exact: true }).fill('Glaciar8$Nuevo');
  await page.getByLabel('Repite la contraseña nueva', { exact: true }).fill('Glaciar8$Nuevo');
  await page.getByRole('button', { name: 'Deshacer el cambio' }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Listo: tu cuenta volvió a su correo anterior. Entra con tu contraseña nueva.',
  );
  await logIn(page, who.email, 'Glaciar8$Nuevo');
  await expect(page.getByRole('heading', { name: `Hola, ${who.displayName}` })).toBeVisible();
});

test('R-49: borrar la cuenta con la contraseña', async ({ page }) => {
  const who = await signUp(page);
  await page.getByRole('button', { name: 'Borrar la cuenta' }).click();
  await page.getByLabel('Contraseña actual', { exact: true }).fill(who.password);
  await page.getByRole('button', { name: 'Borrar mi cuenta' }).click();
  await expect(page.getByRole('status')).toHaveText('Tu cuenta se borró.');
  await logIn(page, who.email, who.password);
  await expect(page.getByRole('alert')).toHaveText('Correo o contraseña incorrectos.');
});

test('Turnstile solo se carga en el registro', async ({ page }) => {
  await stubTurnstile(page);
  const cloudflare: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('challenges.cloudflare.com')) cloudflare.push(r.url());
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
  expect(cloudflare).toEqual([]);
  await page.getByRole('button', { name: 'Crear una cuenta' }).click();
  await expect(page.getByRole('button', { name: 'Crear cuenta' })).toBeEnabled();
  expect(cloudflare).toHaveLength(1);
});

test('el aviso de privacidad se lee desde la portada y desde el registro', async ({ page }) => {
  await stubTurnstile(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Aviso de privacidad' }).click();
  await expect(page.getByRole('heading', { name: 'Aviso de privacidad de Ventisca' })).toBeVisible();
  await expect(page.getByText('williamandres1603@gmail.com').first()).toBeVisible();
  await page.getByRole('button', { name: 'Volver' }).click();
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByRole('button', { name: 'Crear una cuenta' }).click();
  await page.getByRole('button', { name: 'aviso de privacidad' }).click();
  await expect(page.getByRole('dialog', { name: 'Aviso de privacidad de Ventisca' })).toBeVisible();
});

test('los resultados del sandbox invitan a crear una cuenta', async ({ page }) => {
  await startMatch(page);
  await page.evaluate(() => {
    const st = (window as unknown as TestWindow).__ventisca as unknown as {
      getState(): { match: unknown };
      setState(p: object): void;
    };
    st.setState({ screen: 'results', phase: 'ended', results: { state: st.getState().match } });
  });
  await page.getByRole('button', { name: 'Crear una cuenta' }).click();
  await expect(page.getByRole('heading', { name: 'Crear una cuenta' })).toBeVisible();
});

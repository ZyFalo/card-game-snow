import { expect, test } from '@playwright/test';
import { codeOf, lastMail, logIn, person, signUp, stubTurnstile } from './account-helpers';
import { clippedElements, FULL_TRACE, startMatch, type TestWindow } from './helpers';

/* Cuentas en el cliente, contra el servidor de verdad (PRD de v2, R-43 a R-50). */

test.use(FULL_TRACE);

test('R-44: registro, verificación con el código del correo, y la sesión sigue al recargar', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const apiUrls: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/')) apiUrls.push(r.url());
  });
  const who = await signUp(page, person(), 'Fuego');
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
    expect(pathname).toMatch(/^\/api\/(config|progress(\/[a-z]+)?|auth\/[a-z/]+)$/);
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
  const who = await signUp(page, person(), 'Agua');
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByRole('button', { name: '¿Olvidaste tu contraseña?' }).click();
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
  const who = await signUp(page, person(), 'Nieve');
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
  // D-75: Ventisca es el piloto de un proyecto personal, y el aviso dice que hoy el juego es gratuito.
  await expect(page.getByText('Vigente desde el 6 de octubre de 2026')).toBeVisible();
  await expect(
    page.getByText(
      'Ventisca es el piloto de un proyecto personal, que su responsable, William Andrés Peña Vargas, avanza en sus ratos libres. Hoy el juego es gratuito: no vende nada ni muestra publicidad. Para cualquier tema de este aviso, escribe a ventisca@wpena.dev.',
    ),
  ).toBeVisible();
  await expect(page.getByText(/proyecto de clase|sin fines comerciales/)).toHaveCount(0);
  // El contacto es la dirección del proyecto, que Cloudflare reenvía al responsable.
  await expect(page.getByText(/ventisca@wpena\.dev/)).toHaveCount(3);
  await expect(page.getByText(/@gmail\.com/)).toHaveCount(0);
  await expect(
    page.getByText(
      'Cloudflare recibe los mensajes que escribes a ventisca@wpena.dev y los reenvía al buzón del responsable. Según Cloudflare, no lee ni guarda su contenido. Su panel muestra al responsable quién escribió y cuándo, durante un tiempo que Cloudflare no publica.',
    ),
  ).toBeVisible();
  // R-50: el código para deshacer un cambio de correo vale 7 días, no 15 minutos como los demás.
  await expect(
    page.getByText(
      'Mientras tengas la cuenta. Las sesiones vencen a los 30 días, y los códigos que enviamos por correo, a los 15 minutos, salvo el que sirve para deshacer un cambio de correo, que vale 7 días.',
    ),
  ).toBeVisible();
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
  // Guardar el progreso ya existe y va en presente; jugar en línea todavía no, y va en futuro.
  await expect(
    page.getByText('¿Te gustó? Crea una cuenta: guarda tu progreso y pronto podrás jugar en línea.'),
  ).toBeVisible();
  // Lineamientos: un solo primario por vista ("Jugar otra vez"), y el botón de la invitación en una línea.
  await expect(page.locator('.results-screen .btn-primary')).toHaveText(['Jugar otra vez']);
  const invite = page.getByRole('button', { name: 'Crear una cuenta' });
  expect((await invite.boundingBox())?.height ?? 0).toBeLessThan(50);
  await invite.click();
  await expect(page.getByRole('heading', { name: 'Crear una cuenta' })).toBeVisible();
});

test('lineamientos de diseño, sección 8: ninguna pantalla de cuenta corta texto', async ({ page }) => {
  const clipped: Record<string, string[]> = {};
  const check = async (name: string) => {
    await page.waitForTimeout(700); // las entradas escalonadas
    const found = await clippedElements(page);
    if (found.length) clipped[name] = found;
  };
  // Un correo largo pone a prueba los textos que lo repiten.
  const who = { ...person(), email: `nieve.con.un.correo.bastante.largo.${Date.now().toString(36)}@example.com` };
  await stubTurnstile(page);
  await page.goto('/?speed=0.2');
  await page.getByRole('button', { name: 'Aviso de privacidad' }).click();
  await check('aviso');
  await page.getByRole('button', { name: 'Volver' }).click();
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await check('entrar');
  await logIn(page, who.email, who.password);
  await expect(page.getByRole('alert')).toBeVisible();
  await check('entrar con error');
  await page.getByRole('button', { name: '¿Olvidaste tu contraseña?' }).click();
  await check('recuperar');
  await page.getByLabel('Correo', { exact: true }).fill(who.email);
  await page.getByRole('button', { name: 'Enviar código' }).click();
  await expect(page.getByLabel('Código de 6 dígitos')).toBeVisible();
  await check('recuperar con el código');
  await page.getByRole('button', { name: 'Volver' }).click();
  await page.getByRole('button', { name: 'Deshacer un cambio de correo' }).click();
  await check('deshacer un cambio de correo');
  await page.getByRole('button', { name: 'Volver' }).click();
  await page.getByRole('button', { name: 'Crear una cuenta' }).click();
  await check('crear cuenta');
  await page.getByRole('button', { name: 'aviso de privacidad' }).click();
  await check('aviso desde el registro');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('Correo', { exact: true }).fill(who.email);
  await page.getByLabel('Nombre visible', { exact: true }).fill(who.displayName);
  await page.getByLabel('Contraseña', { exact: true }).fill('Tundra7Oso');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await check('crear cuenta con error');
  await page.getByLabel('Contraseña', { exact: true }).fill(who.password);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('heading', { name: 'Verifica tu correo' })).toBeVisible();
  await check('verificar');
  await page.getByLabel('Código de 6 dígitos').fill(codeOf(await lastMail(who.email, /Tu código para Ventisca/)));
  await page.getByRole('button', { name: 'Verificar' }).click();
  // Elegir el camino y las demás pantallas del progreso tienen su recorrido en progress.spec.ts.
  await expect(page.getByRole('heading', { name: 'Elige tu camino' })).toBeVisible();
  await page.getByRole('button', { name: 'Volver' }).click();
  await expect(page.getByRole('heading', { name: `Hola, ${who.displayName}` })).toBeVisible();
  await check('perfil');
  for (const section of ['Cambiar la contraseña', 'Cambiar el correo', 'Borrar la cuenta']) {
    await page.getByRole('button', { name: section }).click();
    await check(`perfil: ${section}`);
  }
  expect(clipped).toEqual({});
});

test('el beneficio que todavía no existe dice "Próximamente", y el perfil no los muestra', async ({ page }) => {
  // El progreso y la colección ya existen; el juego en línea llega con el M8.
  const benefits = [
    /^Tu progreso queda guardado$/,
    /^Juega en línea con amigos\s+Próximamente$/,
    /^Tu colección de cartas$/,
  ];
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('listitem')).toHaveText(benefits);
  // La introducción de "Entrar" dice lo mismo: el progreso en presente y el juego en línea en futuro.
  await expect(page.getByText('Con tu cuenta guardas tu progreso. Pronto podrás jugar en línea.')).toBeVisible();
  await page.getByRole('button', { name: 'Crear una cuenta' }).click();
  await expect(page.getByRole('listitem')).toHaveText(benefits);
  // En el perfil no van: esa columna es el resumen del progreso.
  await signUp(page);
  await expect(page.getByRole('listitem')).toHaveCount(0);
  await expect(page.getByText('Próximamente')).toHaveCount(0);
});

import { type BrowserContext, expect, type Locator, type Page, test } from '@playwright/test';
import { clippedElements, smallText } from './helpers';

/*
 * La portada dice qué es el proyecto (D-75) y lleva a los créditos, donde Ventisca reconoce su inspiración
 * (D-76). Tres vínculos discretos llevan al portafolio de quien lo hace (D-108): su nombre en el pie, su
 * sello en la esquina de enfrente y la última línea de los créditos.
 */

const PORTFOLIO = 'https://wpena.dev';
const SEAL = 'Portafolio de William Peña en wpena.dev, se abre en otra pestaña';

test('el pie de la portada lleva a los créditos y al aviso de privacidad', async ({ page }) => {
  await page.goto('/');
  const foot = page.locator('.title-foot');
  await expect(foot).toHaveText(
    /^Piloto de un proyecto personal de William Peña\s*·\s*Créditos\s*·\s*Aviso de privacidad$/,
  );
  await foot.getByRole('button', { name: 'Créditos' }).click();
  await expect(page.getByRole('heading', { name: 'Créditos' })).toBeVisible();
  // El texto corto de CREDITOS.md, tal cual.
  await expect(
    page.getByText(
      'Ventisca es un homenaje a Card-Jitsu Nieve, de la saga Card-Jitsu de Club Penguin. De ahí viene la idea; los personajes, el arte, la música, los sonidos y el código son propios.',
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Club Penguin y Card-Jitsu son marcas de Disney, y Ventisca no está afiliado ni respaldado por Disney.',
    ),
  ).toBeVisible();
  await expect(page.getByText('Gracias al equipo de Club Penguin y a su comunidad.')).toBeVisible();
  // La frase que estaba en el pie de la portada vive ahora aquí, y después de ella, la de quien hace Ventisca.
  const lines = page.locator('.reading p');
  await expect(lines).toHaveCount(5);
  await expect(lines.nth(3)).toHaveText('Arte, sonido y música generados en código.');
  await expect(lines.nth(4)).toHaveText('Hecho por William Peña. Conoce sus otros proyectos en wpena.dev');

  await page.getByRole('button', { name: 'Volver' }).click();
  await expect(page.getByRole('heading', { name: 'Ventisca' })).toBeVisible();
  await expect(page.getByText(/generados en código/)).toHaveCount(0);
  await foot.getByRole('button', { name: 'Aviso de privacidad' }).click();
  await expect(page.getByRole('heading', { name: 'Aviso de privacidad de Ventisca' })).toBeVisible();
});

/** El contraste entre dos colores de CSS (`rgb(…)`), como lo mide la WCAG: de 1 a 21. */
const contrast = (page: Page, a: string, b: string) =>
  page.evaluate(
    ({ a, b }) => {
      const luminance = (color: string) => {
        const [r, g, bl] = (color.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
        const lin = (c: number) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
        return 0.2126 * lin(r ?? 0) + 0.7152 * lin(g ?? 0) + 0.0722 * lin(bl ?? 0);
      };
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
    },
    { a, b },
  );

test('el pie de la portada se lee: su tinta, la de los subtítulos, pasa de 4,5 a 1 sobre el papel', async ({
  page,
}) => {
  await page.goto('/');
  const foot = page.locator('.title-foot');
  await expect(foot).toBeVisible();
  const colors = await page.evaluate(() => {
    const probe = document.createElement('i');
    document.body.append(probe);
    const token = (name: string) => {
      probe.style.color = `var(${name})`;
      return getComputedStyle(probe).color;
    };
    const tokens = { paper: token('--paper'), ink2: token('--ink-2') };
    probe.remove();
    const foot = document.querySelector('.title-foot') as HTMLElement;
    return {
      ...tokens,
      foot: getComputedStyle(foot).color,
      links: [...foot.querySelectorAll('.link')].map((el) => getComputedStyle(el).color),
      subtitle: getComputedStyle(document.querySelector('.title-tagline') as HTMLElement).color,
    };
  });
  // La tinta tenue de la paleta: la del lema de la portada y la de los subtítulos.
  expect(colors.foot).toBe(colors.ink2);
  expect(colors.subtitle).toBe(colors.ink2);
  // Los vínculos del pie llevan la misma tinta que su frase.
  expect(colors.links.length).toBeGreaterThanOrEqual(3);
  for (const link of colors.links) expect(link).toBe(colors.foot);
  expect(await contrast(page, colors.foot, colors.paper)).toBeGreaterThanOrEqual(4.5);
});

test('lineamientos de diseño, sección 8: la prueba de desbordes marca lo que se corta o se sale de una caja que se ve, no lo que solo pasa el ancho de una caja invisible', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Ventisca' })).toBeVisible();
  // La portada de verdad: el nombre del juego pasa el ancho de su bloque, pero se ve entero.
  expect(await clippedElements(page)).toEqual([]);
  await page.evaluate(() => {
    const screen = document.querySelector('.screen') as HTMLElement;
    const add = (tag: string, text: string, style: string) => {
      const el = document.createElement(tag);
      el.textContent = text;
      el.setAttribute('style', `position:absolute;width:60px;white-space:nowrap;${style}`);
      screen.append(el);
    };
    add('p', 'Texto cortado por su caja', 'left:0;top:0;margin:0;overflow:hidden');
    add('button', 'Texto que se sale del botón', 'left:0;top:40px;border:2px solid black');
    add('div', 'Texto que pasa una caja invisible', 'left:0;top:80px');
    add('div', 'Texto cortado por el borde de la pantalla', 'right:0;top:120px');
  });
  const found = await clippedElements(page);
  // La pantalla esconde lo que pasa su borde, así que también la marca, además del texto que corta.
  const screen = found.filter((line) => line.startsWith('div.screen'));
  expect(screen).toHaveLength(1);
  expect(
    found
      .filter((line) => !screen.includes(line))
      .map((line) => line.split(': ').at(-1))
      .sort(),
  ).toEqual(['Texto cortado por el borde de la pantalla', 'Texto cortado por su caja', 'Texto que se sale del botón']);
});

test('lineamientos de diseño, sección 8: la pantalla de créditos no corta texto ni lo achica', async ({ page }) => {
  await page.goto('/?speed=0.2');
  await page.getByRole('button', { name: 'Créditos' }).click();
  await expect(page.getByRole('heading', { name: 'Créditos' })).toBeVisible();
  await page.waitForTimeout(700); // las entradas escalonadas
  expect(await clippedElements(page)).toEqual([]);
  expect(await smallText(page)).toEqual([]);
  // Una sola acción, abajo a la derecha, y no es primaria: volver.
  await expect(page.locator('.screen-actions .btn')).toHaveText(['Volver']);
  await expect(page.locator('.screen .btn-primary')).toHaveCount(0);
});

test('sin servidor no hay cuentas ni aviso de privacidad, pero los créditos siguen en la portada', async ({ page }) => {
  // Así queda el juego de un solo archivo, que se abre sin servidor.
  await page.route('**/api/**', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Jugar sin cuenta', exact: true })).toBeVisible();
  await expect(page.locator('.title-foot')).toHaveText(
    /^Piloto de un proyecto personal de William Peña\s*·\s*Créditos$/,
  );
  // El sello va dentro del propio juego: en un solo archivo no hay de dónde pedirlo.
  await expect(page.getByRole('link', { name: SEAL }).locator('img')).toHaveJSProperty('complete', true);
  await page.getByRole('button', { name: 'Créditos' }).click();
  await expect(page.getByRole('heading', { name: 'Créditos' })).toBeVisible();
});

/* ---------- Los vínculos al portafolio (D-108) ---------- */

/** El portafolio no es del juego: en las pruebas responde una página en blanco, y se anota qué se le pidió. */
async function fakePortfolio(context: BrowserContext) {
  const asked: { url: string; referer: string | undefined }[] = [];
  await context.route(`${PORTFOLIO}/**`, async (route) => {
    asked.push({ url: route.request().url(), referer: (await route.request().allHeaders()).referer });
    await route.fulfill({ contentType: 'text/html', body: '<title>Portafolio</title>' });
  });
  return asked;
}

/** Un vínculo al portafolio: a su dirección tal cual, en otra pestaña y sin darle acceso a esta. */
async function expectPortfolioLink(link: Locator) {
  await expect(link).toHaveAttribute('href', PORTFOLIO);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener');
}

/** Hace clic en un vínculo y devuelve la pestaña que se abrió, ya cargada. */
async function follow(page: Page, link: Locator) {
  const [tab] = await Promise.all([page.context().waitForEvent('page'), link.click()]);
  await tab.waitForLoadState();
  return tab;
}

test('D-108: los tres vínculos al portafolio se abren en otra pestaña, sin parámetros de seguimiento', async ({
  page,
  context,
}) => {
  const asked = await fakePortfolio(context);
  await page.goto('/');
  const name = page.locator('.title-foot').getByRole('link', { name: 'William Peña, se abre en otra pestaña' });
  const seal = page.getByRole('link', { name: SEAL, exact: true });
  await expect(name).toHaveText('William Peña');
  // Igual de discreto que "Créditos" y "Aviso de privacidad": la misma letra, el mismo color y el mismo subrayado.
  const look = (el: Locator) =>
    el.evaluate((node) => {
      const s = getComputedStyle(node);
      return [s.fontSize, s.fontWeight, s.color, s.textDecorationLine, s.textDecorationThickness, s.cursor].join(' ');
    });
  expect(await look(name)).toBe(await look(page.locator('.title-foot').getByRole('button', { name: 'Créditos' })));

  await page.getByRole('button', { name: 'Créditos' }).click();
  const site = page.getByRole('link', { name: 'wpena.dev, se abre en otra pestaña', exact: true });
  await expect(site).toHaveText('wpena.dev');
  await expectPortfolioLink(site);
  const fromCredits = await follow(page, site);
  await page.getByRole('button', { name: 'Volver' }).click();

  await expectPortfolioLink(name);
  await expectPortfolioLink(seal);
  const tabs = [fromCredits, await follow(page, name), await follow(page, seal)];
  for (const tab of tabs) {
    expect(tab.url()).toBe(`${PORTFOLIO}/`);
    // `noopener`: la pestaña del portafolio no puede tocar la del juego.
    expect(await tab.evaluate(() => window.opener)).toBeNull();
  }
  // Al portafolio le llega su dirección tal cual, sin nada más, y de dónde viene la visita: solo el sitio.
  const origin = new URL(page.url()).origin;
  expect(asked).toEqual(Array.from({ length: 3 }, () => ({ url: `${PORTFOLIO}/`, referer: `${origin}/` })));
  // El juego sigue donde estaba.
  await expect(page.getByRole('heading', { name: 'Ventisca' })).toBeVisible();
});

type Box = { left: number; top: number; right: number; bottom: number };

/** El sello, el texto del pie y el escenario, y lo que el sello tapa de la portada: nada. */
const sealLayout = (page: Page) =>
  page.evaluate(() => {
    const box = (el: Element | null): Box | null => {
      const r = el?.getBoundingClientRect();
      return r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null;
    };
    const seal = box(document.querySelector('.title-seal'));
    const covered: string[] = [];
    const others = '.title-foot > :not(.title-seal), .title-block > *, .title-actions > *, .title-ninjas img';
    for (const el of document.querySelectorAll(others)) {
      const b = box(el);
      if (!seal || !b) continue;
      if (seal.left < b.right && b.left < seal.right && seal.top < b.bottom && b.top < seal.bottom) {
        covered.push(`${el.tagName.toLowerCase()}.${el.className}: ${(el.textContent ?? '').trim().slice(0, 30)}`);
      }
    }
    return {
      seal,
      image: box(document.querySelector('.title-seal img')),
      text: box(document.querySelector('.title-foot > span')),
      stage: box(document.querySelector('.stage-frame')),
      covered,
    };
  });

/** Lo que el sello dice al pasar el ratón: el texto que sale a su izquierda, y si se ve. */
const sealHint = (seal: Locator) =>
  seal.evaluate((el) => {
    const s = getComputedStyle(el, '::after');
    return { text: s.content, visible: s.visibility === 'visible' && s.opacity === '1' };
  });

const mid = (b: Box | null) => ((b?.top ?? Number.NaN) + (b?.bottom ?? Number.NaN)) / 2;

test('D-108: el sello va en la esquina de enfrente, en la línea del pie, tal cual y sin tapar nada', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/?speed=0.2');
  const seal = page.getByRole('link', { name: SEAL, exact: true });
  await expect(seal).toBeVisible();
  await page.waitForTimeout(700); // las entradas escalonadas

  const { seal: box, text, stage, covered } = await sealLayout(page);
  if (!box || !text || !stage) throw new Error('faltan el sello, el texto del pie o el escenario');
  // A 28 px.
  expect(box.right - box.left).toBeCloseTo(28, 1);
  expect(box.bottom - box.top).toBeCloseTo(28, 1);
  // Contrapeso del texto: el mismo margen a cada lado, y centrado en su línea.
  expect(stage.right - box.right).toBeCloseTo(text.left - stage.left, 1);
  expect(mid(box)).toBeCloseTo(mid(text), 1);
  expect(box.bottom).toBeLessThan(stage.bottom);
  expect(covered).toEqual([]);

  // Es la marca de quien hace Ventisca: sin el contorno ni la sombra del juego.
  const image = seal.locator('img');
  const chrome = (el: Locator) =>
    el.evaluate((node) => {
      const s = getComputedStyle(node);
      return [s.borderTopWidth, s.boxShadow, s.filter, s.backgroundImage, s.backgroundColor].join(' | ');
    });
  expect(await chrome(image)).toBe('0px | none | none | none | rgba(0, 0, 0, 0)');
  expect(await chrome(seal)).toBe('0px | none | none | none | rgba(0, 0, 0, 0)');
  // Es un archivo del propio juego, incrustado: se ve y no se pide a ningún sitio.
  await expect(image).toHaveJSProperty('complete', true);
  expect(await image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  expect(await image.getAttribute('src')).toMatch(/^data:image\/svg\+xml[,;]/);
  // La imagen no trae nombre propio: lo que se oye es el del vínculo.
  await expect(image).toHaveAttribute('alt', '');
  const origin = new URL(page.url()).origin;
  expect(requests.filter((url) => !url.startsWith(`${origin}/`) && !url.startsWith('data:'))).toEqual([]);

  // Lineamientos de diseño, sección 8: la portada entera, sin texto cortado ni achicado.
  expect(await clippedElements(page)).toEqual([]);
  expect(await smallText(page)).toEqual([]);
});

test('D-108: al pasar el ratón, el sello dice a dónde lleva y sube 2 px', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ventisca:settings:v1', '{"reducedMotion":false,"version":2}'));
  await page.goto('/');
  const seal = page.getByRole('link', { name: SEAL, exact: true });
  await expect(seal).toBeVisible();
  expect(await sealHint(seal)).toEqual({ text: '"wpena.dev ↗"', visible: false });
  const before = await sealLayout(page);

  await seal.hover();
  await expect.poll(() => sealHint(seal)).toEqual({ text: '"wpena.dev ↗"', visible: true });
  // Sube la imagen; el vínculo no se mueve de debajo del ratón.
  await expect
    .poll(async () => ((await sealLayout(page)).image?.top ?? 0) - (before.image?.top ?? 0))
    .toBeCloseTo(-2, 1);
  const raised = await sealLayout(page);
  expect(raised.seal).toEqual(before.seal);
  expect(raised.image?.left).toBe(before.image?.left);
  // Con el texto a la vista, la portada sigue sin cortar nada.
  expect(await clippedElements(page)).toEqual([]);

  // Al quitar el ratón, vuelve a su lugar y el texto se apaga.
  await page.mouse.move(640, 360);
  await expect.poll(() => sealHint(seal)).toEqual({ text: '"wpena.dev ↗"', visible: false });
  await expect.poll(async () => (await sealLayout(page)).image?.top).toBe(before.image?.top);
});

test('D-108: con el teclado, el sello muestra el foco y a dónde lleva', async ({ page }) => {
  await page.goto('/');
  const seal = page.getByRole('link', { name: SEAL, exact: true });
  // Es lo último de la portada: después del texto del pie, como se lee.
  await page.getByRole('button', { name: 'Aviso de privacidad' }).focus();
  await page.keyboard.press('Tab');
  await expect(seal).toBeFocused();
  await expect.poll(() => sealHint(seal)).toEqual({ text: '"wpena.dev ↗"', visible: true });
  expect(await seal.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
});

test('D-108: con animaciones reducidas, el sello dice a dónde lleva y no sube', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ventisca:settings:v1', '{"reducedMotion":true,"version":2}'));
  await page.goto('/');
  const seal = page.getByRole('link', { name: SEAL, exact: true });
  await expect(seal).toBeVisible();
  const before = await sealLayout(page);
  await seal.hover();
  // Sin transición: el texto ya está, y el sello sigue en su lugar.
  expect(await sealHint(seal)).toEqual({ text: '"wpena.dev ↗"', visible: true });
  await page.waitForTimeout(300);
  expect((await sealLayout(page)).image).toEqual(before.image);
});

test.describe('en teléfono', () => {
  for (const [name, viewport] of [
    ['vertical', { width: 390, height: 844 }],
    ['horizontal', { width: 844, height: 390 }],
  ] as const) {
    test(`D-108: el sello sigue en su esquina y no tapa nada, en ${name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/?speed=0.2');
      await expect(page.getByRole('link', { name: SEAL, exact: true })).toBeVisible();
      await page.waitForTimeout(700); // las entradas escalonadas
      const { seal, text, stage, covered } = await sealLayout(page);
      if (!seal || !text || !stage) throw new Error('faltan el sello, el texto del pie o el escenario');
      // La portada es el escenario a escala: el sello mide y se separa en la misma proporción. El marco
      // del escenario se redondea a píxeles enteros, así que los márgenes se comparan con medio píxel.
      const scale = (stage.right - stage.left) / 1280;
      expect(scale).toBeLessThan(1);
      expect(seal.right - seal.left).toBeCloseTo(28 * scale, 1);
      expect(stage.right - seal.right).toBeCloseTo(80 * scale, 0);
      expect(stage.right - seal.right).toBeCloseTo(text.left - stage.left, 0);
      expect(mid(seal)).toBeCloseTo(mid(text), 1);
      // Abajo a la derecha, dentro del escenario.
      expect(seal.left).toBeGreaterThan((stage.left + stage.right) / 2);
      expect(seal.top).toBeGreaterThan((stage.top + stage.bottom) / 2);
      expect(seal.bottom).toBeLessThan(stage.bottom);
      expect(covered).toEqual([]);
    });
  }
});

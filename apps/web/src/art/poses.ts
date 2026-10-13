import type { ElementKind } from '@ventisca/core';
import type { PartPose, Pose } from '../game/rig/Rig';
import { bodyParts, NINJA_H, NINJA_W, type NinjaPart, ninjaBody } from './ninjas';
import { PALETTE } from './palette';
import { ninjaRig } from './rigs';
import { svgDoc } from './svg';

/*
 * Los ninjas en pose, como imágenes SVG, para las pantallas que no son el tablero: la ficha, la búsqueda
 * de equipo, las salas y la carga. Usan el mismo esqueleto y las mismas poses que la escena del juego
 * (`art/rigs.ts` y `game/rig/clips.ts`): cada pieza gira alrededor de su articulación, dentro de su
 * pieza madre. Con dos poses, la figura va de una a otra en bucle, con una animación del propio SVG.
 */

/** El lienzo de una figura en pose: más grande que el de la figura de pie, porque los brazos se levantan. */
const PAD = { left: 26, right: 26, top: 34, bottom: 2 };
export const POSE_W = NINJA_W + PAD.left + PAD.right;
export const POSE_H = NINJA_H + PAD.top + PAD.bottom;
const VIEW = `${-PAD.left} ${-PAD.top} ${POSE_W} ${POSE_H}`;

const n = (value: number): string => String(Math.round(value * 100) / 100);

/** La transformación de una pieza, como la aplica el esqueleto: se mueve, gira y se estira en su articulación. */
const cssTransform = (p: PartPose): string =>
  `translate(${n(p.x ?? 0)}px,${n(p.y ?? 0)}px) rotate(${n(p.r ?? 0)}deg) scale(${n(p.sx ?? 1)},${n(p.sy ?? 1)})`;

/**
 * La figura con sus piezas anidadas, cada una con su clase. El estilo dice dónde está cada articulación y,
 * con dos poses, cómo va de una a otra.
 */
function posed(el: ElementKind, from: Pose, to: Pose | null, ms: number): string {
  const rig = ninjaRig(el);
  const parts = bodyParts(el);
  let css = '';
  const node = (name: string): string => {
    const [px, py] = name === 'root' ? rig.anchor : (rig.pivots[name] as readonly [number, number]);
    const inner = (rig.children[name] ?? ['self'])
      .map((child) => (child === 'self' ? parts[name as NinjaPart] : node(child)))
      .join('');
    const a = from[name] ?? {};
    const b = to?.[name];
    css += `.p-${name}{transform-box:view-box;transform-origin:${n(px)}px ${n(py)}px;transform:${cssTransform(a)}`;
    if (to) {
      css += `;animation:k-${name} ${ms}ms ease-in-out infinite alternate}`;
      css += `@keyframes k-${name}{to{transform:${cssTransform(b ?? {})}}}`;
    } else css += '}';
    return `<g class="p-${name}">${inner}</g>`;
  };
  const body = node('root');
  return `<style>${css}</style>${body}`;
}

/**
 * Un ninja en esa pose. Con `to`, va y vuelve entre las dos poses, cada tramo en `ms`: así respira, como
 * en el tablero. Sin `to`, queda quieto: es lo que se usa con las animaciones reducidas.
 */
export function ninjaPoseSvg(el: ElementKind, from: Pose, to: Pose | null = null, ms = 760, scale = 2): string {
  return svgDoc(POSE_W, POSE_H, posed(el, from, to, ms), scale, VIEW);
}

/** La pose de quien duerme de pie: la cabeza caída y los brazos sueltos. */
export const ASLEEP_POSE: Pose = {
  root: { sy: 0.97 },
  head: { r: 13, y: 3 },
  armFront: { r: 7 },
  armBack: { r: -7 },
  tails: { r: -16 },
};

/**
 * El ninja de quien se desconectó o salió de la partida (R-38): gris y dormido. Va en el lienzo de la
 * figura de pie, para ocupar su mismo lugar en la casilla.
 */
export function ninjaAsleepSvg(el: ElementKind, scale = 2): string {
  const gray = '<filter id="gris"><feColorMatrix type="saturate" values="0.08"/></filter>';
  const body = `<defs>${gray}</defs><g filter="url(#gris)" opacity="0.9">${posed(el, ASLEEP_POSE, null, 0)}</g>`;
  return svgDoc(NINJA_W, NINJA_H, body, scale);
}

/** El gris de lo que todavía no está: el mismo de `--ink-3` en la interfaz. */
const DOTTED = '#7A819C';

/** Un filtro que deja la figura de un solo color, con su forma. */
const flat = (id: string, color: string): string =>
  `<filter id="${id}" x="-10%" y="-10%" width="120%" height="120%"><feFlood flood-color="${color}"/>` +
  '<feComposite in2="SourceAlpha" operator="in"/></filter>';

/** La silueta de tinta de un ninja: el asiento que todavía no tiene a nadie, mientras se busca equipo. */
export function ninjaSilhouetteSvg(el: ElementKind, scale = 2): string {
  const body = `<defs>${flat('tinta', PALETTE.ink)}</defs><g filter="url(#tinta)">${ninjaBody(el)}</g>`;
  return svgDoc(POSE_W, POSE_H, body, scale, VIEW);
}

/**
 * La silueta punteada de un asiento libre en una sala: solo el contorno de la figura, a trazos. El filtro
 * se queda con la franja del borde, y la máscara la corta en trazos.
 */
export function ninjaDottedSvg(el: ElementKind, scale = 2): string {
  const defs =
    '<filter id="borde" x="-10%" y="-10%" width="120%" height="120%">' +
    '<feMorphology in="SourceAlpha" operator="dilate" radius="1" result="fuera"/>' +
    '<feMorphology in="SourceAlpha" operator="erode" radius="1.6" result="dentro"/>' +
    '<feComposite in="fuera" in2="dentro" operator="out" result="franja"/>' +
    `<feFlood flood-color="${DOTTED}"/><feComposite in2="franja" operator="in"/></filter>` +
    '<pattern id="trazos" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">' +
    '<rect width="5.5" height="9" fill="#fff"/></pattern>' +
    `<mask id="corte"><rect x="${-PAD.left}" y="${-PAD.top}" width="${POSE_W}" height="${POSE_H}" fill="url(#trazos)"/></mask>`;
  const body = `<defs>${defs}</defs><g mask="url(#corte)"><g filter="url(#borde)">${ninjaBody(el)}</g></g>`;
  return svgDoc(POSE_W, POSE_H, body, scale, VIEW);
}

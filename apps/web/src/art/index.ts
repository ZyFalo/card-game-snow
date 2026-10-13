import { ELEMENTS, ENEMY_KINDS, MAPS } from '@ventisca/core';
import { NINJA_CLIPS } from '../game/rig/clips';
import type { Pose } from '../game/rig/Rig';
import {
  bitSvg,
  craneSvg,
  dartSvg,
  flakeSvg,
  fxBeamSvg,
  fxDropSvg,
  fxFlakeSmallSvg,
  fxFlameSvg,
  fxImpactSvg,
  fxPuffSvg,
  fxSigilSvg,
  fxSparkSvg,
  fxSwipeSvg,
  hailSvg,
  icicleSvg,
  iconSvg,
  miniCardSvg,
  paperStarSvg,
  phoenixSvg,
  placedCardSvg,
  ringSvg,
  waveSvg,
} from './effects';
import { golemBustSvg, golemPartSvg, golemSvg } from './golems';
import { ninjaBustSvg, ninjaKoSvg, ninjaOutlineSvg, ninjaPartSvg, ninjaStandSvg } from './ninjas';
import { ninjaAsleepSvg, ninjaDottedSvg, ninjaPoseSvg, ninjaSilhouetteSvg } from './poses';
import { golemRig, ninjaRig, partKey, rigParts } from './rigs';
import { backgroundSvg, rockSvg } from './scenery';
import { toDataUri } from './svg';

export const ICON_NAMES = ['shield', 'boost', 'stun', 'burn', 'heal', 'attack', 'revive'] as const;
export type IconName = (typeof ICON_NAMES)[number];

/** Todas las texturas del juego, generadas en código a partir de SVG. */
export function artEntries(): { key: string; svg: string }[] {
  return [
    ...ELEMENTS.flatMap((el) => [
      { key: `ninja-${el}-outline`, svg: ninjaOutlineSvg(el) },
      { key: `ninja-${el}-ko`, svg: ninjaKoSvg(el) },
      { key: `ninja-${el}-asleep`, svg: ninjaAsleepSvg(el) },
      { key: `card-${el}`, svg: miniCardSvg(el) },
      { key: `placed-${el}`, svg: placedCardSvg(el) },
    ]),
    ...ENEMY_KINDS.map((k) => ({ key: `enemy-${k}`, svg: golemSvg(k) })),
    ...MAPS.map((m) => ({ key: `bg-${m}`, svg: backgroundSvg(m) })),
    ...ICON_NAMES.map((n) => ({ key: `icon-${n}`, svg: iconSvg(n) })),
    // Piezas de los esqueletos de animación (fase 1).
    ...ELEMENTS.flatMap((el) => {
      const rig = ninjaRig(el);
      return rigParts(rig).map((part) => ({ key: partKey(rig, part), svg: ninjaPartSvg(el, part as never) }));
    }),
    ...ENEMY_KINDS.flatMap((kind) => {
      const rig = golemRig(kind);
      return rigParts(rig).map((part) => ({ key: partKey(rig, part), svg: golemPartSvg(kind, part) }));
    }),
    { key: 'rock', svg: rockSvg() },
    { key: 'fx-phoenix', svg: phoenixSvg() },
    { key: 'fx-wave', svg: waveSvg() },
    { key: 'fx-flake', svg: flakeSvg() },
    { key: 'fx-crane', svg: craneSvg() },
    { key: 'fx-star', svg: paperStarSvg() },
    { key: 'fx-dart', svg: dartSvg() },
    { key: 'fx-hail', svg: hailSvg() },
    { key: 'fx-icicle', svg: icicleSvg() },
    { key: 'fx-bit', svg: bitSvg() },
    { key: 'fx-ring', svg: ringSvg() },
    { key: 'fx-impact', svg: fxImpactSvg() },
    { key: 'fx-flame', svg: fxFlameSvg() },
    { key: 'fx-drop', svg: fxDropSvg() },
    { key: 'fx-flake-small', svg: fxFlakeSmallSvg() },
    { key: 'fx-spark', svg: fxSparkSvg() },
    { key: 'fx-puff', svg: fxPuffSvg() },
    { key: 'fx-swipe', svg: fxSwipeSvg() },
    { key: 'fx-beam', svg: fxBeamSvg() },
    { key: 'fx-sigil', svg: fxSigilSvg() },
  ];
}

let loading: Promise<Map<string, HTMLImageElement>> | null = null;

/**
 * Todas las texturas como imágenes (data URIs, sin peticiones de red). Se rasterizan una sola vez: el
 * tablero y cada demostración (D-81) comparten las mismas imágenes.
 */
export function loadArtImages(): Promise<Map<string, HTMLImageElement>> {
  loading ??= rasterize().catch((error: unknown) => {
    // Si falla, el siguiente que las pida lo intenta de nuevo.
    loading = null;
    throw error;
  });
  return loading;
}

async function rasterize(): Promise<Map<string, HTMLImageElement>> {
  const out = new Map<string, HTMLImageElement>();
  await Promise.all(
    artEntries().map(
      (entry) =>
        new Promise<void>((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            out.set(entry.key, img);
            resolve();
          };
          img.onerror = () => reject(new Error(`No se pudo rasterizar ${entry.key}`));
          img.src = toDataUri(entry.svg);
        }),
    ),
  );
  return out;
}

const uriCache = new Map<string, string>();
const cached = (key: string, make: () => string): string => {
  let v = uriCache.get(key);
  if (!v) {
    v = toDataUri(make());
    uriCache.set(key, v);
  }
  return v;
};

type Ninja = (typeof ELEMENTS)[number];

/** Las dos poses entre las que respira un ninja en reposo: las mismas del tablero. */
const idlePoses = (el: Ninja): [Pose, Pose] => {
  const frames = NINJA_CLIPS[el].idle.frames;
  return [frames[0]?.pose ?? {}, frames[1]?.pose ?? {}];
};

/**
 * La pose de acción de quien ya eligió: en guardia, con las piernas abiertas y el arma al frente. Va y
 * vuelve en un vaivén corto, como quien espera la señal.
 */
const ACTION_POSES: [Pose, Pose] = [
  {
    root: { sy: 0.96, r: -3 },
    torso: { r: -4 },
    head: { r: 3 },
    armFront: { r: -38 },
    armBack: { r: 26 },
    legFront: { r: -12 },
    legBack: { r: 12 },
    tails: { r: 14 },
  },
  {
    root: { sy: 0.99, r: -3, y: -2 },
    torso: { r: -3 },
    head: { r: 1 },
    armFront: { r: -48 },
    armBack: { r: 32 },
    legFront: { r: -10 },
    legBack: { r: 10 },
    tails: { r: 22 },
  },
];

/** Data URIs para usar el mismo arte en React (<img src>). */
export const art = {
  bust: (el: Ninja) => cached(`bust-${el}`, () => ninjaBustSvg(el)),
  ninja: (el: Ninja) => cached(`ninja-${el}`, () => ninjaStandSvg(el)),
  /** El ninja en reposo, con las poses del tablero. `moving`: respira; si no, queda quieto. */
  idle: (el: Ninja, moving = true) =>
    cached(`idle-${el}-${moving}`, () => {
      const [a, b] = idlePoses(el);
      return ninjaPoseSvg(el, a, moving ? b : null, 760);
    }),
  /** El ninja en pose de acción: el que eligió quien juega. */
  action: (el: Ninja, moving = true) =>
    cached(`action-${el}-${moving}`, () => {
      const [a, b] = ACTION_POSES;
      return ninjaPoseSvg(el, a, moving ? b : null, 620);
    }),
  /** La silueta de tinta de un asiento que todavía no tiene a nadie. */
  silhouette: (el: Ninja) => cached(`silhouette-${el}`, () => ninjaSilhouetteSvg(el)),
  /** La silueta punteada de un asiento libre. */
  dotted: (el: Ninja) => cached(`dotted-${el}`, () => ninjaDottedSvg(el)),
  /** El ninja de quien no está: gris y dormido. */
  asleep: (el: Ninja) => cached(`asleep-${el}`, () => ninjaAsleepSvg(el)),
  golem: (k: (typeof ENEMY_KINDS)[number]) => cached(`golem-${k}`, () => golemBustSvg(k)),
  icon: (n: IconName) => cached(`icon-${n}`, () => iconSvg(n)),
  background: (m: (typeof MAPS)[number]) => cached(`bg-${m}`, () => backgroundSvg(m, 1)),
};

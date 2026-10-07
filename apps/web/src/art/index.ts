import { ELEMENTS, ENEMY_KINDS, MAPS } from '@ventisca/core';
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

/** Rasteriza todas las texturas como imágenes (data URIs, sin peticiones de red). */
export async function loadArtImages(): Promise<Map<string, HTMLImageElement>> {
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

/** Data URIs para usar el mismo arte en React (<img src>). */
export const art = {
  bust: (el: (typeof ELEMENTS)[number]) => cached(`bust-${el}`, () => ninjaBustSvg(el)),
  ninja: (el: (typeof ELEMENTS)[number]) => cached(`ninja-${el}`, () => ninjaStandSvg(el)),
  golem: (k: (typeof ENEMY_KINDS)[number]) => cached(`golem-${k}`, () => golemBustSvg(k)),
  icon: (n: IconName) => cached(`icon-${n}`, () => iconSvg(n)),
  background: (m: (typeof MAPS)[number]) => cached(`bg-${m}`, () => backgroundSvg(m, 1)),
};

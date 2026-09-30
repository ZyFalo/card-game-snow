import type { ElementKind, EnemyKind } from '@ventisca/core';
import type { Clip } from './Rig';

/*
 * Estados de animación inspirados en la coreografía del original (reposo,
 * moverse, atacar, recibir golpe, caer, revivido, revivir a otro, invocar
 * carta, curar, celebrar; y en los gólems: aturdido y aparecer). Todo el
 * movimiento es propio: poses de papel plegado sobre esqueletos de recorte.
 *
 * Convenciones: los ninjas miran a la derecha y los gólems a la izquierda.
 * r > 0 gira en sentido horario (en pantalla). En la raíz, r > 0 inclina la
 * figura hacia la derecha, pivotando en los pies.
 */

export type NinjaClip =
  | 'idle'
  | 'move'
  | 'attack'
  | 'hit'
  | 'koStart'
  | 'revived'
  | 'reviveOther'
  | 'power'
  | 'heal'
  | 'celebrate';

export type GolemClip = 'idle' | 'move' | 'attack' | 'hit' | 'dazed' | 'dazedTurn' | 'spawn';

const OUT = 'Quad.easeOut';
const IN = 'Quad.easeIn';
const BACK = 'Back.easeOut';

/* ---------- Ninjas ---------- */

const ninjaBase: Record<Exclude<NinjaClip, 'attack'>, Clip> = {
  idle: {
    loop: true,
    frames: [
      {
        ms: 760,
        pose: { head: { r: 1.5, y: -0.4 }, armFront: { r: -4 }, armBack: { r: 3 }, tails: { r: -7 } },
      },
      {
        ms: 760,
        pose: {
          root: { sy: 1.025, sx: 0.99 },
          head: { r: -1.2, y: -1.2 },
          armFront: { r: 2 },
          armBack: { r: -2 },
          tails: { r: 9 },
        },
      },
    ],
  },
  move: {
    loop: true,
    frames: [
      {
        ms: 85,
        ease: OUT,
        pose: {
          root: { y: -7, sy: 1.05, sx: 0.97, r: 4 },
          legFront: { r: -24 },
          legBack: { r: 20 },
          armFront: { r: 22 },
          armBack: { r: -22 },
          tails: { r: 18 },
          torso: { r: 3 },
        },
      },
      {
        ms: 85,
        ease: IN,
        pose: {
          root: { sy: 0.94, sx: 1.04, r: 2 },
          legFront: { r: 14 },
          legBack: { r: -12 },
          armFront: { r: -12 },
          armBack: { r: 12 },
          tails: { r: 6 },
        },
      },
    ],
  },
  hit: {
    frames: [
      {
        ms: 70,
        ease: OUT,
        pose: {
          root: { r: -10, x: -4 },
          torso: { r: -8 },
          head: { r: -18 },
          armFront: { r: -38 },
          armBack: { r: 32 },
          tails: { r: 22 },
        },
      },
      { ms: 170, pose: { root: { r: 3 }, head: { r: 4 }, tails: { r: -6 } } },
      { ms: 140, pose: {} },
    ],
  },
  koStart: {
    frames: [
      {
        ms: 90,
        ease: OUT,
        pose: {
          root: { r: -8, sy: 0.9 },
          head: { r: -25 },
          armFront: { r: -70 },
          armBack: { r: 45 },
          tails: { r: 25 },
        },
      },
      {
        ms: 280,
        ease: IN,
        pose: {
          root: { r: 16, sy: 0.55, sx: 1.12, y: 2 },
          torso: { r: 24 },
          head: { r: 42 },
          armFront: { r: 75 },
          armBack: { r: -35 },
          legFront: { r: 30 },
          legBack: { r: -22 },
          tails: { r: -20 },
        },
      },
    ],
  },
  revived: {
    frames: [
      { ms: 0, pose: { root: { sy: 0.3, sx: 1.3 }, armFront: { r: -140 }, armBack: { r: 140 } } },
      {
        ms: 230,
        ease: BACK,
        pose: {
          root: { sy: 1.15, sx: 0.92, y: -10 },
          armFront: { r: -150 },
          armBack: { r: 150 },
          head: { r: -8 },
          tails: { r: 20 },
        },
      },
      { ms: 170, pose: { root: { sy: 0.96 }, armFront: { r: -20 }, armBack: { r: 12 } } },
      { ms: 170, pose: {} },
    ],
  },
  reviveOther: {
    frames: [
      {
        ms: 170,
        ease: OUT,
        pose: { root: { sy: 0.9, r: 7 }, torso: { r: 14 }, head: { r: 14 }, armFront: { r: 30 }, armBack: { r: -25 } },
      },
      {
        ms: 230,
        pose: { root: { sy: 0.92, r: 7 }, torso: { r: 14 }, head: { r: 10 }, armFront: { r: 42 }, armBack: { r: -32 } },
      },
      { ms: 210, pose: {} },
    ],
  },
  power: {
    frames: [
      { ms: 120, ease: OUT, pose: { root: { sy: 0.9 }, armFront: { r: 30 }, armBack: { r: -30 }, head: { r: 6 } } },
      {
        ms: 170,
        ease: BACK,
        marker: 'release',
        pose: {
          root: { sy: 1.1, sx: 0.95, y: -9 },
          armFront: { r: -140 },
          armBack: { r: 150 },
          head: { r: -12 },
          // Compensa el giro del brazo: el abanico (o el arma) queda hacia arriba, no sobre la cara.
          weapon: { r: 135 },
          tails: { r: 24 },
        },
      },
      {
        ms: 230,
        pose: {
          root: { sy: 1.06, y: -6 },
          armFront: { r: -135 },
          armBack: { r: 145 },
          head: { r: -10 },
          weapon: { r: 130 },
          tails: { r: 14 },
        },
      },
      { ms: 240, pose: {} },
    ],
  },
  heal: {
    frames: [
      { ms: 150, ease: OUT, pose: { root: { sy: 1.03 }, armFront: { r: -30 }, armBack: { r: 60 }, head: { r: -4 } } },
      {
        ms: 120,
        marker: 'release',
        pose: {
          root: { sy: 1.05, y: -3 },
          armFront: { r: -55 },
          armBack: { r: 95 },
          weapon: { r: 120 },
          head: { r: -8 },
        },
      },
      { ms: 200, pose: { armFront: { r: -45 }, armBack: { r: 80 }, weapon: { r: 200 } } },
      { ms: 200, pose: {} },
    ],
  },
  celebrate: {
    loop: true,
    frames: [
      {
        ms: 210,
        ease: OUT,
        pose: {
          root: { y: -15, sy: 1.08 },
          armFront: { r: -140 },
          weapon: { r: 135 },
          armBack: { r: 150 },
          head: { r: -8 },
          tails: { r: 26 },
          legFront: { r: -12 },
          legBack: { r: 12 },
        },
      },
      {
        ms: 190,
        ease: IN,
        pose: {
          root: { sy: 0.92, sx: 1.05 },
          armFront: { r: -115 },
          weapon: { r: 110 },
          armBack: { r: 120 },
          head: { r: 4 },
          tails: { r: 4 },
        },
      },
    ],
  },
};

const ninjaAttack: Record<ElementKind, Clip> = {
  // Brasa: echa el abanico atrás y lanza el dardo con un latigazo.
  fire: {
    frames: [
      {
        ms: 150,
        ease: OUT,
        pose: {
          root: { r: -6, x: -2 },
          torso: { r: -8 },
          armFront: { r: -125 },
          weapon: { r: -30 },
          head: { r: -6 },
          armBack: { r: 25 },
          tails: { r: 14 },
        },
      },
      {
        ms: 90,
        ease: IN,
        marker: 'release',
        pose: {
          root: { r: 7, x: 3 },
          torso: { r: 8 },
          armFront: { r: 6 },
          weapon: { r: 24 },
          head: { r: 4 },
          armBack: { r: -20 },
        },
      },
      {
        ms: 130,
        pose: { root: { r: 4, x: 2 }, torso: { r: 5 }, armFront: { r: 2 }, weapon: { r: 10 }, tails: { r: -10 } },
      },
      { ms: 220, pose: {} },
    ],
  },
  // Marea: se agacha, recoge el puño y golpea hacia delante.
  water: {
    frames: [
      {
        ms: 130,
        ease: OUT,
        pose: {
          root: { sy: 0.92, sx: 1.05, r: -4 },
          torso: { r: -6 },
          armFront: { r: 12, x: -8 },
          weapon: { r: -10 },
          armBack: { r: 22 },
          head: { r: -4 },
        },
      },
      {
        ms: 80,
        ease: IN,
        marker: 'release',
        pose: {
          root: { sy: 1.03, r: 8, x: 4 },
          torso: { r: 10 },
          armFront: { r: -40, x: 8 },
          weapon: { sx: 1.2, sy: 1.2 },
          armBack: { r: -25 },
          head: { r: 5 },
          tails: { r: -14 },
        },
      },
      { ms: 140, pose: { root: { r: 5, x: 2 }, torso: { r: 6 }, armFront: { r: -30, x: 5 }, armBack: { r: -15 } } },
      { ms: 200, pose: {} },
    ],
  },
  // Escarcha: lleva la estrella atrás girando y la suelta con el brazo.
  snow: {
    frames: [
      {
        ms: 130,
        ease: OUT,
        pose: {
          root: { r: -5 },
          torso: { r: -6 },
          armFront: { r: -70 },
          weapon: { r: -180 },
          head: { r: -5 },
          armBack: { r: 15 },
          tails: { r: 12 },
        },
      },
      {
        ms: 80,
        ease: IN,
        marker: 'release',
        pose: {
          root: { r: 5 },
          torso: { r: 6 },
          armFront: { r: 48 },
          weapon: { a: 0 },
          head: { r: 3 },
          armBack: { r: -12 },
        },
      },
      { ms: 170, pose: { root: { r: 3 }, armFront: { r: 38 }, weapon: { a: 0 } } },
      { ms: 220, pose: { weapon: { a: 0 } } },
      { ms: 120, pose: {} },
    ],
  },
};

export const NINJA_CLIPS: Record<ElementKind, Record<NinjaClip, Clip>> = {
  fire: { ...ninjaBase, attack: ninjaAttack.fire },
  water: { ...ninjaBase, attack: ninjaAttack.water },
  snow: { ...ninjaBase, attack: ninjaAttack.snow },
};

/* ---------- Gólems ---------- */

const golemBase = (heavy: number): Omit<Record<GolemClip, Clip>, 'attack'> => ({
  idle: {
    loop: true,
    frames: [
      { ms: 900 * heavy, pose: { head: { y: 0.6 }, armFront: { r: 2 }, armBack: { r: -2 } } },
      {
        ms: 900 * heavy,
        pose: {
          root: { sy: 1.018, sx: 0.992 },
          head: { y: -0.8, r: -1.5 },
          armFront: { r: -2 },
          armBack: { r: 2 },
          pack: { y: -0.6 },
        },
      },
    ],
  },
  move: {
    loop: true,
    frames: [
      {
        ms: 120 * heavy,
        ease: OUT,
        pose: {
          root: { y: -4 / heavy, sy: 1.03, r: -3 },
          legFront: { r: 14 },
          legBack: { r: -12 },
          armFront: { r: -8 },
          armBack: { r: 8 },
        },
      },
      {
        ms: 120 * heavy,
        ease: IN,
        pose: {
          root: { sy: 0.95, sx: 1.03, r: -1 },
          legFront: { r: -10 },
          legBack: { r: 10 },
          armFront: { r: 6 },
          armBack: { r: -6 },
        },
      },
    ],
  },
  hit: {
    frames: [
      {
        ms: 70,
        ease: OUT,
        pose: { root: { r: 8, x: 4 }, head: { r: 14 }, armFront: { r: 20 }, armBack: { r: -15 }, pack: { r: 6 } },
      },
      { ms: 160, pose: { root: { r: -2 }, head: { r: -3 } } },
      { ms: 140, pose: {} },
    ],
  },
  dazed: {
    loop: true,
    frames: [
      { ms: 380, pose: { head: { r: 12 }, root: { r: -4 }, armFront: { r: -10 }, armBack: { r: 8 } } },
      { ms: 380, pose: { head: { r: -10 }, root: { r: 4 }, armFront: { r: 8 }, armBack: { r: -8 } } },
    ],
  },
  dazedTurn: {
    frames: [
      { ms: 120, pose: { head: { r: 16 }, root: { r: -6 } } },
      { ms: 120, pose: { head: { r: -14 }, root: { r: 6 } } },
      { ms: 120, pose: { head: { r: 10 }, root: { r: -3 } } },
      { ms: 140, pose: {} },
    ],
  },
  spawn: {
    frames: [
      {
        ms: 0,
        pose: {
          root: { sy: 0.25, y: 4 },
          head: { y: -34, a: 0 },
          armFront: { x: -20, r: -60, a: 0 },
          armBack: { x: 20, r: 60, a: 0 },
          pack: { y: -20, a: 0 },
          weapon: { a: 0 },
          legFront: { y: 12, a: 0 },
          legBack: { y: 12, a: 0 },
        },
      },
      { ms: 240, ease: BACK, pose: { root: { sy: 1.12, sx: 0.94 } } },
      { ms: 180, pose: {} },
    ],
  },
});

const golemAttack: Record<EnemyKind, Clip> = {
  // Carámbano: echa la jabalina atrás y la lanza.
  sniper: {
    frames: [
      {
        ms: 150,
        ease: OUT,
        pose: {
          armFront: { r: 105 },
          weapon: { r: -20 },
          root: { r: 5 },
          torso: { r: 4 },
          head: { r: 4 },
          armBack: { r: -10 },
        },
      },
      {
        ms: 80,
        ease: IN,
        marker: 'release',
        pose: { armFront: { r: -18 }, weapon: { a: 0 }, root: { r: -5 }, torso: { r: -4 }, head: { r: -3 } },
      },
      { ms: 200, pose: { armFront: { r: -10 }, weapon: { a: 0 }, root: { r: -2 } } },
      { ms: 220, pose: {} },
    ],
  },
  // Granizo: sube la bola por encima y la lanza en parábola.
  artillery: {
    frames: [
      {
        ms: 170,
        ease: OUT,
        pose: { armFront: { r: 65 }, root: { r: 5, sy: 0.95 }, torso: { r: 5 }, pack: { r: 4 }, head: { r: 4 } },
      },
      {
        ms: 90,
        ease: IN,
        marker: 'release',
        pose: { armFront: { r: -55 }, weapon: { a: 0 }, root: { r: -6, sy: 1.03 }, torso: { r: -4 }, head: { r: -3 } },
      },
      { ms: 170, pose: { armFront: { r: -40 }, weapon: { a: 0 }, root: { r: -3 } } },
      { ms: 250, pose: {} },
    ],
  },
  // Témpano: levanta los dos brazos y golpea el suelo.
  colossus: {
    frames: [
      {
        ms: 210,
        ease: OUT,
        pose: {
          armFront: { r: 118 },
          armBack: { r: -110 },
          root: { r: 5, sy: 1.06, y: -5 },
          torso: { r: 5 },
          head: { r: 5 },
        },
      },
      {
        ms: 90,
        ease: IN,
        marker: 'release',
        pose: {
          armFront: { r: -12 },
          armBack: { r: 10 },
          root: { r: -6, sy: 0.88, sx: 1.05, y: 2 },
          torso: { r: -6 },
          head: { r: -4 },
        },
      },
      { ms: 190, pose: { armFront: { r: -8 }, armBack: { r: 6 }, root: { r: -3, sy: 0.94 } } },
      { ms: 260, pose: {} },
    ],
  },
};

export const GOLEM_CLIPS: Record<EnemyKind, Record<GolemClip, Clip>> = {
  sniper: { ...golemBase(1), attack: golemAttack.sniper },
  artillery: { ...golemBase(1.15), attack: golemAttack.artillery },
  colossus: { ...golemBase(1.4), attack: golemAttack.colossus },
};

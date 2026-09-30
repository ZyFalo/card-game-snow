import * as Phaser from 'phaser';
import { partKey, type RigDef } from '../../art/rigs';

/*
 * Esqueleto de recorte (fase 1 de animación). Cada pieza es un contenedor
 * colocado en su articulación; su imagen se desplaza para que el lienzo común
 * quede alineado. Las poses son diferencias sobre el reposo:
 *   r = grados, x/y = unidades del SVG, sx/sy = escala, a = opacidad.
 * Un fotograma sin una pieza la devuelve al reposo.
 */

export interface PartPose {
  r?: number;
  x?: number;
  y?: number;
  sx?: number;
  sy?: number;
  a?: number;
}

export type Pose = Readonly<Record<string, PartPose>>;

export interface ClipFrame {
  pose: Pose;
  ms: number;
  ease?: string;
  /** Momento clave (soltar el proyectil, impacto…): el animador lo espera. */
  marker?: string;
}

export interface Clip {
  frames: readonly ClipFrame[];
  loop?: boolean;
}

export interface Playback {
  /** Se resuelve al terminar el clip o si otro clip lo interrumpe. */
  done: Promise<void>;
  /** Se resuelve al pasar por el marcador, o antes si el clip termina o se interrumpe. */
  marker(name: string): Promise<void>;
}

interface RigNode {
  name: string;
  c: Phaser.GameObjects.Container;
  restX: number;
  restY: number;
}

const RAD = Math.PI / 180;

export class Rig {
  readonly root: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private readonly def: RigDef;
  private readonly s: number;
  private readonly nodes = new Map<string, RigNode>();
  private readonly images: Phaser.GameObjects.Image[] = [];
  private token = 0;
  private finishCurrent: (() => void) | null = null;

  constructor(scene: Phaser.Scene, def: RigDef, displayWidth: number, rootY = 2) {
    this.scene = scene;
    this.def = def;
    this.s = displayWidth / def.width;
    this.root = scene.add.container(0, rootY);
    this.nodes.set('root', { name: 'root', c: this.root, restX: 0, restY: rootY });
    for (const child of def.children.root ?? []) this.build(child, def.anchor, this.root);
  }

  /** Alto en pantalla de la figura completa. */
  get displayHeight(): number {
    return this.def.height * this.s;
  }

  private build(name: string, parentPivot: readonly [number, number], parent: Phaser.GameObjects.Container): void {
    const pivot = this.def.pivots[name];
    if (!pivot) return;
    const s = this.s;
    const c = this.scene.add.container((pivot[0] - parentPivot[0]) * s, (pivot[1] - parentPivot[1]) * s);
    parent.add(c);
    this.nodes.set(name, { name, c, restX: c.x, restY: c.y });
    for (const child of this.def.children[name] ?? ['self']) {
      if (child === 'self') {
        const img = this.scene.add.image(-pivot[0] * s, -pivot[1] * s, partKey(this.def, name)).setOrigin(0, 0);
        img.setDisplaySize(this.def.width * s, this.def.height * s);
        c.add(img);
        this.images.push(img);
      } else {
        this.build(child, pivot, c);
      }
    }
  }

  private containers(): Phaser.GameObjects.Container[] {
    return [...this.nodes.values()].map((n) => n.c);
  }

  private target(node: RigNode, p: PartPose | undefined) {
    return {
      x: node.restX + (p?.x ?? 0) * this.s,
      y: node.restY + (p?.y ?? 0) * this.s,
      rotation: (p?.r ?? 0) * RAD,
      scaleX: p?.sx ?? 1,
      scaleY: p?.sy ?? 1,
      alpha: p?.a ?? 1,
    };
  }

  /** Aplica una pose al instante (sin interpolar). */
  setPose(pose: Pose): void {
    for (const node of this.nodes.values()) {
      const t = this.target(node, pose[node.name]);
      node.c.setPosition(t.x, t.y).setRotation(t.rotation).setScale(t.scaleX, t.scaleY).setAlpha(t.alpha);
    }
  }

  private tweenTo(pose: Pose, ms: number, ease: string, token: number, onDone: () => void): void {
    if (ms <= 0) {
      this.setPose(pose);
      this.scene.time.delayedCall(0, () => {
        if (token === this.token) onDone();
      });
      return;
    }
    const nodes = [...this.nodes.values()];
    let pending = nodes.length;
    for (const node of nodes) {
      this.scene.tweens.add({
        targets: node.c,
        ...this.target(node, pose[node.name]),
        duration: ms,
        ease,
        onComplete: () => {
          pending -= 1;
          if (pending === 0 && token === this.token) onDone();
        },
      });
    }
  }

  /** Reproduce un clip. `speed` multiplica las duraciones (animaciones reducidas, ?speed). */
  play(clip: Clip, speed = 1): Playback {
    this.interrupt();
    const token = ++this.token;
    const waiting = new Map<string, () => void>();
    const markerPromises = new Map<string, Promise<void>>();
    for (const f of clip.frames) {
      const m = f.marker;
      if (m && !markerPromises.has(m)) markerPromises.set(m, new Promise<void>((r) => waiting.set(m, r)));
    }
    let resolveDone: () => void = () => undefined;
    const done = new Promise<void>((r) => {
      resolveDone = r;
    });
    const finish = () => {
      for (const r of waiting.values()) r();
      waiting.clear();
      resolveDone();
      if (this.finishCurrent === finish) this.finishCurrent = null;
    };
    this.finishCurrent = finish;
    let i = 0;
    const next = () => {
      if (token !== this.token) return;
      if (i >= clip.frames.length) {
        if (!clip.loop || clip.frames.length === 0) {
          finish();
          return;
        }
        i = 0;
      }
      const f = clip.frames[i] as ClipFrame;
      i += 1;
      this.tweenTo(f.pose, f.ms * speed, f.ease ?? 'Sine.easeInOut', token, () => {
        if (f.marker) {
          waiting.get(f.marker)?.();
          waiting.delete(f.marker);
        }
        next();
      });
    };
    next();
    return { done, marker: (name) => markerPromises.get(name) ?? Promise.resolve() };
  }

  /** Detiene el clip en curso (su promesa y sus marcadores se resuelven). */
  private interrupt(): void {
    this.token += 1;
    this.scene.tweens.killTweensOf(this.containers());
    const f = this.finishCurrent;
    this.finishCurrent = null;
    f?.();
  }

  stop(toRest = true): void {
    this.interrupt();
    if (toRest) this.setPose({});
  }

  tintFill(color: number): void {
    for (const img of this.images) img.setTint(color).setTintMode(Phaser.TintModes.FILL);
  }

  clearTint(): void {
    for (const img of this.images) img.setTintMode(Phaser.TintModes.MULTIPLY).clearTint();
  }

  /** Posición en el mundo de la articulación de una pieza (para lanzar proyectiles desde la mano). */
  worldPoint(name: string): { x: number; y: number } {
    const node = this.nodes.get(name) ?? this.nodes.get('root');
    const m = (node as RigNode).c.getWorldTransformMatrix();
    return { x: m.tx, y: m.ty };
  }

  has(name: string): boolean {
    return this.nodes.has(name);
  }

  /** Las piezas salen despedidas y se desvanecen (un gólem que se hace pedazos). */
  explode(ms: number): Promise<void> {
    this.interrupt();
    return new Promise((resolve) => {
      let pending = this.images.length;
      if (pending === 0) resolve();
      for (const img of this.images) {
        const ang = Math.random() * Math.PI * 2;
        const dist = 26 + Math.random() * 38;
        this.scene.tweens.add({
          targets: img,
          x: img.x + Math.cos(ang) * dist,
          y: img.y + Math.sin(ang) * dist - 18,
          angle: (Math.random() - 0.5) * 260,
          alpha: 0,
          duration: ms,
          ease: 'Cubic.easeOut',
          onComplete: () => {
            pending -= 1;
            if (pending === 0) resolve();
          },
        });
      }
    });
  }
}

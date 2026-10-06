import type { Vec } from '@ventisca/core';
import * as Phaser from 'phaser';
import { hex, PALETTE } from '../art/palette';
import { BOARD_X, BOARD_Y, RES, TH, TW, tileCenter, tileRect } from './layout';
import type { UnitSprite } from './UnitSprite';

/*
 * Efectos de la fase 2 de animación: todo lo que da peso y lectura a los
 * golpes (impactos, pausas, cámara, estelas, casillas en cascada, números) y
 * las piezas de las cinemáticas de carta. Con "animaciones reducidas" se
 * omiten pausas, cámara y estelas, y hay menos partículas.
 */

/** Texturas que usa este módulo (una prueba verifica que existan). */
export const FX_TEXTURES = [
  'fx-impact',
  'fx-flame',
  'fx-drop',
  'fx-flake-small',
  'fx-spark',
  'fx-puff',
  'fx-swipe',
  'fx-beam',
  'fx-sigil',
  'fx-bit',
  'fx-ring',
] as const;

type Pt = { x: number; y: number };

interface BurstOptions {
  speed?: number;
  gravity?: number;
  scale?: number;
  lifespan?: number;
  /** Solo hacia arriba (salpicaduras, destellos que suben). */
  up?: boolean;
  depth?: number;
}

export class Fx {
  private freezeLeft = 0;
  private listening = false;
  /** Escala de tiempo de base: 1, o más mientras se acelera la resolución. */
  private base = 1;
  /**
   * Objetos pasajeros que siguen en la escena. Cada efecto se destruye al terminar su
   * animación, pero si la partida se interrumpe (reiniciar o salir) esas animaciones
   * mueren antes: clear() destruye lo que quede.
   */
  private readonly live = new Set<Phaser.GameObjects.GameObject>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly opts: { speed(): number; calm(): boolean },
  ) {}

  /** Registra un objeto pasajero; sale del registro al destruirse. */
  track<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.live.add(obj);
    obj.once(Phaser.GameObjects.Events.DESTROY, () => this.live.delete(obj));
    return obj;
  }

  /** Al interrumpir la partida: destruye todos los efectos vivos y devuelve el tiempo a la normalidad. */
  clear(): void {
    for (const obj of [...this.live]) obj.destroy();
    this.live.clear();
    this.base = 1;
    this.resetTime();
  }

  private get speed(): number {
    return this.opts.speed();
  }

  private get calm(): boolean {
    return this.opts.calm();
  }

  /* ---------- Tiempo y cámara ---------- */

  /**
   * Pausa de impacto: casi todo se congela un instante para que el golpe pese.
   * Se mide con el delta real de cada cuadro (no con temporizadores): en un
   * equipo lento dura como mucho un cuadro, nunca más de lo previsto.
   */
  hitStop(ms: number): void {
    if (this.calm || ms <= 0) return;
    this.freezeLeft = Math.max(this.freezeLeft, ms / this.base);
    this.scene.tweens.timeScale = 0.06;
    this.scene.time.timeScale = 0.06;
    if (!this.listening) {
      this.listening = true;
      this.scene.events.on(Phaser.Scenes.Events.PRE_UPDATE, (_time: number, delta: number) => {
        if (this.freezeLeft <= 0) return;
        this.freezeLeft -= delta;
        if (this.freezeLeft <= 0) this.resetTime();
      });
    }
  }

  resetTime(): void {
    this.freezeLeft = 0;
    this.scene.tweens.timeScale = this.base;
    this.scene.time.timeScale = this.base;
  }

  /** Acelera (o devuelve a la normalidad) todo el tiempo de la escena. */
  setBaseTimeScale(v: number): void {
    this.base = v;
    if (this.freezeLeft <= 0) this.resetTime();
  }

  get boosted(): boolean {
    return this.base > 1;
  }

  /** Anillo breve bajo quien actúa, para leer de un vistazo quién hace qué. */
  actor(foot: Pt, color: number): void {
    if (this.calm) return;
    this.groundRing(foot, color, 58);
  }

  /** Golpe de cámara: un acercamiento breve y la vuelta. */
  punch(strength = 0.025): void {
    if (this.calm) return;
    const cam = this.scene.cameras.main;
    cam.zoomTo(
      RES * (1 + strength),
      70,
      'Quad.easeOut',
      true,
      (_c: Phaser.Cameras.Scene2D.Camera, progress: number) => {
        if (progress === 1) cam.zoomTo(RES, 190, 'Quad.easeInOut', true);
      },
    );
  }

  shake(ms = 140, intensity = 0.004): void {
    if (!this.calm) this.scene.cameras.main.shake(ms, intensity);
  }

  /* ---------- Partículas e impactos ---------- */

  burst(at: Pt, texture: string, colors: number[], count: number, o: BurstOptions = {}): void {
    const n = this.calm ? Math.ceil(count / 2) : count;
    const v = o.speed ?? 1;
    const lifespan = o.lifespan ?? 560;
    const em = this.track(
      this.scene.add.particles(at.x, at.y, texture, {
        speed: { min: 70 * v, max: 230 * v },
        angle: o.up ? { min: 215, max: 325 } : { min: 0, max: 360 },
        lifespan,
        gravityY: o.gravity ?? 0,
        scale: { start: o.scale ?? 0.5, end: 0.06 },
        alpha: { start: 1, end: 0 },
        rotate: { min: 0, max: 360 },
        tint: colors,
        emitting: false,
      }),
    );
    em.setDepth(o.depth ?? 2100);
    em.explode(n);
    this.scene.time.delayedCall(lifespan + 400, () => em.destroy());
  }

  /** Estallido de papel en el punto de impacto. */
  impact(at: Pt, color: number, size = 64): void {
    const s = this.speed;
    const ring = this.track(this.scene.add.image(at.x, at.y, 'fx-impact'))
      .setDepth(2200)
      .setTint(color);
    ring.setDisplaySize(size * 0.35, size * 0.35).setAngle(Math.random() * 45);
    const base = ring.scale;
    this.scene.tweens.add({
      targets: ring,
      scale: base * 2.8,
      alpha: { from: 1, to: 0 },
      angle: ring.angle + 30,
      duration: 240 * s,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
    const core = this.track(this.scene.add.image(at.x, at.y, 'fx-impact')).setDepth(2201);
    core.setDisplaySize(size * 0.26, size * 0.26);
    const cb = core.scale;
    this.scene.tweens.add({
      targets: core,
      scale: cb * 1.9,
      alpha: { from: 0.95, to: 0 },
      duration: 150 * s,
      ease: 'Quad.easeOut',
      onComplete: () => core.destroy(),
    });
  }

  /** Estela de partículas que sigue a un proyectil. Devuelve la función que la apaga. */
  trail(target: Phaser.GameObjects.Image, texture: string, colors: number[]): () => void {
    if (this.calm) return () => undefined;
    const em = this.track(
      this.scene.add.particles(0, 0, texture, {
        frequency: 16,
        lifespan: 340,
        speed: { min: 4, max: 30 },
        scale: { start: 0.34, end: 0 },
        alpha: { start: 0.9, end: 0 },
        rotate: { min: 0, max: 360 },
        tint: colors,
      }),
    );
    em.setDepth(1990);
    em.startFollow(target);
    return () => {
      em.stop();
      this.scene.time.delayedCall(460, () => em.destroy());
    };
  }

  /** Números que saltan con rebote y luego suben. */
  number(u: UnitSprite, text: string, color: string, big = false): void {
    const size = big ? 29 : 21;
    const t = this.track(
      this.scene.add.text(u.container.x + (Math.random() * 18 - 9), u.headY - 2, text, {
        fontFamily: '"Dela Gothic One", "Zen Kaku Gothic New", system-ui, sans-serif',
        fontSize: `${size}px`,
        color,
        stroke: PALETTE.ink,
        strokeThickness: big ? 7 : 5,
        resolution: 3,
      }),
    )
      .setOrigin(0.5, 1)
      .setDepth(3000)
      .setScale(1.9)
      .setAlpha(0);
    const s = this.speed;
    this.scene.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 150 * s, ease: 'Back.easeOut' });
    this.scene.tweens.add({
      targets: t,
      y: t.y - 38,
      alpha: 0,
      delay: 420 * s,
      duration: 520 * s,
      ease: 'Cubic.easeIn',
      onComplete: () => t.destroy(),
    });
  }

  /* ---------- Suelo ---------- */

  /** Casillas que se encienden en cascada desde un origen (anillos alrededor). */
  cascade(
    tiles: readonly Vec[],
    origin: Vec,
    color: number,
    o: { step?: number; hold?: number; alpha?: number } = {},
  ): void {
    const s = this.speed;
    const step = (o.step ?? 55) * s;
    const hold = (o.hold ?? 220) * s;
    for (const t of tiles) {
      const d = Math.max(Math.abs(t.x - origin.x), Math.abs(t.y - origin.y));
      const r = tileRect(t);
      const g = this.track(this.scene.add.graphics()).setDepth(-4.5);
      g.fillStyle(color, o.alpha ?? 0.42);
      g.fillRoundedRect(-r.w / 2 + 4, -r.h / 2 + 4, r.w - 8, r.h - 8, 8);
      g.lineStyle(3, color, 0.95);
      g.strokeRoundedRect(-r.w / 2 + 4, -r.h / 2 + 4, r.w - 8, r.h - 8, 8);
      g.setPosition(r.x + r.w / 2, r.y + r.h / 2)
        .setScale(0.55)
        .setAlpha(0);
      this.scene.tweens.add({
        targets: g,
        alpha: 1,
        scale: 1,
        delay: d * step,
        duration: 130 * s,
        ease: 'Back.easeOut',
        onComplete: () =>
          this.scene.tweens.add({
            targets: g,
            alpha: 0,
            delay: hold,
            duration: 260 * s,
            onComplete: () => g.destroy(),
          }),
      });
    }
  }

  /** Aviso en el suelo: dónde va a caer un golpe. */
  telegraph(tiles: readonly Vec[], color: number, ms: number): void {
    const s = this.speed;
    for (const t of tiles) {
      const c = tileCenter(t);
      const g = this.track(this.scene.add.graphics()).setDepth(-4.4);
      g.lineStyle(3, color, 0.9);
      g.strokeCircle(0, 0, 26);
      g.lineStyle(2, color, 0.55);
      g.strokeCircle(0, 0, 13);
      g.setPosition(c.x, c.y + 6)
        .setScale(1.5)
        .setAlpha(0);
      this.scene.tweens.add({ targets: g, alpha: 1, scale: 1, duration: 140 * s, ease: 'Quad.easeOut' });
      this.scene.tweens.add({
        targets: g,
        alpha: 0,
        delay: Math.max(0, ms - 120 * s),
        duration: 120 * s,
        onComplete: () => g.destroy(),
      });
    }
  }

  /** Bocanadas de nieve al pisar o al caer algo pesado. */
  dust(at: Pt, count = 3): void {
    if (this.calm) return;
    const s = this.speed;
    for (let i = 0; i < count; i++) {
      const dir = i - (count - 1) / 2;
      const p = this.track(this.scene.add.image(at.x + dir * 10, at.y - 2, 'fx-puff')).setDepth(at.y - 1);
      p.setDisplaySize(22, 15).setAlpha(0.9);
      const b = p.scale;
      this.scene.tweens.add({
        targets: p,
        x: p.x + dir * 16,
        y: p.y - 6,
        scale: b * 1.5,
        alpha: 0,
        duration: 380 * s,
        ease: 'Quad.easeOut',
        onComplete: () => p.destroy(),
      });
    }
  }

  /** Anillo que se expande en el suelo (aparición, curación, reanimación). */
  groundRing(fp: Pt, color: number, width = 96): void {
    const img = this.track(this.scene.add.image(fp.x, fp.y, 'fx-ring'))
      .setDepth(fp.y - 2)
      .setTint(color);
    img.setDisplaySize(width * 0.5, width * 0.18);
    const sx = img.scaleX;
    const sy = img.scaleY;
    this.scene.tweens.add({
      targets: img,
      scaleX: sx * 2.2,
      scaleY: sy * 2.2,
      alpha: { from: 1, to: 0 },
      duration: 460 * this.speed,
      ease: 'Cubic.easeOut',
      onComplete: () => img.destroy(),
    });
  }

  /** Oscurece el tablero salvo el área de una carta. */
  focus(area: readonly Vec[], holdMs: number): void {
    const xs = area.map((t) => t.x);
    const ys = area.map((t) => t.y);
    const x0 = BOARD_X + Math.min(...xs) * TW;
    const x1 = BOARD_X + (Math.max(...xs) + 1) * TW;
    const y0 = BOARD_Y + Math.min(...ys) * TH;
    const y1 = BOARD_Y + (Math.max(...ys) + 1) * TH;
    const bx0 = BOARD_X - 12;
    const by0 = BOARD_Y - 12;
    const bx1 = BOARD_X + 9 * TW + 12;
    const by1 = BOARD_Y + 5 * TH + 12;
    const g = this.track(this.scene.add.graphics()).setDepth(-4.8).setAlpha(0);
    g.fillStyle(hex(PALETTE.ink), 0.26);
    g.fillRect(bx0, by0, bx1 - bx0, y0 - by0);
    g.fillRect(bx0, y1, bx1 - bx0, by1 - y1);
    g.fillRect(bx0, y0, x0 - bx0, y1 - y0);
    g.fillRect(x1, y0, bx1 - x1, y1 - y0);
    const s = this.speed;
    this.scene.tweens.add({ targets: g, alpha: 1, duration: 140 * s });
    this.scene.tweens.add({ targets: g, alpha: 0, delay: holdMs, duration: 260 * s, onComplete: () => g.destroy() });
  }

  /** Sello de papel recortado que gira bajo el área de la carta. */
  sigil(center: Pt, color: number, holdMs: number): void {
    const img = this.track(this.scene.add.image(center.x, center.y, 'fx-sigil'))
      .setDepth(-4.6)
      .setTint(color)
      .setAlpha(0);
    img.setDisplaySize(300, 300);
    const b = img.scale;
    img.setScale(b * 0.5);
    const s = this.speed;
    this.scene.tweens.add({ targets: img, scale: b, alpha: 0.85, duration: 240 * s, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: img, angle: 60, duration: holdMs + 260 * s });
    this.scene.tweens.add({
      targets: img,
      alpha: 0,
      delay: holdMs,
      duration: 260 * s,
      onComplete: () => img.destroy(),
    });
  }

  /** Haz de luz que baja sobre una casilla (reanimación). */
  beam(fp: Pt, color: number): void {
    const img = this.track(this.scene.add.image(fp.x, fp.y + 4, 'fx-beam'))
      .setOrigin(0.5, 1)
      .setDepth(1995)
      .setTint(color);
    img.setBlendMode(Phaser.BlendModes.ADD);
    img.setDisplaySize(70, 380);
    const sy = img.scaleY;
    img.scaleY = 0;
    const s = this.speed;
    this.scene.tweens.add({ targets: img, scaleY: sy, duration: 170 * s, ease: 'Quad.easeOut' });
    this.scene.tweens.add({
      targets: img,
      alpha: 0,
      delay: 380 * s,
      duration: 320 * s,
      onComplete: () => img.destroy(),
    });
  }

  /** Algo que cae del cielo sobre un punto (lluvia de fuego). Resuelve al tocar el suelo. */
  fall(
    texture: string,
    to: Pt,
    o: { size: [number, number]; ms: number; delay: number; dx: number; height: number },
  ): Promise<void> {
    return new Promise((resolve) => {
      const s = this.speed;
      const img = this.track(this.scene.add.image(to.x + o.dx, to.y - o.height, texture))
        .setDepth(2050)
        .setAlpha(0);
      img.setDisplaySize(o.size[0], o.size[1]);
      img.setRotation(Math.atan2(o.height, -o.dx));
      this.scene.tweens.add({
        targets: img,
        x: to.x,
        y: to.y,
        alpha: { from: 0.2, to: 1 },
        delay: o.delay * s,
        duration: o.ms * s,
        ease: 'Quad.easeIn',
        onComplete: () => {
          img.destroy();
          resolve();
        },
      });
    });
  }

  /** Ventisca de copos sobre un área durante un rato. */
  blizzard(area: readonly Vec[], colors: number[], ms: number): void {
    const xs = area.map((t) => tileRect(t).x);
    const ys = area.map((t) => tileRect(t).y);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs) + TW;
    const y0 = Math.min(...ys);
    const em = this.track(
      this.scene.add.particles(0, 0, 'fx-flake-small', {
        x: { min: x0 - 20, max: x1 + 20 },
        y: { min: y0 - 70, max: y0 - 10 },
        speedX: { min: -70, max: 70 },
        speedY: { min: 90, max: 200 },
        lifespan: 900,
        frequency: this.calm ? 60 : 22,
        scale: { start: 0.55, end: 0.2 },
        alpha: { start: 1, end: 0 },
        rotate: { min: 0, max: 360 },
        tint: colors,
      }),
    );
    em.setDepth(2060);
    this.scene.time.delayedCall(ms * this.speed, () => em.stop());
    this.scene.time.delayedCall(ms * this.speed + 1000, () => em.destroy());
  }
}

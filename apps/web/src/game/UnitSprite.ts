import type { StatusKind, Vec } from '@ventisca/core';
import * as Phaser from 'phaser';
import { hex, PALETTE } from '../art/palette';
import type { RigDef } from '../art/rigs';
import { footPoint } from './layout';
import { type Clip, type Playback, Rig } from './rig/Rig';

const INK = hex(PALETTE.ink);
const STATUS_ORDER: StatusKind[] = ['shield', 'boost', 'stun', 'burn'];
const NOOP: Playback = { done: Promise.resolve(), marker: () => Promise.resolve() };

export interface UnitSpriteOptions {
  id: string;
  kind: 'ninja' | 'enemy';
  rig: RigDef;
  clips: Readonly<Record<string, Clip>>;
  /** Figura de caído (solo ninjas). */
  koTexture?: string;
  size: { w: number; h: number };
  pos: Vec;
  hp: number;
  maxHp: number;
  barColor: number;
  /** Multiplicador de duración de los clips (animaciones reducidas y ?speed). */
  speed: number;
  /** Sin bucles de reposo (animaciones reducidas). */
  calm: boolean;
  /** Registra los efectos que quedan fuera del contenedor, para destruirlos si se interrumpe la partida. */
  track?: <T extends Phaser.GameObjects.GameObject>(obj: T) => T;
}

/** Una unidad en el tablero: esqueleto articulado, sombra, vida e íconos de estado. */
export class UnitSprite {
  readonly id: string;
  readonly kind: 'ninja' | 'enemy';
  readonly container: Phaser.GameObjects.Container;
  readonly rig: Rig;
  readonly size: { w: number; h: number };
  private readonly scene: Phaser.Scene;
  private readonly clips: Readonly<Record<string, Clip>>;
  private readonly bar: Phaser.GameObjects.Graphics;
  private readonly hpText: Phaser.GameObjects.Text;
  private readonly icons = new Map<StatusKind, Phaser.GameObjects.Image>();
  private readonly koImage: Phaser.GameObjects.Image | null;
  private koTween: Phaser.Tweens.Tween | null = null;
  private shieldBubble: Phaser.GameObjects.Image | null = null;
  private stunFx: { stars: Phaser.GameObjects.Image[]; tween: Phaser.Tweens.Tween } | null = null;
  private burnFx: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private readonly barColor: number;
  private readonly track: <T extends Phaser.GameObjects.GameObject>(obj: T) => T;
  private actSeq = 0;
  private busy = false;
  hp: number;
  maxHp: number;
  private shownHp: number;
  ko = false;
  stunned = false;
  speed: number;
  calm: boolean;

  constructor(scene: Phaser.Scene, o: UnitSpriteOptions) {
    this.scene = scene;
    this.id = o.id;
    this.kind = o.kind;
    this.size = o.size;
    this.clips = o.clips;
    this.barColor = o.barColor;
    this.track = o.track ?? ((obj) => obj);
    this.hp = o.hp;
    this.maxHp = o.maxHp;
    this.shownHp = o.hp;
    this.speed = o.speed;
    this.calm = o.calm;

    const shadow = scene.add.graphics();
    shadow.fillStyle(INK, 0.16);
    shadow.fillEllipse(0, 0, o.size.w * 0.74, 14);

    this.rig = new Rig(scene, o.rig, o.size.w);

    this.koImage = o.koTexture ? scene.add.image(0, 2, o.koTexture).setOrigin(0.5, 1).setVisible(false) : null;
    this.koImage?.setDisplaySize(o.size.w, o.size.h);

    this.bar = scene.add.graphics();
    this.hpText = scene.add
      .text(33, 12, '', {
        fontFamily: '"Zen Kaku Gothic New", system-ui, sans-serif',
        fontSize: '11px',
        fontStyle: '900',
        color: PALETTE.ink,
        resolution: 3,
      })
      .setOrigin(0, 0.5);

    const fp = footPoint(o.pos);
    const children: Phaser.GameObjects.GameObject[] = [shadow, this.rig.root];
    if (this.koImage) children.push(this.koImage);
    children.push(this.bar, this.hpText);
    this.container = scene.add.container(fp.x, fp.y, children);
    this.container.setDepth(fp.y);
    this.drawBar();
    this.startIdle();
  }

  get headY(): number {
    return this.container.y - this.size.h;
  }

  get centerY(): number {
    return this.container.y - this.size.h * 0.5;
  }

  center(): { x: number; y: number } {
    return { x: this.container.x, y: this.centerY };
  }

  /** Mano (o arma) en el mundo, para que los proyectiles salgan de donde está el brazo. */
  handPoint(): { x: number; y: number } {
    if (this.ko) return this.center();
    return this.rig.worldPoint(this.rig.has('weapon') ? 'weapon' : 'armFront');
  }

  /* ---------- Clips ---------- */

  /** Reproduce una acción y vuelve al reposo al terminar (si nada la interrumpió). */
  act(name: string): Playback {
    const clip = this.clips[name];
    if (!clip || this.ko) return NOOP;
    this.actSeq += 1;
    const seq = this.actSeq;
    this.busy = true;
    const pb = this.rig.play(clip, this.speed);
    void pb.done.then(() => {
      if (seq !== this.actSeq) return;
      this.busy = false;
      if (!this.ko && !clip.loop) this.startIdle();
    });
    return pb;
  }

  /** Bucle sostenido (moverse, celebrar) hasta que otra acción lo reemplace. */
  loop(name: string): void {
    const clip = this.clips[name];
    if (!clip || this.ko) return;
    this.actSeq += 1;
    this.busy = true;
    this.rig.play(clip, this.speed);
  }

  startIdle(): void {
    this.actSeq += 1;
    this.busy = false;
    if (this.ko || this.calm) {
      this.rig.stop();
      return;
    }
    const clip = (this.stunned ? this.clips.dazed : undefined) ?? this.clips.idle;
    if (!clip) {
      this.rig.stop();
      return;
    }
    // Cada unidad respira a su ritmo: así no se mueven todas al unísono.
    this.rig.play(clip, this.speed * (0.88 + Math.random() * 0.24));
  }

  private setStunned(on: boolean): void {
    if (this.stunned === on) return;
    this.stunned = on;
    if (!this.busy) this.startIdle();
  }

  /* ---------- Vida y estados ---------- */

  setTile(v: Vec): void {
    const fp = footPoint(v);
    this.container.setPosition(fp.x, fp.y).setDepth(fp.y);
  }

  private drawBar(): void {
    const g = this.bar;
    const w = 56;
    const frac = Math.max(0, Math.min(1, this.shownHp / this.maxHp));
    g.clear();
    g.fillStyle(INK, 0.9);
    g.fillRoundedRect(-w / 2 - 2, 7, w + 4, 10, 4);
    g.fillStyle(0xf6f9fb, 1);
    g.fillRoundedRect(-w / 2, 9, w, 6, 3);
    if (frac > 0) {
      const color = frac <= 0.3 ? hex(PALETTE.danger) : this.barColor;
      g.fillStyle(color, 1);
      g.fillRoundedRect(-w / 2, 9, Math.max(4, w * frac), 6, 3);
    }
    this.hpText.setText(`${Math.round(this.hp)}`);
  }

  setHp(hp: number, animateMs = 420): void {
    const from = this.shownHp;
    this.hp = hp;
    if (animateMs <= 0) {
      this.shownHp = hp;
      this.drawBar();
      return;
    }
    this.scene.tweens.addCounter({
      from,
      to: hp,
      duration: animateMs,
      ease: 'Cubic.easeOut',
      onUpdate: (tw) => {
        this.shownHp = tw.getValue() ?? hp;
        this.drawBar();
      },
      onComplete: () => {
        this.shownHp = hp;
        this.drawBar();
      },
    });
  }

  setStatus(status: StatusKind, on: boolean): void {
    const existing = this.icons.get(status);
    if (on && !existing) {
      const icon = this.scene.add.image(0, 0, `icon-${status}`);
      icon.setDisplaySize(18, 18);
      this.container.add(icon);
      this.icons.set(status, icon);
      icon.setScale(0);
      this.scene.tweens.add({ targets: icon, scale: 18 / 64, duration: 180, ease: 'Back.easeOut' });
    } else if (!on && existing) {
      this.icons.delete(status);
      this.scene.tweens.add({ targets: existing, alpha: 0, duration: 160, onComplete: () => existing.destroy() });
    }
    if (status === 'shield') this.setShieldBubble(on);
    if (status === 'stun') {
      this.setStunned(on);
      this.setStunFx(on);
    }
    if (status === 'burn') this.setBurnFx(on);
    this.layoutIcons();
  }

  private setShieldBubble(on: boolean): void {
    if (on && !this.shieldBubble) {
      const b = this.scene.add.image(0, -this.size.h * 0.48, 'fx-ring');
      b.setTint(0x4fc9b8).setAlpha(0.55);
      b.setDisplaySize(this.size.w * 1.15, this.size.h * 1.02);
      this.container.add(b);
      this.shieldBubble = b;
    } else if (!on && this.shieldBubble) {
      const b = this.shieldBubble;
      this.shieldBubble = null;
      this.scene.tweens.add({
        targets: b,
        alpha: 0,
        scale: b.scale * 1.25,
        duration: 220,
        onComplete: () => b.destroy(),
      });
    }
  }

  /** Estrellas que giran sobre la cabeza mientras está aturdido. */
  private setStunFx(on: boolean): void {
    if (on && !this.stunFx && !this.calm) {
      const cy = -this.size.h - 4;
      const stars = [0, 1, 2].map(() => {
        const img = this.scene.add.image(0, cy, 'fx-spark').setTint(0xf2b84b);
        img.setDisplaySize(13, 13);
        this.container.add(img);
        return img;
      });
      const base = stars[0]?.scale ?? 1;
      const tween = this.scene.tweens.addCounter({
        from: 0,
        to: Math.PI * 2,
        duration: 1100,
        repeat: -1,
        onUpdate: (tw) => {
          const a0 = tw.getValue() ?? 0;
          stars.forEach((img, i) => {
            const a = a0 + (i * Math.PI * 2) / 3;
            img.setPosition(Math.cos(a) * 22, cy + Math.sin(a) * 7);
            img.setScale(base * (0.75 + 0.35 * ((Math.sin(a) + 1) / 2)));
            img.setAngle((a * 180) / Math.PI);
          });
        },
      });
      this.stunFx = { stars, tween };
    } else if (!on && this.stunFx) {
      this.stunFx.tween.stop();
      for (const img of this.stunFx.stars) img.destroy();
      this.stunFx = null;
    }
  }

  /** Llamas de papel que suben mientras se quema. */
  private setBurnFx(on: boolean): void {
    if (on && !this.burnFx && !this.calm) {
      const em = this.scene.add.particles(0, -this.size.h * 0.45, 'fx-flame', {
        x: { min: -this.size.w * 0.28, max: this.size.w * 0.28 },
        y: { min: -this.size.h * 0.2, max: this.size.h * 0.25 },
        speedY: { min: -70, max: -35 },
        speedX: { min: -12, max: 12 },
        lifespan: 620,
        frequency: 85,
        scale: { start: 0.5, end: 0.05 },
        alpha: { start: 0.95, end: 0 },
        tint: [0xe4572e, 0xf2b84b, 0xf07a55],
      });
      this.container.add(em);
      this.burnFx = em;
    } else if (!on && this.burnFx) {
      const em = this.burnFx;
      this.burnFx = null;
      em.stop();
      this.scene.time.delayedCall(700, () => em.destroy());
    }
  }

  /** El escudo se agrieta al absorber un golpe (luego desaparece con su estado). */
  crackShield(): void {
    const b = this.shieldBubble;
    if (!b) return;
    b.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.scene.time.delayedCall(80, () => b.setTintMode(Phaser.TintModes.MULTIPLY).setTint(0x4fc9b8));
    const em = this.track(
      this.scene.add.particles(this.container.x, this.centerY, 'fx-bit', {
        speed: { min: 80, max: 200 },
        angle: { min: 0, max: 360 },
        lifespan: 450,
        scale: { start: 0.45, end: 0.05 },
        alpha: { start: 1, end: 0 },
        rotate: { min: 0, max: 360 },
        tint: [0x4fc9b8, 0xd9f4ef, 0xffffff],
        emitting: false,
      }),
    );
    em.setDepth(2100);
    em.explode(12);
    this.scene.time.delayedCall(900, () => em.destroy());
  }

  private layoutIcons(): void {
    const list = STATUS_ORDER.filter((s) => this.icons.has(s));
    list.forEach((s, i) => {
      this.icons.get(s)?.setPosition((i - (list.length - 1) / 2) * 20, -this.size.h - 10);
    });
  }

  flash(): void {
    this.rig.tintFill(0xffffff);
    this.scene.time.delayedCall(90, () => this.rig.clearTint());
  }

  /* ---------- Caída y reanimación ---------- */

  /** Cambia al instante entre figura en pie y figura de caído. */
  setKo(ko: boolean): void {
    this.ko = ko;
    this.koTween?.stop();
    this.koTween = null;
    if (ko) {
      this.actSeq += 1;
      this.busy = false;
      this.rig.stop();
      this.rig.root.setVisible(false);
      const k = this.koImage;
      if (k) {
        k.setVisible(true).setAlpha(1);
        k.setDisplaySize(this.size.w, this.size.h);
        if (!this.calm) {
          this.koTween = this.scene.tweens.add({
            targets: k,
            scaleY: k.scaleY * 1.03,
            duration: 1300,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
        }
      }
      this.hpText.setAlpha(0.5);
    } else {
      this.koImage?.setVisible(false);
      this.rig.root.setVisible(true).setAlpha(1);
      this.hpText.setAlpha(1);
    }
  }

  /** Clip de desplome y fundido a la figura de caído. */
  async fallDown(crossfadeMs = 160): Promise<void> {
    await this.act('koStart').done;
    const k = this.koImage;
    if (!k) {
      this.setKo(true);
      return;
    }
    k.setVisible(true).setAlpha(0);
    k.setDisplaySize(this.size.w, this.size.h);
    await new Promise<void>((resolve) => {
      this.scene.tweens.add({ targets: this.rig.root, alpha: 0, duration: crossfadeMs * this.speed });
      this.scene.tweens.add({ targets: k, alpha: 1, duration: crossfadeMs * this.speed, onComplete: () => resolve() });
    });
    this.setKo(true);
  }

  /** Se levanta desde la figura de caído con el clip de revivido. */
  getUp(): Playback {
    const k = this.koImage;
    this.koTween?.stop();
    this.koTween = null;
    this.ko = false;
    this.rig.root.setVisible(true).setAlpha(1);
    this.hpText.setAlpha(1);
    if (k) {
      this.scene.tweens.add({
        targets: k,
        alpha: 0,
        duration: 140 * this.speed,
        onComplete: () => k.setVisible(false),
      });
    }
    return this.act('revived');
  }

  destroy(): void {
    this.koTween?.stop();
    this.stunFx?.tween.stop();
    this.burnFx?.stop();
    this.rig.stop(false);
    this.container.destroy();
  }
}

import {
  difficultyConfig,
  ELEMENTS,
  type ElementKind,
  type GameEvent,
  type MatchState,
  type Vec,
} from '@ventisca/core';
import * as Phaser from 'phaser';
import { ELEMENT_COLORS, hex, ICE, PALETTE } from '../art/palette';
import { golemRig, ninjaRig } from '../art/rigs';
import { audio } from '../audio/audio';
import { ES } from '../i18n/es';
import { clickTile, setHover, undo } from '../state/actions';
import { type AimLine, boardLayers, type TargetOption } from '../state/board';
import { bridge } from '../state/bridge';
import { type AppState, type Overlay, type ResolveStep, store } from '../state/store';
import { Fx } from './fx';
import {
  aimPoint,
  BOARD_X,
  BOARD_Y,
  FIGURE_SINK,
  footPoint,
  orderPoint,
  RES,
  TH,
  TW,
  tileAt,
  tileCenter,
  tileRect,
  UNIT_SIZE,
} from './layout';
import { GOLEM_CLIPS, NINJA_CLIPS } from './rig/clips';
import { URL_SPEED } from './speed';
import { cardCinematicMs, FAST_FACTOR, markerMs, TIMING } from './timing';
import { UnitSprite } from './UnitSprite';

const INK = hex(PALETTE.ink);
const RED = hex(PALETTE.danger);
const MINT = hex(ELEMENT_COLORS.snow.base);
const GOLD = hex(PALETTE.gold);
const WHITE = hex(PALETTE.paperLight);
const GREEN = hex(PALETTE.ok);

type Pt = { x: number; y: number };
type Apply = (e: GameEvent) => void;

const isNinjaId = (id: string): id is ElementKind => (ELEMENTS as readonly string[]).includes(id);
const elementColors = (el: ElementKind): number[] => {
  const c = ELEMENT_COLORS[el];
  return [hex(c.base), hex(c.light), hex(c.accent), hex(c.dark)];
};
const ICE_COLORS = [hex(ICE.white), hex(ICE.light), hex(ICE.base), hex(ICE.glow)];
/**
 * Anillo sobre un objetivo (radio y grosor) y radio del punto de cada ninja que lo eligió. El anillo
 * rodea a la figura sin taparla y cabe en su casilla.
 */
const MARK = { ring: 29, ringWidth: 4, dot: 5 } as const;

export class BattleScene extends Phaser.Scene {
  private readonly images: Map<string, HTMLImageElement>;
  private bg!: Phaser.GameObjects.Image;
  private hl!: Phaser.GameObjects.Graphics;
  private ov!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.GameObject[] = [];
  private readonly ghosts = new Map<ElementKind, Phaser.GameObjects.Image>();
  private readonly units = new Map<string, UnitSprite>();
  private rocks: Phaser.GameObjects.Image[] = [];
  private readonly channels = new Map<string, Phaser.GameObjects.Image>();
  private generation = 0;
  private readonly pending = new Set<() => void>();
  private speed = 1;
  private overlayKey = 0;
  private flightKey = 0;
  private fx!: Fx;

  constructor(images: Map<string, HTMLImageElement>) {
    super({ key: 'battle' });
    this.images = images;
  }

  create(): void {
    for (const [k, img] of this.images) if (!this.textures.exists(k)) this.textures.addImage(k, img);
    const cam = this.cameras.main;
    cam.setZoom(RES);
    cam.centerOn(640, 360);

    this.bg = this.add.image(640, 360, 'bg-cumbre').setDepth(-100);
    this.bg.setDisplaySize(1280, 720);
    this.drawBoard();
    this.hl = this.add.graphics().setDepth(-5);
    this.ov = this.add.graphics().setDepth(1500);
    for (const el of ELEMENTS) {
      // El fantasma de un destino planeado es una silueta sin relleno.
      const g = this.add.image(0, 0, `ninja-${el}-outline`).setOrigin(0.5, 1).setVisible(false);
      g.setDisplaySize(UNIT_SIZE.ninja.w, UNIT_SIZE.ninja.h);
      this.ghosts.set(el, g);
    }

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const w = this.cameras.main.getWorldPoint(p.x, p.y);
      setHover(tileAt(w.x, w.y));
    });
    this.input.on('gameout', () => setHover(null));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      audio.unlock();
      if (p.rightButtonDown()) {
        undo();
        return;
      }
      const w = this.cameras.main.getWorldPoint(p.x, p.y);
      const t = tileAt(w.x, w.y);
      if (t) clickTile(t);
    });

    const unsubscribe = store.subscribe((s, prev) => {
      if (
        s.phase !== prev.phase ||
        s.plans !== prev.plans ||
        s.active !== prev.active ||
        s.step !== prev.step ||
        s.pendingCard !== prev.pendingCard ||
        s.hover !== prev.hover ||
        s.match !== prev.match ||
        s.screen !== prev.screen
      ) {
        this.redrawPlanning();
      }
      if (
        s.settings.reducedMotion !== prev.settings.reducedMotion ||
        s.settings.fastAnimations !== prev.settings.fastAnimations
      ) {
        this.applyMotionSetting(s);
      }
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);
    this.applyMotionSetting(store.getState());
    this.fx = new Fx(this, { speed: () => this.speed, calm: () => this.calm() });
    bridge.setScene(this);
    // Acceso para depurar poses y para las pruebas visuales (solo en desarrollo).
    if (import.meta.env.DEV) (window as unknown as { __ventiscaScene?: BattleScene }).__ventiscaScene = this;
  }

  private applyMotionSetting(s: AppState): void {
    this.speed = (s.settings.reducedMotion ? 0.55 : 1) * (s.settings.fastAnimations ? FAST_FACTOR : 1) * URL_SPEED;
    for (const u of this.units.values()) {
      u.speed = this.speed;
      u.calm = s.settings.reducedMotion;
      if (!u.ko) u.startIdle();
    }
  }

  private calm(): boolean {
    return store.getState().settings.reducedMotion;
  }

  /* ---------- Tablero ---------- */

  private drawBoard(): void {
    const g = this.add.graphics().setDepth(-50);
    const w = 9 * TW;
    const h = 5 * TH;
    g.fillStyle(INK, 0.14);
    g.fillRoundedRect(BOARD_X - 6, BOARD_Y - 2, w + 20, h + 20, 14);
    g.fillStyle(0xd7e2ec, 1);
    g.fillRoundedRect(BOARD_X - 12, BOARD_Y - 12, w + 24, h + 24, 14);
    g.lineStyle(3, INK, 1);
    g.strokeRoundedRect(BOARD_X - 12, BOARD_Y - 12, w + 24, h + 24, 14);
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 9; x++) {
        const r = tileRect({ x, y });
        g.fillStyle((x + y) % 2 === 0 ? 0xf8fbfd : 0xeef3f8, 1);
        g.fillRoundedRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6, 7);
        g.lineStyle(1.4, 0xdde6ee, 1);
        g.lineBetween(r.x + 10, r.y + r.h - 10, r.x + r.w - 10, r.y + 10);
        g.lineStyle(1.6, 0xbfcedc, 1);
        g.strokeRoundedRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6, 7);
      }
    }
  }

  /* ---------- Partida ---------- */

  currentGeneration(): number {
    return this.generation;
  }

  isCurrent(gen: number): boolean {
    return gen === this.generation;
  }

  /** Detiene cualquier animación en curso (reinicio o salida al menú). */
  abort(): void {
    this.generation += 1;
    for (const done of [...this.pending]) done();
    this.pending.clear();
    this.tweens.killAll();
    this.time.removeAllEvents();
    // Los efectos se destruían al terminar sus animaciones, que acaban de morir.
    this.fx?.clear();
    if (this.scene.isPaused()) this.scene.resume();
    store.setState({ overlay: null, flights: [], incoming: [], arrived: [] });
  }

  setPaused(paused: boolean): void {
    if (paused) this.scene.pause();
    else this.scene.resume();
  }

  /** Prepara el tablero para una partida nueva. Devuelve su generación. */
  setupMatch(view: MatchState): number {
    this.abort();
    this.applyMotionSetting(store.getState());
    for (const u of this.units.values()) u.destroy();
    this.units.clear();
    for (const r of this.rocks) r.destroy();
    this.rocks = [];
    for (const c of this.channels.values()) c.destroy();
    this.channels.clear();

    this.bg.setTexture(`bg-${view.mapId}`);
    this.bg.setDisplaySize(1280, 720);
    for (const r of view.rocks) {
      const fp = footPoint(r);
      const img = this.add.image(fp.x, fp.y + 3, 'rock').setOrigin(0.5, 1);
      img.setDisplaySize(UNIT_SIZE.rock.w, UNIT_SIZE.rock.h);
      img.setDepth(fp.y);
      this.rocks.push(img);
    }
    for (const n of view.ninjas) {
      const u = this.makeNinja(n.id, n.pos, n.hp, n.maxHp);
      if (n.hp <= 0) u.setKo(true);
    }
    for (const e of view.enemies) this.makeEnemy(e.id, e.kind, e.pos, e.hp, e.maxHp);
    this.redrawPlanning();
    return this.generation;
  }

  private makeNinja(id: ElementKind, pos: Vec, hp: number, maxHp: number): UnitSprite {
    const u = new UnitSprite(this, {
      id,
      kind: 'ninja',
      rig: ninjaRig(id),
      clips: NINJA_CLIPS[id],
      koTexture: `ninja-${id}-ko`,
      size: UNIT_SIZE.ninja,
      pos,
      hp,
      maxHp,
      barColor: hex(ELEMENT_COLORS[id].base),
      speed: this.speed,
      calm: this.calm(),
      track: (obj) => this.fx.track(obj),
    });
    this.units.set(id, u);
    return u;
  }

  private makeEnemy(
    id: string,
    kind: 'sniper' | 'artillery' | 'colossus',
    pos: Vec,
    hp: number,
    maxHp: number,
  ): UnitSprite {
    const u = new UnitSprite(this, {
      id,
      kind: 'enemy',
      rig: golemRig(kind),
      clips: GOLEM_CLIPS[kind],
      size: UNIT_SIZE[kind],
      pos,
      hp,
      maxHp,
      barColor: hex(ICE.deep),
      speed: this.speed,
      calm: this.calm(),
      track: (obj) => this.fx.track(obj),
    });
    this.units.set(id, u);
    return u;
  }

  /* ---------- Planificación (§9.3) ---------- */

  private clearLabels(): void {
    for (const l of this.labels) l.destroy();
    this.labels = [];
  }

  private badge(at: Pt, text: string, color: number): void {
    const g = this.add.graphics().setDepth(1600);
    g.fillStyle(color, 1);
    g.fillCircle(at.x, at.y, 11);
    g.lineStyle(2.5, INK, 1);
    g.strokeCircle(at.x, at.y, 11);
    const t = this.add
      .text(at.x, at.y + 0.5, text, {
        fontFamily: '"Dela Gothic One", "Zen Kaku Gothic New", system-ui, sans-serif',
        fontSize: '13px',
        color: '#FFFFFF',
        resolution: 3,
      })
      .setOrigin(0.5)
      .setDepth(1601);
    this.labels.push(g, t);
  }

  private reticle(g: Phaser.GameObjects.Graphics, c: Pt, alpha: number, solid: boolean): void {
    g.lineStyle(solid ? 3.5 : 2.5, RED, alpha);
    g.strokeCircle(c.x, c.y, solid ? 16 : 13);
    const r = solid ? 23 : 19;
    const r2 = solid ? 10 : 8;
    g.lineBetween(c.x - r, c.y, c.x - r2, c.y);
    g.lineBetween(c.x + r2, c.y, c.x + r, c.y);
    g.lineBetween(c.x, c.y - r, c.x, c.y - r2);
    g.lineBetween(c.x, c.y + r2, c.x, c.y + r);
  }

  private plus(g: Phaser.GameObjects.Graphics, c: Pt, alpha: number, size = 8): void {
    g.fillStyle(MINT, alpha);
    g.lineStyle(2.5, INK, alpha);
    const s = size;
    const pts = [
      [-s / 3, -s],
      [s / 3, -s],
      [s / 3, -s / 3],
      [s, -s / 3],
      [s, s / 3],
      [s / 3, s / 3],
      [s / 3, s],
      [-s / 3, s],
      [-s / 3, s / 3],
      [-s, s / 3],
      [-s, -s / 3],
      [-s / 3, -s / 3],
    ].map(([x, y]) => new Phaser.Math.Vector2(c.x + (x as number), c.y + (y as number)));
    g.fillPoints(pts, true);
    g.strokePoints(pts, true);
  }

  private arrowUp(g: Phaser.GameObjects.Graphics, c: Pt, alpha: number): void {
    const pts = [
      [0, -12],
      [10, 0],
      [4, 0],
      [4, 10],
      [-4, 10],
      [-4, 0],
      [-10, 0],
    ].map(([x, y]) => new Phaser.Math.Vector2(c.x + (x as number), c.y + (y as number)));
    g.fillStyle(GOLD, alpha);
    g.lineStyle(2.5, INK, alpha);
    g.fillPoints(pts, true);
    g.strokePoints(pts, true);
  }

  /** Anillo sobre un objetivo, con borde de tinta para leerse sobre cualquier figura. */
  private ring(g: Phaser.GameObjects.Graphics, c: Pt, color: number, width: number = MARK.ringWidth): void {
    g.lineStyle(width + 3, INK, 1);
    g.strokeCircle(c.x, c.y, MARK.ring);
    g.lineStyle(width, color, 1);
    g.strokeCircle(c.x, c.y, MARK.ring);
  }

  /**
   * Un objetivo del paso de actuar: anillo rojo sobre un gólem y blanco sobre un aliado; verde, y más
   * grueso, el que ya se eligió. Curar y revivir llevan además su cruz y su flecha: la forma dice qué
   * acción es, no solo el color.
   */
  private target(g: Phaser.GameObjects.Graphics, option: TargetOption, chosen: boolean): void {
    const at = aimPoint(option.at);
    const color = chosen ? GREEN : option.kind === 'attack' ? RED : WHITE;
    this.ring(g, at, color, chosen ? MARK.ringWidth + 2 : MARK.ringWidth);
    // La cruz o la flecha van sobre el anillo, abajo a la derecha, para no tapar al aliado.
    const d = MARK.ring * Math.SQRT1_2;
    const mark = { x: at.x + d, y: at.y + d };
    if (option.kind === 'heal') this.plus(g, mark, 1, 7);
    if (option.kind === 'revive') this.arrowUp(g, mark, 1);
  }

  /** Un punto por cada ninja que eligió ese objetivo, en lo alto del anillo. */
  private dots(g: Phaser.GameObjects.Graphics, c: Pt, colors: number[]): void {
    const y = c.y - MARK.ring;
    colors.forEach((color, i) => {
      const x = c.x + (i - (colors.length - 1) / 2) * (MARK.dot * 2 + 3);
      g.fillStyle(color, 1);
      g.fillCircle(x, y, MARK.dot);
      g.lineStyle(2, INK, 1);
      g.strokeCircle(x, y, MARK.dot);
    });
  }

  /** Línea de mira de una acción planeada, en el color de quien actúa. */
  private aimLine(g: Phaser.GameObjects.Graphics, aim: AimLine): void {
    const a = aimPoint(aim.from);
    const b = aimPoint(aim.to);
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    // Sale del borde del cuerpo de quien actúa y llega al borde del anillo del objetivo.
    const start = 12;
    const end = length - MARK.ring - MARK.ringWidth;
    if (end <= start) return;
    const ux = (b.x - a.x) / length;
    const uy = (b.y - a.y) / length;
    const from = { x: a.x + ux * start, y: a.y + uy * start };
    const to = { x: a.x + ux * end, y: a.y + uy * end };
    g.lineStyle(6, INK, 0.35);
    g.lineBetween(from.x, from.y, to.x, to.y);
    g.lineStyle(3, hex(ELEMENT_COLORS[aim.by].base), 1);
    g.lineBetween(from.x, from.y, to.x, to.y);
  }

  /** El borde de una casilla, sin relleno y con tinta alrededor: no tiñe lo que tenga debajo. */
  private outline(g: Phaser.GameObjects.Graphics, t: Vec, color: number): void {
    const r = tileRect(t);
    g.lineStyle(6, INK, 0.5);
    g.strokeRoundedRect(r.x + 8, r.y + 8, r.w - 16, r.h - 16, 7);
    g.lineStyle(3, color, 1);
    g.strokeRoundedRect(r.x + 8, r.y + 8, r.w - 16, r.h - 16, 7);
  }

  /** Una casilla resaltada: relleno y borde, dentro del papel de la casilla. */
  private tile(
    g: Phaser.GameObjects.Graphics,
    t: Vec,
    fill: number,
    fillAlpha: number,
    line: number,
    lineAlpha: number,
  ) {
    const r = tileRect(t);
    g.fillStyle(fill, fillAlpha);
    g.fillRoundedRect(r.x + 6, r.y + 6, r.w - 12, r.h - 12, 8);
    g.lineStyle(2, line, lineAlpha);
    g.strokeRoundedRect(r.x + 6, r.y + 6, r.w - 12, r.h - 12, 8);
  }

  /**
   * Dibuja las capas del tablero (state/board.ts): aquí no se decide qué se muestra, solo cómo. El
   * tablero ofrece un solo modo a la vez: casillas para moverse, anillos para actuar o casillas rojas
   * para colocar una carta.
   */
  redrawPlanning(): void {
    const hl = this.hl;
    const ov = this.ov;
    if (!hl || !ov) return;
    hl.clear();
    ov.clear();
    this.clearLabels();
    for (const g of this.ghosts.values()) g.setVisible(false);
    const layers = boardLayers(store.getState());
    if (!layers) return;
    const colorOf = (el: ElementKind) => hex(ELEMENT_COLORS[el].base);

    // Modo moverse: el alcance del gólem que está bajo el ratón.
    for (const t of layers.threat) {
      const r = tileRect(t);
      hl.fillStyle(RED, 0.1);
      hl.fillRoundedRect(r.x + 5, r.y + 5, r.w - 10, r.h - 10, 6);
      hl.lineStyle(2, RED, 0.45);
      hl.strokeRoundedRect(r.x + 5, r.y + 5, r.w - 10, r.h - 10, 6);
    }

    if (layers.active) {
      const c = ELEMENT_COLORS[layers.active.ninja];
      const fp = footPoint(layers.active.at);
      hl.lineStyle(4, hex(c.base), 1);
      hl.strokeEllipse(fp.x, fp.y + 1, 64, 18);

      // Modo moverse: las casillas a las que puede ir, en el color suave del ninja activo. La suya es
      // quedarse.
      for (const t of layers.moves) {
        this.tile(hl, t, hex(c.soft), 1, hex(c.base), 0.4);
        const tc = tileCenter(t);
        hl.fillStyle(hex(c.base), 0.6);
        hl.fillCircle(tc.x, tc.y + 8, 4.5);
      }
      if (layers.stay) this.tile(hl, layers.stay, hex(c.soft), 1, hex(c.base), 0.4);
      // Modo moverse, con el ratón sobre un caído: las casillas desde las que se le revive (R-09). Solo un
      // borde blanco, el color de lo que se hace por un aliado: así no se mezcla con el de las casillas.
      for (const t of layers.reviveSpots) this.outline(hl, t, WHITE);

      // Modo carta: casillas rojas donde se puede colocar; bajo el ratón, el área y a quién alcanza.
      if (layers.card) {
        for (const t of layers.card.tiles) this.tile(hl, t, RED, 0.12, RED, 0.5);
        for (const t of layers.card.area) {
          const r = tileRect(t);
          hl.fillStyle(RED, 0.3);
          hl.fillRoundedRect(r.x + 4, r.y + 4, r.w - 8, r.h - 8, 7);
        }
        for (const t of layers.card.enemies) this.reticle(ov, aimPoint(t), 0.9, true);
        for (const t of layers.card.allies) this.plus(ov, aimPoint(t), 0.9);
      }
    }

    // Planes: el fantasma de cada ninja y, solo para el activo, el camino hasta él.
    for (const ghost of layers.ghosts) {
      const fp = footPoint(ghost.at);
      this.ghosts
        .get(ghost.ninja)
        ?.setPosition(fp.x, fp.y + FIGURE_SINK)
        .setVisible(true)
        .setDepth(fp.y - 0.5);
    }
    if (layers.path) {
      const color = colorOf(layers.path.ninja);
      // Va por la línea de los pies: pasa bajo el ninja y bajo su fantasma, sin taparlos.
      const pts = layers.path.tiles.map((v) => {
        const fp = footPoint(v);
        return new Phaser.Math.Vector2(fp.x, fp.y - 1);
      });
      hl.lineStyle(5, color, 0.75);
      hl.strokePoints(pts, false);
    }
    // Las cartas ya colocadas: su valor en la casilla del centro y, si toca mostrarla, su área.
    for (const card of layers.cards) {
      const c = ELEMENT_COLORS[card.ninja];
      if (card.area.length > 0) {
        for (const t of card.area) {
          const r = tileRect(t);
          hl.fillStyle(hex(c.base), 0.22);
          hl.fillRoundedRect(r.x + 4, r.y + 4, r.w - 8, r.h - 8, 7);
        }
        const tl = tileRect({ x: Math.max(0, card.at.x - 1), y: Math.max(0, card.at.y - 1) });
        const br = tileRect({ x: Math.min(8, card.at.x + 1), y: Math.min(4, card.at.y + 1) });
        ov.lineStyle(4, hex(c.dark), 0.95);
        ov.strokeRoundedRect(tl.x + 3, tl.y + 3, br.x + br.w - tl.x - 6, br.y + br.h - tl.y - 6, 10);
      }
      this.badge(tileCenter(card.at), `${card.value ?? ''}`, hex(c.dark));
    }

    // Las líneas de mira van debajo de los anillos: solo las que pide el ratón.
    for (const aim of layers.aims) this.aimLine(ov, aim);

    // Modo actuar: un anillo sobre cada objetivo posible y, en verde, sobre el elegido.
    for (const option of layers.options) this.target(ov, option, false);
    if (layers.chosen) this.target(ov, layers.chosen, true);

    // Un punto por cada ninja sobre el objetivo de su acción: es lo que queda de los planes de los demás.
    for (const d of layers.dots) this.dots(ov, aimPoint(d.at), d.by.map(colorOf));

    // D-32: el orden real de R-11, en la casilla desde la que actúa cada ninja; sin acción no hay número.
    for (const o of layers.order) this.badge(orderPoint(o.at), `${o.n}`, colorOf(o.ninja));

    if (layers.hover) {
      const r = tileRect(layers.hover);
      ov.lineStyle(2.5, INK, 0.55);
      ov.strokeRoundedRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6, 7);
    }
  }

  /* ---------- Animador de eventos (§10.2) ---------- */

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        this.pending.delete(done);
        resolve();
      };
      this.pending.add(done);
      this.time.delayedCall(ms * this.speed, done);
    });
  }

  private tween(cfg: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        this.pending.delete(done);
        resolve();
      };
      this.pending.add(done);
      const duration = typeof cfg.duration === 'number' ? cfg.duration * this.speed : 300 * this.speed;
      this.tweens.add({ ...cfg, duration, onComplete: done });
    });
  }

  private async showOverlay(overlay: NonNullable<Overlay>, ms: number): Promise<void> {
    // Mientras se acelera, los carteles se omiten.
    if (store.getState().boosting) {
      await this.wait(ms * 0.2);
      return;
    }
    this.overlayKey += 1;
    store.setState({ overlay: { ...overlay, key: this.overlayKey, ms: ms * this.speed } });
    await this.wait(ms);
    store.setState({ overlay: null });
  }

  /** Acelerar la resolución (mantener Espacio o el botón). */
  setBoost(on: boolean): void {
    this.fx?.setBaseTimeScale(on ? 3 : 1);
  }

  /** Marca en qué parte de la resolución va el turno (para el consejo en pantalla). */
  private trackStep(e: GameEvent): void {
    let step: ResolveStep = null;
    if ((e.t === 'move' && !isNinjaId(e.unitId)) || e.t === 'enemyAttack' || e.t === 'enemySkip') step = 'enemies';
    else if (
      (e.t === 'damage' && e.cause === 'burn') ||
      e.t === 'roundEnd' ||
      e.t === 'bonusCheck' ||
      e.t === 'matchEnd'
    ) {
      step = 'end';
    }
    const st = store.getState();
    if (step && st.phase === 'resolving' && st.resolveStep !== step) store.setState({ resolveStep: step });
  }

  /** Anillo breve bajo quien actúa. */
  private actorRing(u: UnitSprite | undefined): void {
    if (!u) return;
    const color = isNinjaId(u.id) ? hex(ELEMENT_COLORS[u.id].base) : hex(ICE.base);
    this.fx.actor({ x: u.container.x, y: u.container.y }, color);
  }

  async playEvents(events: GameEvent[], applyEvent: Apply, gen = this.generation): Promise<void> {
    // Si la partida se interrumpe (reiniciar o salir), la animación en curso termina su paso
    // actual: sus eventos ya no deben tocar el estado presentado de la partida nueva.
    const apply: Apply = (e) => {
      if (this.isCurrent(gen)) applyEvent(e);
    };
    let i = 0;
    // Cartas cuyo gesto y vuelo ocurrieron durante el cartel del combo.
    const primed = new Set<string>();
    while (i < events.length) {
      if (!this.isCurrent(gen)) return;
      const e = events[i] as GameEvent;
      this.trackStep(e);
      if (e.t === 'move' && isNinjaId(e.unitId)) {
        const group: Extract<GameEvent, { t: 'move' }>[] = [];
        while (i < events.length) {
          const x = events[i] as GameEvent;
          if (x.t !== 'move' || !isNinjaId(x.unitId)) break;
          group.push(x);
          i += 1;
        }
        audio.play('move');
        await Promise.all(group.map((g) => this.animMove(g.unitId, g.path, TIMING.ninjaStep)));
        for (const g of group) apply(g);
        continue;
      }
      if (e.t === 'damage' && e.cause === 'burn') {
        // Todas las quemaduras del final del turno arden a la vez.
        const group: GameEvent[] = [];
        while (i < events.length) {
          const x = events[i] as GameEvent;
          const related =
            (x.t === 'damage' && x.cause === 'burn') || x.t === 'ko' || (x.t === 'status' && x.status === 'burn');
          if (!related) break;
          group.push(x);
          i += 1;
        }
        await this.animBurns(group, apply);
        continue;
      }
      i += 1;
      if (e.t === 'combo') {
        // Los ninjas del combo alzan sus cartas a la vez durante el cartel.
        const cards = events
          .slice(i)
          .filter((x): x is Extract<GameEvent, { t: 'card' }> => x.t === 'card')
          .slice(0, e.elements.length);
        for (const c of cards) {
          primed.add(c.card.id);
          this.units.get(c.ninjaId)?.act('power');
        }
        audio.play('combo');
        await this.showOverlay({ kind: 'combo', elements: e.elements, key: 0, ms: 0 }, TIMING.comboOverlay);
        apply(e);
        continue;
      }
      if (e.t === 'card') {
        await this.animCard(e, primed.delete(e.card.id));
        apply(e);
        continue;
      }
      if (e.t === 'status') {
        this.units.get(e.unitId)?.setStatus(e.status, e.on);
        apply(e);
        if (e.on) {
          audio.play(e.status === 'stun' ? 'stun' : e.status === 'burn' ? 'burn' : 'shield');
          // Varios estados seguidos comparten una sola pausa.
          if ((events[i] as GameEvent | undefined)?.t !== 'status') await this.wait(TIMING.statusHold);
        }
        continue;
      }
      await this.animEvent(e, apply);
    }
  }

  private async animBurns(group: GameEvent[], apply: Apply): Promise<void> {
    let hit = false;
    const kos: string[] = [];
    for (const x of group) {
      if (x.t === 'damage') {
        const u = this.units.get(x.targetId);
        if (u) {
          hit = true;
          u.flash();
          u.act('hit');
          u.setHp(x.hp);
          this.fx.burst(u.center(), 'fx-flame', [0xe4572e, GOLD], 6, {
            up: true,
            gravity: -80,
            scale: 0.5,
            speed: 0.5,
          });
          this.floatText(u, `-${x.amount}`, PALETTE.gold);
        }
        apply(x);
      } else if (x.t === 'status') {
        this.units.get(x.unitId)?.setStatus(x.status, x.on);
        apply(x);
      } else if (x.t === 'ko') {
        kos.push(x.unitId);
      }
    }
    if (hit) {
      audio.play('burn');
      await this.wait(TIMING.damageHold);
    }
    if (kos.length > 0) {
      await Promise.all(kos.map((id) => this.animKo(id)));
      for (const x of group) if (x.t === 'ko') apply(x);
    }
  }

  private async animEvent(e: GameEvent, apply: Apply): Promise<void> {
    switch (e.t) {
      case 'turnStart':
      case 'meter':
        apply(e);
        return;
      case 'move':
        audio.play('move');
        this.actorRing(this.units.get(e.unitId));
        await this.animMove(e.unitId, e.path, TIMING.enemyStep);
        apply(e);
        return;
      case 'attack':
        await this.animNinjaAttack(e);
        apply(e);
        return;
      case 'heal':
        await this.animHeal(e);
        apply(e);
        return;
      case 'reviveStart': {
        const src = this.units.get(e.sourceId);
        this.actorRing(src);
        src?.act('reviveOther');
        this.startChannel(e.targetId);
        apply(e);
        await this.wait(TIMING.reviveStart);
        return;
      }
      case 'revive':
        this.stopChannel(e.targetId);
        await this.animRevive(e);
        apply(e);
        return;
      case 'damage':
        await this.animDamage(e);
        apply(e);
        return;
      case 'ko':
        await this.animKo(e.unitId);
        apply(e);
        return;
      case 'draw': {
        audio.play('draw');
        // La carta vuela del ninja a su mano (o a su panel) en la interfaz.
        const u = this.units.get(e.ninjaId);
        if (u && !this.calm() && !store.getState().boosting) {
          this.flightKey += 1;
          const flight = {
            id: this.flightKey,
            ninja: e.ninjaId,
            cardId: e.card.id,
            element: e.card.element,
            value: e.card.value,
            from: { x: u.container.x, y: u.headY - 4 },
            ms: 640 * this.speed,
          };
          store.setState((st) => ({ flights: [...st.flights, flight], incoming: [...st.incoming, e.card.id] }));
        }
        apply(e);
        return;
      }
      case 'enemyAttack':
        await this.animEnemyAttack(e);
        apply(e);
        return;
      case 'enemySkip':
        await this.animSkip(e.unitId);
        apply(e);
        return;
      case 'roundEnd':
        apply(e);
        await this.wait(TIMING.roundEnd);
        return;
      case 'roundStart': {
        apply(e);
        const view = store.getState().view;
        audio.play(e.round === 'bonus' ? 'bonus' : 'round');
        await this.showOverlay(
          {
            kind: 'round',
            round: e.round,
            condition: view?.bonusCondition ?? 'noKo',
            turnLimit: view ? difficultyConfig(view.difficulty).bonusTurnLimit : 0,
            // Turno que se va a planificar al terminar el cartel (el motor ya resolvió el actual).
            turn: (store.getState().match?.turn ?? 0) + 1,
            key: 0,
            ms: 0,
          },
          TIMING.roundBanner,
        );
        await this.spawnEnemies(e.enemies);
        return;
      }
      case 'bonusCheck':
        if (e.met) audio.play('bonus');
        await this.showOverlay(
          { kind: 'bonus', met: e.met, condition: e.condition, key: 0, ms: 0 },
          TIMING.bonusBanner,
        );
        apply(e);
        return;
      case 'matchEnd':
        apply(e);
        await this.animMatchEnd(e.status === 'victory');
        return;
      default:
        apply(e);
    }
  }

  private async animMove(id: string, path: Vec[], msPerStep: number): Promise<void> {
    const u = this.units.get(id);
    if (!u || path.length < 2) return;
    u.loop('move');
    for (let i = 1; i < path.length; i++) {
      const fp = footPoint(path[i] as Vec);
      await this.tween({
        targets: u.container,
        x: fp.x,
        y: fp.y,
        duration: msPerStep,
        ease: 'Sine.easeInOut',
        onUpdate: () => u.container.setDepth(u.container.y),
      });
      this.fx.dust(fp, u.size.w >= UNIT_SIZE.colossus.w ? 4 : 2);
    }
    u.startIdle();
  }

  private projectile(
    texture: string,
    from: Pt,
    to: Pt,
    ms: number,
    opts: {
      arc?: number;
      spin?: number;
      rotate?: boolean;
      size: [number, number];
      delay?: number;
      trail?: { texture: string; colors: number[] };
    },
  ): Promise<void> {
    return new Promise((resolve) => {
      const img = this.fx.track(this.add.image(from.x, from.y, texture)).setDepth(2000);
      img.setDisplaySize(opts.size[0], opts.size[1]);
      const stopTrail = opts.trail ? this.fx.trail(img, opts.trail.texture, opts.trail.colors) : null;
      const done = () => {
        this.pending.delete(done);
        stopTrail?.();
        img.destroy();
        resolve();
      };
      this.pending.add(done);
      const arc = opts.arc ?? 0;
      let prev = { x: from.x, y: from.y };
      this.tweens.addCounter({
        from: 0,
        to: 1,
        delay: (opts.delay ?? 0) * this.speed,
        duration: ms * this.speed,
        ease: 'Sine.easeIn',
        onUpdate: (tw) => {
          const t = tw.getValue() ?? 0;
          const x = from.x + (to.x - from.x) * t;
          const y = from.y + (to.y - from.y) * t + arc * 4 * t * (1 - t);
          if (opts.rotate) img.setRotation(Math.atan2(y - prev.y, x - prev.x));
          if (opts.spin) img.setAngle(opts.spin * t);
          img.setPosition(x, y);
          prev = { x, y };
        },
        onComplete: done,
      });
    });
  }

  private burst(at: Pt, colors: number[], count: number, speed = 1): void {
    this.fx.burst(at, 'fx-bit', colors, count, { speed });
  }

  private floatText(u: UnitSprite, text: string, color: string, big = false): void {
    this.fx.number(u, text, color, big);
  }

  private async lunge(src: UnitSprite, dst: UnitSprite, frac: number, ms: number): Promise<void> {
    const x0 = src.container.x;
    const y0 = src.container.y;
    const x1 = x0 + (dst.container.x - x0) * frac;
    const y1 = y0 + (dst.container.y - y0) * frac;
    await this.tween({ targets: src.container, x: x1, y: y1, duration: ms, ease: 'Quad.easeIn' });
    await this.tween({ targets: src.container, x: x0, y: y0, duration: ms * 1.3, ease: 'Quad.easeOut' });
  }

  private pulse(u: UnitSprite, color: number): void {
    const ring = this.fx
      .track(this.add.image(u.container.x, u.centerY, 'fx-ring'))
      .setTint(color)
      .setDepth(1990);
    ring.setDisplaySize(30, 30);
    this.tweens.add({
      targets: ring,
      scale: ring.scale * 3,
      alpha: { from: 0.9, to: 0 },
      duration: 420 * this.speed,
      onComplete: () => ring.destroy(),
    });
  }

  private async animNinjaAttack(e: Extract<GameEvent, { t: 'attack' }>): Promise<void> {
    const src = this.units.get(e.sourceId);
    const dst = this.units.get(e.targetId);
    if (!src || !dst) return;
    if (e.boosted) this.pulse(src, hex(ELEMENT_COLORS.water.light));
    const colors = elementColors(e.sourceId);
    const base = hex(ELEMENT_COLORS[e.sourceId].base);
    const size = e.boosted ? 70 : 52;
    this.actorRing(src);
    const pb = src.act('attack');
    if (e.sourceId === 'fire') {
      // El dardo sale del abanico justo en el latigazo, dejando una estela de brasas.
      await pb.marker('release');
      audio.play('attack-fire');
      await this.projectile('fx-dart', src.handPoint(), dst.center(), TIMING.projectile.fire, {
        arc: -40,
        rotate: true,
        size: [30, 10.5],
        trail: { texture: 'fx-bit', colors },
      });
      this.fx.impact(dst.center(), base, size);
      this.burst(dst.center(), colors, 8, 0.7);
      this.fx.hitStop(55);
    } else if (e.sourceId === 'water') {
      // Marea avanza mientras recoge el puño y golpea en el marcador.
      const lunge = this.lunge(src, dst, 0.45, TIMING.waterLunge);
      await pb.marker('release');
      audio.play('attack-water');
      this.fx.impact(dst.center(), base, size + 8);
      this.fx.burst(dst.center(), 'fx-drop', colors, 10, { up: true, gravity: 520, scale: 0.55 });
      this.fx.hitStop(75);
      this.fx.punch(0.012);
      await lunge;
    } else {
      await pb.marker('release');
      audio.play('attack-snow');
      await this.projectile('fx-star', src.handPoint(), dst.center(), TIMING.projectile.snow, {
        spin: 900,
        size: [20, 20],
        trail: { texture: 'fx-flake-small', colors },
      });
      this.fx.impact(dst.center(), base, size);
      this.burst(dst.center(), colors, 7, 0.6);
      this.fx.hitStop(45);
    }
    if (e.boosted) this.fx.impact(dst.center(), GOLD, 84);
  }

  private async animHeal(e: Extract<GameEvent, { t: 'heal' }>): Promise<void> {
    const dst = this.units.get(e.targetId);
    if (!dst) return;
    const src = e.sourceId ? this.units.get(e.sourceId) : undefined;
    if (src) {
      this.actorRing(src);
      const pb = src.act('heal');
      await pb.marker('release');
      const from = src.handPoint();
      const flights = [0, 1, 2].map((i) =>
        this.projectile(
          'fx-crane',
          { x: from.x + (i - 1) * 8, y: from.y - i * 5 },
          { x: dst.container.x + (i - 1) * 9, y: dst.centerY },
          TIMING.heal.cranes,
          { arc: -60 - i * 10, size: [26, 20], delay: i * TIMING.heal.stagger },
        ),
      );
      await Promise.all(flights);
    }
    audio.play('heal');
    this.fx.groundRing({ x: dst.container.x, y: dst.container.y }, MINT, 76);
    this.fx.burst(dst.center(), 'fx-spark', [MINT, 0xffffff, hex(ELEMENT_COLORS.snow.accent)], 10, {
      up: true,
      gravity: -40,
      scale: 0.6,
      speed: 0.6,
    });
    if (e.amount > 0) this.floatText(dst, `+${e.amount}`, ELEMENT_COLORS.snow.accent);
    dst.setHp(e.hp);
    await this.wait(TIMING.heal.hold);
  }

  private startChannel(targetId: string): void {
    const u = this.units.get(targetId);
    if (!u || this.channels.has(targetId)) return;
    const ring = this.add
      .image(u.container.x, u.container.y - 16, 'fx-ring')
      .setTint(GOLD)
      .setAlpha(0.85)
      .setDepth(1990);
    ring.setDisplaySize(54, 54);
    this.tweens.add({ targets: ring, angle: 360, scale: ring.scale * 1.12, duration: 900, yoyo: true, repeat: -1 });
    this.channels.set(targetId, ring);
  }

  private stopChannel(targetId: string): void {
    const ring = this.channels.get(targetId);
    if (!ring) return;
    this.channels.delete(targetId);
    this.tweens.add({ targets: ring, alpha: 0, duration: 200, onComplete: () => ring.destroy() });
  }

  private async animRevive(e: Extract<GameEvent, { t: 'revive' }>): Promise<void> {
    const u = this.units.get(e.targetId);
    if (!u) return;
    audio.play('revive');
    const foot = { x: u.container.x, y: u.container.y };
    this.fx.beam(foot, GOLD);
    this.fx.groundRing(foot, GOLD, 76);
    this.burst(u.center(), [GOLD, MINT, 0xffffff], 16, 0.8);
    const pb = u.getUp();
    this.floatText(u, `+${e.hp}`, PALETTE.gold);
    u.setHp(e.hp);
    await Promise.race([pb.done, this.wait(TIMING.reviveMax)]);
  }

  private async animDamage(e: Extract<GameEvent, { t: 'damage' }>): Promise<void> {
    const u = this.units.get(e.targetId);
    if (!u) return;
    if (e.blocked) {
      audio.play('block');
      u.crackShield();
      this.fx.impact(u.center(), MINT, 54);
      this.floatText(u, ES.blocked, ELEMENT_COLORS.snow.accent);
      await this.wait(TIMING.blockedHold);
      return;
    }
    audio.play(e.cause === 'burn' ? 'burn' : 'hit');
    u.flash();
    u.act('hit');
    u.setHp(e.hp);
    if (e.cause === 'burn') {
      this.fx.burst(u.center(), 'fx-flame', [0xe4572e, GOLD], 6, { up: true, gravity: -80, scale: 0.5, speed: 0.5 });
    }
    this.floatText(u, `-${e.amount}`, e.cause === 'burn' ? PALETTE.gold : '#FFFFFF', e.amount >= 15);
    await this.wait(
      e.cause === 'card'
        ? TIMING.cardHitHold
        : e.cause === 'splash' || e.cause === 'sweep'
          ? TIMING.areaHold
          : TIMING.damageHold,
    );
  }

  private async animKo(id: string): Promise<void> {
    const u = this.units.get(id);
    if (!u) return;
    if (u.kind === 'enemy') {
      // El gólem se hace pedazos: cada pieza sale despedida.
      audio.play('shatter');
      this.fx.impact(u.center(), hex(ICE.glow), 78);
      this.fx.hitStop(70);
      this.fx.shake(120, 0.003);
      this.burst(u.center(), ICE_COLORS, 22, 1.2);
      this.units.delete(id);
      this.tweens.add({ targets: u.container, alpha: 0, delay: 220 * this.speed, duration: 200 * this.speed });
      void u.rig.explode(420 * this.speed).then(() => u.destroy());
      await this.wait(TIMING.enemyKo);
      return;
    }
    audio.play('ko');
    this.stopChannel(id);
    this.fx.burst(u.center(), 'fx-bit', isNinjaId(id) ? elementColors(id) : ICE_COLORS, 14, { gravity: 300 });
    this.fx.dust({ x: u.container.x, y: u.container.y }, 4);
    await u.fallDown(TIMING.koCrossfade);
  }

  private async animCard(e: Extract<GameEvent, { t: 'card' }>, primed = false): Promise<void> {
    const el = e.card.element;
    const c = ELEMENT_COLORS[el];
    const col = hex(c.base);
    const colors = elementColors(el);
    const src = this.units.get(e.ninjaId);
    const center = tileCenter(e.at);
    audio.play(`card-${el}`);
    if (primed) {
      // En un combo la carta ya se alzó durante el cartel: aterriza directo.
      this.fx.impact(center, col, 86);
    } else if (src) {
      // Invoca la carta con los brazos en alto; la carta sale en el marcador.
      this.actorRing(src);
      const pb = src.act('power');
      await pb.marker('release');
      await this.projectile(`card-${el}`, { x: src.container.x, y: src.headY - 6 }, center, TIMING.projectile.card, {
        arc: -70,
        spin: 360,
        size: [24, 32],
        trail: { texture: 'fx-spark', colors },
      });
    }
    // Foco, sello en el suelo y casillas en cascada desde el centro.
    const hold = cardCinematicMs(TIMING, el, e.area.length) * this.speed;
    this.fx.focus(e.area, hold);
    this.fx.sigil(center, col, hold);
    this.fx.cascade(e.area, e.at, col, { step: 60, hold: 320 });
    const ring = (t: Vec) => Math.max(Math.abs(t.x - e.at.x), Math.abs(t.y - e.at.y));
    const order = [...e.area].sort((a, b) => ring(a) - ring(b));
    const xs = e.area.map((t) => tileRect(t).x);
    const left = Math.min(...xs);
    const right = Math.max(...xs) + TW;
    const bottom = Math.max(...e.area.map((t) => tileRect(t).y)) + TH;

    if (el === 'fire') {
      // El fénix cruza el área y detrás cae una lluvia de dardos de fuego.
      const bird = this.fx.track(this.add.image(left - 40, center.y + 30, 'fx-phoenix')).setDepth(2050);
      bird.setDisplaySize(150, 112);
      void this.tween({ targets: bird, x: right + 30, y: center.y - 50, duration: 560, ease: 'Sine.easeInOut' }).then(
        () => {
          this.tweens.add({ targets: bird, alpha: 0, duration: 200, onComplete: () => bird.destroy() });
        },
      );
      const falls = order.map((t, i) => {
        const tc = tileCenter(t);
        const to = { x: tc.x, y: tc.y + 8 };
        return this.fx
          .fall('fx-dart', to, {
            size: [44, 15],
            ms: TIMING.card.fire.fall,
            delay: TIMING.card.fire.start + i * TIMING.card.fire.stagger,
            dx: -60,
            height: 170,
          })
          .then(() => {
            this.fx.impact(to, col, 58);
            this.fx.burst(to, 'fx-flame', [col, GOLD, hex(c.light)], 4, { up: true, gravity: 200, scale: 0.5 });
          });
      });
      await Promise.all(falls);
    } else if (el === 'water') {
      // Una ola grande barre el área y salpica cada casilla.
      const wave = this.fx
        .track(this.add.image(left - 70, bottom - 64, 'fx-wave'))
        .setDepth(2050)
        .setAlpha(0);
      wave.setDisplaySize(right - left + 80, 170);
      await this.tween({
        targets: wave,
        x: right + 40,
        alpha: { from: 0.25, to: 1 },
        duration: TIMING.card.water.wave,
        ease: 'Sine.easeInOut',
      });
      this.tweens.add({ targets: wave, alpha: 0, duration: 220, onComplete: () => wave.destroy() });
      order.forEach((t, i) => {
        this.time.delayedCall(i * TIMING.card.water.stagger * this.speed, () => {
          const tc = tileCenter(t);
          this.fx.impact(tc, col, 52);
          this.fx.burst(tc, 'fx-drop', colors, 5, { up: true, gravity: 520, scale: 0.5 });
        });
      });
      await this.wait(order.length * TIMING.card.water.stagger);
    } else {
      // Un copo gigante baja girando y desata una ventisca.
      const flake = this.fx.track(this.add.image(center.x, center.y - 170, 'fx-flake')).setDepth(2050);
      flake.setDisplaySize(56, 56);
      const target = flake.scale * 2.6;
      this.fx.blizzard(e.area, [0xffffff, hex(c.accent), hex(c.light)], 700);
      await this.tween({
        targets: flake,
        y: center.y,
        angle: 220,
        scale: target,
        duration: TIMING.card.snow.flake,
        ease: 'Cubic.easeIn',
      });
      this.tweens.add({
        targets: flake,
        alpha: 0,
        scale: target * 1.35,
        duration: 280,
        onComplete: () => flake.destroy(),
      });
      order.forEach((t, i) => {
        this.time.delayedCall(i * TIMING.card.snow.stagger * this.speed, () => {
          const tc = tileCenter(t);
          this.fx.impact(tc, col, 54);
          this.fx.burst(tc, 'fx-flake-small', colors, 4, { scale: 0.6 });
        });
      });
      await this.wait(order.length * TIMING.card.snow.stagger);
    }
    this.fx.punch(0.03);
    this.fx.shake(160, 0.004);
    this.fx.hitStop(60);
    await this.wait(TIMING.card.tail);
  }

  private async animEnemyAttack(e: Extract<GameEvent, { t: 'enemyAttack' }>): Promise<void> {
    const src = this.units.get(e.sourceId);
    const dst = this.units.get(e.targetId);
    if (!src || !dst) return;
    this.actorRing(src);
    const pb = src.act('attack');
    // Granizo avisa en el suelo mientras levanta el brazo: ahí caerá.
    if (e.kind === 'artillery') {
      this.fx.telegraph(
        e.area,
        RED,
        (markerMs(GOLEM_CLIPS.artillery.attack) + TIMING.projectile.artillery) * this.speed,
      );
    }
    await pb.marker('release');
    const origin = tileAt(dst.container.x, dst.container.y - 20) ?? e.area[0] ?? { x: 0, y: 0 };
    if (e.kind === 'sniper') {
      audio.play('enemy-sniper');
      await this.projectile('fx-icicle', src.handPoint(), dst.center(), TIMING.projectile.sniper, {
        rotate: true,
        size: [32, 9],
        trail: { texture: 'fx-flake-small', colors: ICE_COLORS },
      });
      this.fx.impact(dst.center(), hex(ICE.base), 50);
      this.burst(dst.center(), ICE_COLORS, 6, 0.6);
      this.fx.hitStop(45);
    } else if (e.kind === 'artillery') {
      audio.play('enemy-artillery');
      await this.projectile('fx-hail', src.handPoint(), dst.center(), TIMING.projectile.artillery, {
        arc: -110,
        spin: 540,
        size: [17, 17],
        trail: { texture: 'fx-bit', colors: ICE_COLORS },
      });
      this.fx.cascade(e.area, origin, RED, { step: 70, hold: 180, alpha: 0.32 });
      this.fx.impact(dst.center(), hex(ICE.base), 66);
      for (const t of e.area) this.fx.dust(footPoint(t), 2);
      this.burst(dst.center(), ICE_COLORS, 14, 1);
      this.fx.shake(110, 0.003);
      this.fx.hitStop(60);
    } else {
      // Témpano golpea el suelo: barrido en media luna y casillas en cascada.
      audio.play('enemy-colossus');
      this.swipe(e.area);
      this.fx.cascade(e.area, origin, RED, { step: 40, hold: 180, alpha: 0.32 });
      for (const t of e.area) this.fx.impact(tileCenter(t), hex(ICE.base), 56);
      this.fx.shake(150, 0.005);
      this.fx.punch(0.02);
      this.fx.hitStop(80);
      await this.wait(TIMING.colossusTail);
    }
  }

  /** Media luna de hielo que barre las casillas golpeadas por Témpano. */
  private swipe(area: readonly Vec[]): void {
    const cs = area.map((t) => tileCenter(t));
    if (cs.length === 0) return;
    const cx = cs.reduce((sum, c) => sum + c.x, 0) / cs.length;
    const cy = cs.reduce((sum, c) => sum + c.y, 0) / cs.length;
    const first = area[0];
    const vertical = area.every((t) => t.x === first?.x);
    const img = this.fx
      .track(this.add.image(cx, cy, 'fx-swipe'))
      .setDepth(2080)
      .setTint(hex(ICE.light))
      .setAlpha(0.95);
    img.setDisplaySize(vertical ? 2.7 * TH : 2.8 * TW, 70);
    if (vertical) img.setAngle(-90);
    const sx = img.scaleX;
    img.scaleX = sx * 0.3;
    this.tweens.add({ targets: img, scaleX: sx * 1.05, duration: 120 * this.speed, ease: 'Quad.easeOut' });
    this.tweens.add({
      targets: img,
      alpha: 0,
      delay: 130 * this.speed,
      duration: 220 * this.speed,
      onComplete: () => img.destroy(),
    });
  }

  private async animSkip(id: string): Promise<void> {
    const u = this.units.get(id);
    if (!u) return;
    audio.play('stun');
    this.actorRing(u);
    await u.act('dazedTurn').done;
  }

  private async spawnEnemies(list: Extract<GameEvent, { t: 'roundStart' }>['enemies']): Promise<void> {
    if (list.length === 0) return;
    audio.play('spawn');
    const step = TIMING.spawn.stagger;
    list.forEach((e, i) => {
      const u = this.makeEnemy(e.id, e.kind, e.pos, e.hp, e.maxHp);
      u.container.setAlpha(0);
      // El gólem se arma pieza por pieza al salir de la nieve.
      this.time.delayedCall(i * step * this.speed, () => {
        u.container.setAlpha(1);
        u.act('spawn');
        const foot = { x: u.container.x, y: u.container.y };
        this.fx.groundRing(foot, hex(ICE.base), 84);
        this.fx.dust(foot, 4);
        this.burst(foot, ICE_COLORS, 8, 0.6);
      });
    });
    await this.wait(list.length * step + TIMING.spawn.tail);
  }

  private async animMatchEnd(victory: boolean): Promise<void> {
    audio.play(victory ? 'victory' : 'defeat');
    if (victory) {
      for (const u of this.units.values()) {
        if (u.kind !== 'ninja' || u.ko) continue;
        u.loop('celebrate');
        this.fx.burst(
          { x: u.container.x, y: u.headY },
          'fx-bit',
          [...elementColors('fire'), ...elementColors('snow'), GOLD],
          16,
          {
            up: true,
            gravity: 380,
            speed: 1.1,
          },
        );
      }
    }
    await this.wait(TIMING.matchEnd);
  }
}

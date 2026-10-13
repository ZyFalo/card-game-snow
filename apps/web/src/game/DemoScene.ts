import type { ElementKind, MatchState } from '@ventisca/core';
import * as Phaser from 'phaser';
import type { BoardLayers } from '../state/board';
import { type Demo, demoLayers } from '../state/demos';
import type { Overlay } from '../state/store';
import { BattleScene } from './BattleScene';
import { BOARD_X, BOARD_Y, TH, TW } from './layout';
import { DEMO_TIMING } from './timing';
import type { UnitSprite } from './UnitSprite';

/** Cómo se enseña una demostración: en bucle, o como una imagen fija, la de antes o la de después. */
export type DemoMode = 'loop' | 'before' | 'after';

/** En qué momento va: lo planeado, el turno animándose, el "¡Combo!" o el resultado. */
export type DemoBeat = 'before' | 'play' | 'combo' | 'after';

export interface DemoOptions {
  demo: Demo;
  mode: DemoMode;
  /** Píxeles del lienzo por cada píxel del tablero. */
  zoom: number;
  onBeat(beat: DemoBeat): void;
}

/**
 * El tablero en miniatura de una demostración (D-81). Es la escena del juego, con su arte y sus
 * animaciones, mirando solo las casillas de la demostración y sin tocar nada de la partida: no suena, no
 * mueve la interfaz y no lee el estado. Lo que anima son los eventos que resolvió el motor
 * (`state/demos.ts`), en bucle: lo planeado, el turno y el resultado.
 */
export class DemoScene extends BattleScene {
  private demo: Demo;
  private beat: DemoBeat = 'before';
  /** Cada vez que cambia lo que se enseña, el bucle anterior se detiene. */
  private run = 0;
  private ready = false;
  /** Los números flotantes que siguen a la vista, y quien espera a que se vaya el último. */
  private readonly floats = new Set<Phaser.GameObjects.Text>();
  private floatsGone: (() => void) | null = null;

  constructor(
    images: Map<string, HTMLImageElement>,
    private readonly options: DemoOptions,
  ) {
    super(images, 'demo');
    this.demo = options.demo;
  }

  /** Cambia lo que se enseña y vuelve a empezar. */
  show(demo: Demo): void {
    this.demo = demo;
    if (!this.ready) return;
    this.frame();
    this.run += 1;
    void this.play(this.run);
  }

  /** La cámara mira solo las casillas de la demostración. */
  protected override frame(): void {
    const { view } = this.demo;
    this.baseZoom = this.options.zoom;
    const cam = this.cameras.main;
    cam.setZoom(this.baseZoom);
    cam.centerOn(BOARD_X + (view.x + view.w / 2) * TW, BOARD_Y + (view.y + view.h / 2) * TH);
  }

  protected override connect(): void {
    this.ready = true;
    this.applyMotion();
    this.show(this.demo);
  }

  /** Una imagen fija no se mueve; el bucle va a la velocidad normal del juego. */
  protected override motion(): { reduced: boolean; fast: boolean } {
    return { reduced: this.options.mode !== 'loop', fast: false };
  }

  protected override boosting(): boolean {
    return false;
  }

  protected override sfx(): void {
    /* una demostración no suena */
  }

  protected override say(): void {
    /* ni avisa nada en la interfaz */
  }

  protected override setOverlay(): void {
    /* ni pone carteles sobre el tablero de la partida */
  }

  protected override setStep(): void {
    /* ni mueve la franja de arriba */
  }

  protected override sendFlight(): void {
    /* ni manda cartas a la mano */
  }

  protected override resetInterface(): void {
    /* ni limpia la interfaz de la partida */
  }

  /** En vez del cartel del combo a pantalla completa, el tablero en miniatura dice "¡Combo!" un momento. */
  protected override async showOverlay(overlay: NonNullable<Overlay>): Promise<void> {
    if (overlay.kind !== 'combo') return;
    this.setBeat('combo');
    await this.wait(DEMO_TIMING.combo);
    this.setBeat('play');
  }

  /** Lo planeado antes de jugar y, todo el bucle, las casillas que golpea un gólem (`state/demos.ts`). */
  protected override planning(): BoardLayers | null {
    return demoLayers(this.demo, this.beat === 'before');
  }

  /** En una demostración nadie está dormido: no mira la partida. */
  protected override sleepers(): ElementKind[] {
    return [];
  }

  /** Con la mano vacía, la demostración no muestra números. */
  protected override floatText(u: UnitSprite, text: string, color: string, big = false) {
    if (!this.demo.numbers) return null;
    const float = super.floatText(u, text, color, big);
    if (!float) return null;
    this.floats.add(float);
    float.once(Phaser.GameObjects.Events.DESTROY, () => {
      this.floats.delete(float);
      if (this.floats.size > 0) return;
      this.floatsGone?.();
      this.floatsGone = null;
    });
    return float;
  }

  /**
   * El resultado se lee cuando ya se fue el último número flotante: si no, quedaría bajo su etiqueta. Se
   * espera a que se destruya, sin contar el tiempo: la pausa de un impacto frena las animaciones.
   */
  private settle(): Promise<void> {
    if (this.floats.size === 0) return Promise.resolve();
    return new Promise((resolve) => {
      this.floatsGone = resolve;
    });
  }

  private setBeat(beat: DemoBeat): void {
    this.beat = beat;
    this.options.onBeat(beat);
  }

  /** Arma el tablero en ese estado, con los estados de cada unidad a la vista. */
  private setup(view: MatchState): number {
    const gen = this.setupMatch(view);
    // En miniatura, el número de vida de cada unidad queda ilegible: la barra basta, y lo que cambió se
    // lee en las etiquetas de la demostración.
    for (const u of this.units.values()) u.showNumber(false);
    for (const e of view.enemies) {
      const u = this.units.get(e.id);
      u?.setStatus('stun', e.stunned);
      u?.setStatus('burn', e.burnTicks > 0);
    }
    for (const n of view.ninjas) {
      const u = this.units.get(n.id);
      u?.setStatus('shield', n.shield);
      u?.setStatus('boost', n.boost);
    }
    return gen;
  }

  private async play(run: number): Promise<void> {
    const { mode } = this.options;
    const current = () => run === this.run;
    while (current()) {
      const demo = this.demo;
      if (mode === 'after') {
        this.beat = 'after';
        this.setup(demo.after);
        this.setBeat('after');
        return;
      }
      this.beat = 'before';
      const gen = this.setup(demo.before);
      this.setBeat('before');
      if (mode === 'before') return;
      await this.wait(DEMO_TIMING.before);
      if (!current()) return;
      // La carta sale de la mano: lo planeado deja de verse y el motor juega el turno.
      this.setBeat('play');
      this.redrawPlanning();
      await this.playEvents(demo.events, () => undefined, gen);
      if (!current() || !this.isCurrent(gen)) return;
      await this.settle();
      if (!current() || !this.isCurrent(gen)) return;
      this.setBeat('after');
      await this.wait(DEMO_TIMING.after);
    }
  }
}

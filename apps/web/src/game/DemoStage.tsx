import * as Phaser from 'phaser';
import { useEffect, useRef } from 'react';
import { loadArtImages } from '../art';
import type { Demo } from '../state/demos';
import { type DemoBeat, type DemoMode, DemoScene } from './DemoScene';
import { TH, TW } from './layout';

/** Píxeles del lienzo por cada píxel de pantalla: el tablero en miniatura se dibuja al doble, para verse nítido. */
const DENSITY = 2;

/** El tamaño en pantalla del tablero en miniatura de una demostración, a esa escala. */
export const demoSize = (demo: Demo, scale: number): { width: number; height: number } => ({
  width: Math.round(demo.view.w * TW * scale),
  height: Math.round(demo.view.h * TH * scale),
});

/**
 * El lienzo de una demostración (D-81): un juego de Phaser aparte, pequeño, con la escena del tablero
 * mirando solo sus casillas. Vive mientras la demostración está abierta. No suena ni recibe el ratón.
 */
export function DemoStage({
  demo,
  mode,
  scale,
  onBeat,
}: {
  demo: Demo;
  mode: DemoMode;
  scale: number;
  onBeat?: (beat: DemoBeat) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<DemoScene | null>(null);
  // Lo último que se pidió, para la escena que todavía se está creando.
  const latest = useRef({ demo, onBeat });
  latest.current = { demo, onBeat };
  const { width, height } = demoSize(demo, scale);

  useEffect(() => {
    let cancelled = false;
    let game: Phaser.Game | null = null;
    void loadArtImages().then((images) => {
      if (cancelled || !host.current) return;
      const created = new DemoScene(images, {
        demo: latest.current.demo,
        mode,
        zoom: scale * DENSITY,
        onBeat: (beat) => latest.current.onBeat?.(beat),
      });
      game = new Phaser.Game({
        type: Phaser.WEBGL,
        parent: host.current,
        width: width * DENSITY,
        height: height * DENSITY,
        backgroundColor: '#EAF0F4',
        scale: { mode: Phaser.Scale.NONE, zoom: 1 / DENSITY },
        input: { keyboard: false, mouse: false, touch: false, gamepad: false },
        audio: { noAudio: true },
        banner: false,
        render: { antialias: true },
        fps: { smoothStep: false },
        scene: [created],
      });
      scene.current = created;
      // Acceso para las pruebas visuales (solo en desarrollo).
      if (import.meta.env.DEV) (window as unknown as { __ventiscaDemo?: DemoScene }).__ventiscaDemo = created;
    });
    return () => {
      cancelled = true;
      scene.current = null;
      game?.destroy(true);
    };
  }, [mode, scale, width, height]);

  // Al cambiar lo que se enseña (con o sin combo, u otra carta), la misma escena vuelve a empezar.
  useEffect(() => {
    scene.current?.show(demo);
  }, [demo]);

  return <div ref={host} className="demo-stage" style={{ width, height }} />;
}

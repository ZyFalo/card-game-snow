import * as Phaser from 'phaser';
import { useEffect, useRef } from 'react';
import { loadArtImages } from '../art';
import { store } from '../state/store';
import { BattleScene } from './BattleScene';

/** Referencia al juego para refrescar la escala cuando cambia el tamaño del marco. */
export const phaserRef: { game: Phaser.Game | null } = { game: null };

/** ¿Puede este navegador crear un contexto WebGL? El tablero de Phaser lo necesita. */
function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function createGame(parent: HTMLElement, images: Map<string, HTMLImageElement>): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.WEBGL,
    parent,
    width: 1920,
    height: 1080,
    backgroundColor: '#EAF0F4',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.NO_CENTER },
    input: { keyboard: false },
    disableContextMenu: true,
    banner: false,
    render: { antialias: true },
    // El tiempo de juego sigue al reloj real: en equipos lentos se saltan cuadros
    // en lugar de alargar las animaciones (y el turno) indefinidamente.
    fps: { smoothStep: false },
    scene: [new BattleScene(images)],
  });
}

export function PhaserStage() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let game: Phaser.Game | null = null;
    // Sin WebGL no hay tablero: la app lo explica en lugar de quedarse cargando.
    if (!hasWebGL()) {
      store.setState({ webglMissing: true });
      return;
    }
    void loadArtImages().then((images) => {
      if (cancelled || !host.current) return;
      try {
        game = createGame(host.current, images);
      } catch {
        // El contexto puede fallar al crearse aunque el navegador diga que tiene WebGL.
        store.setState({ webglMissing: true });
        return;
      }
      phaserRef.game = game;
      if (import.meta.env.DEV) (window as unknown as { __ventiscaGame?: Phaser.Game }).__ventiscaGame = game;
    });
    return () => {
      cancelled = true;
      game?.destroy(true);
      phaserRef.game = null;
    };
  }, []);

  return <div ref={host} className="phaser-stage" />;
}

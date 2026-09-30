import * as Phaser from 'phaser';
import { useEffect, useRef } from 'react';
import { loadArtImages } from '../art';
import { BattleScene } from './BattleScene';

/** Referencia al juego para refrescar la escala cuando cambia el tamaño del marco. */
export const phaserRef: { game: Phaser.Game | null } = { game: null };

export function PhaserStage() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let game: Phaser.Game | null = null;
    void loadArtImages().then((images) => {
      if (cancelled || !host.current) return;
      game = new Phaser.Game({
        type: Phaser.WEBGL,
        parent: host.current,
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

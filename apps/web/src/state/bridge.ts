import type { BattleScene } from '../game/BattleScene';

/* Puente entre React y la escena de Phaser (se registra cuando la escena está lista). */
let resolveReady: (s: BattleScene) => void = () => undefined;

export const sceneReady: Promise<BattleScene> = new Promise((resolve) => {
  resolveReady = resolve;
});

export const bridge = {
  scene: null as BattleScene | null,
  setScene(scene: BattleScene): void {
    this.scene = scene;
    resolveReady(scene);
  },
};

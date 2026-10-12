import type { ElementKind } from '@ventisca/core';
import { type CSSProperties, useMemo, useState } from 'react';
import type { DemoBeat, DemoMode } from '../game/DemoScene';
import { DemoStage, demoSize } from '../game/DemoStage';
import { TH, TW } from '../game/layout';
import { DEMO_TEXT, ES, NINJA_TEXT } from '../i18n/es';
import { closeDemo, setDemoCombo } from '../state/actions';
import { cardDemo, type Demo, type DemoLabel } from '../state/demos';
import { useApp } from '../state/store';
import { Icon, Segmented } from './common';

/*
 * Demostraciones (D-81): una burbuja sobre la mano con un tablero en miniatura donde la carta se juega en
 * bucle. La juega el propio motor (`state/demos.ts`) y la anima la escena del juego (`game/DemoScene.ts`).
 * No pausa el reloj ni mira la partida: enseña qué hace una carta, nunca cuánto daño hará una jugada.
 */

/** Escala del tablero en miniatura: en bucle, y más chico cuando van dos imágenes fijas lado a lado. */
const SCALE = { loop: 0.8, still: 0.55 } as const;

/** Dónde va una etiqueta: sobre su casilla, sin salirse del tablero en miniatura por los lados. */
function labelStyle(demo: Demo, label: DemoLabel, scale: number): { edge: string; style: CSSProperties } {
  const col = label.at.x - demo.view.x;
  const top = (label.at.y - demo.view.y) * TH * scale + 4;
  if (col === 0) return { edge: 'start', style: { left: 0, top } };
  if (col === demo.view.w - 1) return { edge: 'end', style: { right: 0, top } };
  return { edge: 'middle', style: { left: (col + 0.5) * TW * scale, top } };
}

/** El tablero en miniatura, con lo que se lee sobre cada unidad cuando se ve el resultado. */
function DemoBoard({
  demo,
  mode,
  beat,
  onBeat,
}: {
  demo: Demo;
  mode: DemoMode;
  beat?: DemoBeat;
  onBeat?: (beat: DemoBeat) => void;
}) {
  const scale = mode === 'loop' ? SCALE.loop : SCALE.still;
  const done = mode === 'after' || (mode === 'loop' && beat === 'after');
  return (
    <div className="demo-board" style={demoSize(demo, scale)}>
      <DemoStage demo={demo} mode={mode} scale={scale} onBeat={onBeat} />
      {done
        ? demo.labels.map((label) => {
            const { edge, style } = labelStyle(demo, label, scale);
            return (
              <span key={`${label.at.x},${label.at.y}`} className={`demo-label at-${edge}`} style={style}>
                {label.text}
              </span>
            );
          })
        : null}
      {mode === 'loop' && beat === 'combo' ? <span className="demo-combo display">{ES.combo}</span> : null}
    </div>
  );
}

/** Qué hacen las cartas de ese ninja, con o sin combo. */
function CardDemo({ ninja, combo }: { ninja: ElementKind; combo: boolean }) {
  const hand = useApp((s) => s.view?.ninjas.find((n) => n.id === ninja)?.hand);
  const pendingCard = useApp((s) => s.pendingCard);
  const reduced = useApp((s) => s.settings.reducedMotion);
  const [beat, setBeat] = useState<DemoBeat>('before');
  // El valor de la carta elegida o, si no hay, el de la primera de la mano. Con la mano vacía, sin número.
  const value = (hand?.find((c) => c.id === pendingCard) ?? hand?.[0])?.value ?? null;
  const demo = useMemo(() => cardDemo(ninja, value, combo), [ninja, value, combo]);
  const t = NINJA_TEXT[ninja];
  const title = DEMO_TEXT.cardTitle(t.element, value);
  return (
    <>
      {/* Un clic fuera la cierra, y ese clic no llega al tablero. */}
      <div className="demo-backdrop interactive" onPointerDown={closeDemo} />
      <section
        className={`demo paper interactive el-${ninja} ${reduced ? 'stills' : ''}`}
        role="dialog"
        aria-label={title}
        data-beat={reduced ? 'still' : beat}
      >
        <div className="demo-head">
          <h3>{title}</h3>
          <button type="button" className="demo-close" onClick={closeDemo} aria-label={ES.close} title={ES.close}>
            <Icon name="close" />
          </button>
        </div>
        <Segmented
          label={DEMO_TEXT.mode}
          value={combo ? 'combo' : 'alone'}
          options={[
            { value: 'alone', label: DEMO_TEXT.alone },
            { value: 'combo', label: DEMO_TEXT.combo },
          ]}
          onChange={(v) => setDemoCombo(v === 'combo')}
        />
        {reduced ? (
          // Con animaciones reducidas: el antes y el después, como dos imágenes fijas.
          <div className="demo-stills">
            <figure>
              <DemoBoard demo={demo} mode="before" />
              <figcaption>{DEMO_TEXT.before}</figcaption>
            </figure>
            <figure>
              <DemoBoard demo={demo} mode="after" />
              <figcaption>{DEMO_TEXT.after}</figcaption>
            </figure>
          </div>
        ) : (
          <DemoBoard demo={demo} mode="loop" beat={beat} onBeat={setBeat} />
        )}
        <p className="demo-caption">{combo ? DEMO_TEXT.comboCaption(DEMO_TEXT.comboEffect[ninja]) : t.card}</p>
      </section>
    </>
  );
}

/** La demostración abierta, si hay una. Solo hay una a la vez. */
export function DemoLayer() {
  const demo = useApp((s) => s.demo);
  if (!demo) return null;
  return <CardDemo key={demo.ninja} ninja={demo.ninja} combo={demo.combo} />;
}

import type { ElementKind, EnemyKind } from '@ventisca/core';
import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import type { DemoBeat, DemoMode } from '../game/DemoScene';
import { DemoStage, demoSize } from '../game/DemoStage';
import { TH, TW } from '../game/layout';
import { DEMO_TEXT, ENEMY_TEXT, ES, NINJA_TEXT } from '../i18n/es';
import { closeDemo, setDemoCombo } from '../state/actions';
import { cardDemo, type Demo, type DemoLabel, golemCaption, golemDemo } from '../state/demos';
import { useApp } from '../state/store';
import { Icon, Segmented } from './common';

/*
 * Demostraciones (D-81 y D-82): una burbuja sobre la mano con un tablero en miniatura donde una carta se
 * juega, o un gólem ataca, en bucle. La juega el propio motor (`state/demos.ts`) y la anima la escena del
 * juego (`game/DemoScene.ts`). No pausa el reloj ni mira la partida: enseña qué hace algo, nunca cuánto
 * daño hará una jugada.
 */

/**
 * Lo que mide el tablero en miniatura, como mucho: su escala y su ancho en pantalla. En bucle va uno solo;
 * con animaciones reducidas van dos imágenes fijas lado a lado, más chicas.
 */
const FIT = { loop: { scale: 0.8, width: 368 }, still: { scale: 0.55, width: 220 } } as const;

const scaleFor = (demo: Demo, fit: { scale: number; width: number }): number =>
  Math.min(fit.scale, fit.width / (demo.view.w * TW));

/** Un tablero mucho más ancho que alto no cabe dos veces lado a lado: sus imágenes fijas van una sobre otra. */
const isWide = (demo: Demo): boolean => demo.view.w > demo.view.h * 2;

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
  scale,
  beat,
  onBeat,
}: {
  demo: Demo;
  mode: DemoMode;
  scale: number;
  beat?: DemoBeat;
  onBeat?: (beat: DemoBeat) => void;
}) {
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

/**
 * La burbuja de una demostración: su título, lo que lleve debajo (el selector de las cartas), el tablero
 * en miniatura y su línea de texto. Con animaciones reducidas muestra el antes y el después como dos
 * imágenes fijas. En la partida va sobre la mano; abierta desde la ayuda (`over`), en el centro, sobre
 * ella: ahí toma el foco, y al cerrarse lo devuelve al botón que la abrió.
 */
function DemoBubble({
  title,
  demo,
  caption,
  onClose,
  over = false,
  children,
}: {
  title: string;
  demo: Demo;
  caption: string;
  onClose: () => void;
  over?: boolean;
  children?: ReactNode;
}) {
  const reduced = useApp((s) => s.settings.reducedMotion);
  const [beat, setBeat] = useState<DemoBeat>('before');
  const stacked = isWide(demo);
  const still = scaleFor(demo, stacked ? FIT.loop : FIT.still);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!over) return;
    const opener = document.activeElement;
    close.current?.focus();
    return () => {
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, [over]);
  return (
    <>
      {/* Un clic fuera la cierra, y ese clic no llega al tablero ni a la ayuda. */}
      <div className={`demo-backdrop interactive ${over ? 'over' : ''}`} onPointerDown={onClose} />
      <section
        className={`demo paper interactive ${reduced ? 'stills' : ''} ${over ? 'over' : ''}`}
        role="dialog"
        aria-label={title}
        data-beat={reduced ? 'still' : beat}
      >
        <div className="demo-head">
          <h3>{title}</h3>
          <button
            ref={close}
            type="button"
            className="demo-close"
            onClick={onClose}
            aria-label={ES.close}
            title={ES.close}
          >
            <Icon name="close" />
          </button>
        </div>
        {children}
        {reduced ? (
          // Con animaciones reducidas: el antes y el después, como dos imágenes fijas.
          <div className={`demo-stills ${stacked ? 'stacked' : ''}`}>
            <figure>
              <DemoBoard demo={demo} mode="before" scale={still} />
              <figcaption>{DEMO_TEXT.before}</figcaption>
            </figure>
            <figure>
              <DemoBoard demo={demo} mode="after" scale={still} />
              <figcaption>{DEMO_TEXT.after}</figcaption>
            </figure>
          </div>
        ) : (
          <DemoBoard demo={demo} mode="loop" scale={scaleFor(demo, FIT.loop)} beat={beat} onBeat={setBeat} />
        )}
        <p className="demo-caption">{caption}</p>
      </section>
    </>
  );
}

/** Qué hacen las cartas de ese ninja, con o sin combo (D-81). */
function CardDemo({ ninja, combo }: { ninja: ElementKind; combo: boolean }) {
  const hand = useApp((s) => s.view?.ninjas.find((n) => n.id === ninja)?.hand);
  const pendingCard = useApp((s) => s.pendingCard);
  // El valor de la carta elegida o, si no hay, el de la primera de la mano. Con la mano vacía, sin número.
  const value = (hand?.find((c) => c.id === pendingCard) ?? hand?.[0])?.value ?? null;
  const demo = useMemo(() => cardDemo(ninja, value, combo), [ninja, value, combo]);
  const t = NINJA_TEXT[ninja];
  return (
    <DemoBubble
      title={DEMO_TEXT.cardTitle(t.element, value)}
      demo={demo}
      caption={combo ? DEMO_TEXT.comboCaption(DEMO_TEXT.comboEffect[ninja]) : t.card}
      onClose={closeDemo}
    >
      <Segmented
        label={DEMO_TEXT.mode}
        value={combo ? 'combo' : 'alone'}
        options={[
          { value: 'alone', label: DEMO_TEXT.alone },
          { value: 'combo', label: DEMO_TEXT.combo },
        ]}
        onChange={(v) => setDemoCombo(v === 'combo')}
      />
    </DemoBubble>
  );
}

/** Cómo ataca ese gólem (D-82). Sus números los pone el motor. `over`: abierta desde la ayuda, sobre ella. */
export function GolemDemo({ enemy, onClose, over }: { enemy: EnemyKind; onClose: () => void; over?: boolean }) {
  const demo = useMemo(() => golemDemo(enemy), [enemy]);
  return (
    <DemoBubble
      title={DEMO_TEXT.attackTitle(ENEMY_TEXT[enemy].name)}
      demo={demo}
      caption={golemCaption(enemy)}
      onClose={onClose}
      over={over}
    />
  );
}

/** La demostración abierta, si hay una. Solo hay una a la vez. */
export function DemoLayer() {
  const demo = useApp((s) => s.demo);
  if (!demo) return null;
  if (demo.kind === 'golem') return <GolemDemo key={demo.enemy} enemy={demo.enemy} onClose={closeDemo} />;
  return <CardDemo key={demo.ninja} ninja={demo.ninja} combo={demo.combo} />;
}

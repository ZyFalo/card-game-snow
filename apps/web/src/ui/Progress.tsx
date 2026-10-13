import { BALANCE, bankCard, CAMINO_CARDS, ELEMENTS, type ElementKind } from '@ventisca/core';
import { useEffect, useRef, useState } from 'react';
import { art } from '../art';
import { audio } from '../audio/audio';
import { ACCOUNT_TEXT, CAMINO_TITLE, ES, NINJA_TEXT, PROGRESS_TEXT as P } from '../i18n/es';
import { pickCamino, showView } from '../state/account';
import { closeReveal, loadProgress } from '../state/progress';
import { type Reveal, useApp } from '../state/store';
import { CardFace, Coins } from './CardFace';
import { Modal, NinjaTrio, Notice, ScreenActions, ScreenHead } from './common';

/*
 * Progreso de la cuenta (PRD §18 y PRD de v2, D-34): elegir el camino, el resumen del perfil y la caja
 * recién abierta. El progreso y las cartas se ven en la Libreta ninja (`Notebook.tsx`, D-100). Todo lo que
 * muestran lo decidió el servidor.
 */

/* ---------- Elegir el camino (R-30) ---------- */

export function CaminoView() {
  const busy = useApp((s) => s.progress.busy);
  const error = useApp((s) => s.progress.error);
  const [choice, setChoice] = useState<ElementKind | null>(null);
  const choose = async (element: ElementKind) => {
    if (await pickCamino(element)) audio.play('confirm');
  };
  return (
    <>
      <ScreenHead title={P.caminoTitle} intro={P.caminoIntro} />
      <div className="camino-body">
        <div className="camino-grid">
          {ELEMENTS.map((el) => {
            const card = bankCard(CAMINO_CARDS[el]);
            const t = NINJA_TEXT[el];
            return (
              <button
                key={el}
                type="button"
                className={`camino-option paper el-${el}`}
                aria-pressed={choice === el}
                disabled={busy}
                onClick={() => {
                  setChoice(el);
                  audio.play('select');
                }}
              >
                <span className="camino-top">
                  <img src={art.ninja(el)} alt="" />
                  {card ? <CardFace card={card} size="md" /> : null}
                </span>
                <span className="camino-title display">{CAMINO_TITLE[el]}</span>
                <span className="camino-sub">
                  {t.name} · {t.role}
                </span>
                <span className="camino-desc">{t.card}</span>
              </button>
            );
          })}
        </div>
        {error ? <Notice tone="danger">{error}</Notice> : null}
      </div>
      <ScreenActions>
        <p className="foot">{P.caminoNote}</p>
        <button type="button" className="btn btn-lg" onClick={() => showView('profile')}>
          {ACCOUNT_TEXT.back}
        </button>
        <button
          type="button"
          className="btn btn-primary btn-lg"
          disabled={!choice || busy}
          onClick={() => {
            if (choice) void choose(choice);
          }}
        >
          {busy ? ES.sending : choice ? P.caminoChoose(CAMINO_TITLE[choice]) : P.caminoPick}
        </button>
      </ScreenActions>
    </>
  );
}

/* ---------- El resumen del progreso, en el perfil ---------- */

/** Va en la columna derecha del perfil, con el ninja del camino de la persona. */
export function ProgressSummary() {
  const status = useApp((s) => s.progress.status);
  const data = useApp((s) => s.progress.data);
  if (!data) {
    return (
      <>
        {status === 'error' ? (
          <div className="summary-retry">
            <Notice tone="danger">{P.summaryError}</Notice>
            <button type="button" className="btn" onClick={() => void loadProgress()}>
              {P.retry}
            </button>
          </div>
        ) : (
          <p className="summary-loading" role="status">
            {P.summaryLoading}
          </p>
        )}
        <NinjaTrio />
      </>
    );
  }
  if (!data.camino) {
    return (
      <>
        <section className="paper summary">
          <h2 className="display">{P.noCaminoTitle}</h2>
          <p>{P.noCaminoBody}</p>
        </section>
        <NinjaTrio />
      </>
    );
  }
  const t = NINJA_TEXT[data.camino];
  return (
    <>
      <section className={`paper summary el-${data.camino}`} aria-label={P.summaryLabel}>
        <header>
          <img src={art.bust(data.camino)} alt="" />
          <div>
            <h2 className="display">{CAMINO_TITLE[data.camino]}</h2>
            <div className="sub">
              {t.name} · {t.role}
            </div>
          </div>
          <Coins amount={data.coins} chip />
        </header>
      </section>
      <div className="ninja-trio ninja-solo" aria-hidden="true">
        <img src={art.ninja(data.camino)} alt="" />
      </div>
    </>
  );
}

/* ---------- Una caja recién abierta ---------- */

const SLOT_KEYS = ['primera', 'segunda', 'tercera'] as const;
/** Segundos entre una carta y la siguiente al revelarse. */
const REVEAL_STEP = 0.38;

export function RevealModal({ reveal }: { reveal: Reveal }) {
  const keepGoing = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    keepGoing.current?.focus();
  }, []);
  useEffect(() => {
    const at = (i: number) => (REVEAL_STEP + i * REVEAL_STEP) * 1000;
    const timers = reveal.cards.map((_, i) => window.setTimeout(() => audio.play('draw'), at(i)));
    const top = Math.max(...BALANCE.bank.valuesPerElement);
    if (reveal.cards.some((id) => bankCard(id)?.value === top)) {
      timers.push(window.setTimeout(() => audio.play('bonus'), at(reveal.cards.length)));
    }
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [reveal]);
  const title = P.revealTitle(NINJA_TEXT[reveal.element].element);
  return (
    <Modal label={title} className="reveal" onClose={closeReveal}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: solo escucha Escape, que llega desde el botón con el foco */}
      <div
        onKeyDown={(e) => {
          if (e.key === 'Escape') closeReveal();
        }}
      >
        <h2 className="display">{title}</h2>
        <div className="reveal-cards">
          {reveal.cards.map((id, i) => {
            const card = bankCard(id);
            return card ? (
              <div
                key={`${reveal.key}-${SLOT_KEYS[i] ?? i}`}
                className="reveal-slot"
                style={{ animationDelay: `${REVEAL_STEP + i * REVEAL_STEP}s` }}
              >
                <CardFace card={card} size="lg" fresh={reveal.fresh[i] ?? false} />
              </div>
            ) : null;
          })}
        </div>
        <p className="reveal-note">{P.revealNote(reveal.fresh.filter(Boolean).length)}</p>
        <div className="reveal-actions">
          <button ref={keepGoing} type="button" className="btn btn-primary" onClick={closeReveal}>
            {P.keepGoing}
          </button>
        </div>
      </div>
    </Modal>
  );
}

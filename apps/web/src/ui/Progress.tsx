import {
  BALANCE,
  BOX_SIZES,
  bankCard,
  bankFor,
  boxPrice,
  CAMINO_CARDS,
  collectionSummary,
  ELEMENTS,
  type ElementKind,
} from '@ventisca/core';
import { useEffect, useId, useRef, useState } from 'react';
import { art } from '../art';
import { audio } from '../audio/audio';
import { ACCOUNT_TEXT, CAMINO_TITLE, ES, NINJA_TEXT, PROGRESS_TEXT as P } from '../i18n/es';
import { pickCamino, showView } from '../state/account';
import { buyBox, closeReveal, loadProgress, setCollectionTab } from '../state/progress';
import { type Reveal, useApp } from '../state/store';
import { CardFace, Coins } from './CardFace';
import { ElementGlyph, Modal, NinjaTrio, Notice, ScreenActions, ScreenHead } from './common';

/*
 * Progreso de la cuenta (PRD §18 y PRD de v2, D-34): elegir el camino, la colección con la tienda y el
 * resumen del perfil. Son vistas de la pantalla de cuenta, compuestas según
 * docs/lineamientos-de-diseno.md. Todo lo que muestran lo decidió el servidor.
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
        <dl className="summary-stats">
          {ELEMENTS.map((el) => {
            const s = collectionSummary(data.collection, el);
            return (
              <div key={el}>
                <dt>
                  <ElementGlyph el={el} />
                  {NINJA_TEXT[el].element}
                </dt>
                <dd>
                  <b>{P.distinct(s.distinct, bankFor(el).length)}</b>
                  <span>{P.boxSize(s.total)}</span>
                </dd>
              </div>
            );
          })}
          <div>
            <dt>{P.boxes}</dt>
            <dd>
              <b>{data.boxesOpened}</b>
              <span>{P.boxesOpened(data.boxesOpened)}</span>
            </dd>
          </div>
        </dl>
      </section>
      <div className="ninja-trio ninja-solo" aria-hidden="true">
        <img src={art.ninja(data.camino)} alt="" />
      </div>
    </>
  );
}

/* ---------- Colección y tienda (R-25 a R-28) ---------- */

/** Probabilidad por carta de cada valor, calculada desde el banco (R-27). */
function oddsText(): string {
  const values = BALANCE.bank.valuesPerElement;
  const distinct = [...new Set(values)].sort((a, b) => a - b);
  return distinct
    .map((v) => `${v}\u00a0(${Math.round((100 * values.filter((x) => x === v).length) / values.length)}\u00a0%)`)
    .join(', ');
}

const CHEAPEST_BOX = Math.min(...BOX_SIZES.map(boxPrice));

export function CollectionView() {
  const data = useApp((s) => s.progress.data);
  const tab = useApp((s) => s.progress.tab);
  const busy = useApp((s) => s.progress.busy);
  const pending = useApp((s) => s.progress.pending);
  const error = useApp((s) => s.progress.error);
  const reveal = useApp((s) => s.progress.reveal);
  const tabsId = useId();
  const collection = data?.collection ?? {};
  const coins = data?.coins ?? 0;
  const t = NINJA_TEXT[tab];
  const summary = collectionSummary(collection, tab);
  const eco = BALANCE.economy;
  return (
    <>
      {/* Con una caja abierta encima, lo de abajo no recibe foco ni clics. */}
      <div className="contents" inert={reveal !== null}>
        <ScreenHead
          title={P.collection}
          intro={`${data?.camino ? `${CAMINO_TITLE[data.camino]}. ` : ''}${P.collectionIntro}`}
        >
          <div className="wallet">
            <Coins amount={coins} chip />
          </div>
        </ScreenHead>

        <div className="collection-cards">
          <div className="tabs" role="tablist" aria-label={P.tabs}>
            {ELEMENTS.map((el) => (
              <button
                key={el}
                type="button"
                role="tab"
                id={`${tabsId}-${el}`}
                aria-selected={tab === el}
                aria-controls={`${tabsId}-panel`}
                className={`tab el-${el}`}
                onClick={() => setCollectionTab(el)}
              >
                <ElementGlyph el={el} />
                {NINJA_TEXT[el].element}
                <span className="count">
                  {P.distinct(collectionSummary(collection, el).distinct, bankFor(el).length)}
                </span>
              </button>
            ))}
          </div>
          <div className="coll-grid" role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-${tab}`}>
            {bankFor(tab).map((card) => {
              const qty = collection[card.id] ?? 0;
              return <CardFace key={card.id} card={card} qty={qty} locked={qty === 0} size="sm" />;
            })}
          </div>
        </div>

        <aside className={`paper shop el-${tab}`}>
          <h2 className="display">{P.box(t.element)}</h2>
          <p>
            {P.owned} <b>{P.boxSize(summary.total)}</b> {P.ofElement(t.element)}
            {summary.total > 0 ? (
              <>
                {' · '}
                {P.average} <b>{summary.average.toFixed(1).replace('.', ',')}</b>
              </>
            ) : null}
            {' · '}
            {P.distinctLong(summary.distinct, bankFor(tab).length)}
          </p>
          <div className="shop-boxes">
            {BOX_SIZES.map((size) => {
              const price = boxPrice(size);
              // La compra de esta caja está en curso o quedó sin respuesta (D-68).
              const unconfirmed = pending?.element === tab && pending.size === size;
              const buying = busy && unconfirmed;
              return (
                <button
                  key={size}
                  type="button"
                  className="btn shop-box"
                  // La que quedó sin respuesta se puede comprar de nuevo aunque el saldo ya no alcance: si
                  // el servidor la había cobrado, el reintento devuelve esa caja sin cobrar otra.
                  disabled={busy || (coins < price && !unconfirmed)}
                  onClick={() => void buyBox(tab, size)}
                  aria-label={buying ? P.buying : P.buy(size, t.element, price)}
                >
                  <span>{buying ? P.buying : P.boxSize(size)}</span>
                  <Coins amount={price} />
                </button>
              );
            })}
          </div>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <p className="shop-note">
            {P.odds(oddsText())} {P.repeatedNote}
          </p>
          {/* Con un aviso a la vista, la pista de las monedas espera: las dos cosas no caben en el panel. */}
          {coins < CHEAPEST_BOX && !error ? (
            <p className="shop-note">
              {P.earnHint(eco.coinsPerRound.join(', ').replace(/, (\d+)$/, ' y $1'), eco.bonusCoins)}{' '}
              <span className="tag">{ACCOUNT_TEXT.soon}</span>
            </p>
          ) : null}
        </aside>

        <ScreenActions>
          <button type="button" className="btn btn-lg" onClick={() => showView('profile')}>
            {ACCOUNT_TEXT.back}
          </button>
        </ScreenActions>
      </div>
      {reveal ? <RevealModal reveal={reveal} /> : null}
    </>
  );
}

/* ---------- Una caja recién abierta ---------- */

const SLOT_KEYS = ['primera', 'segunda', 'tercera'] as const;
/** Segundos entre una carta y la siguiente al revelarse. */
const REVEAL_STEP = 0.38;

function RevealModal({ reveal }: { reveal: Reveal }) {
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

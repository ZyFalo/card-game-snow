import {
  ACHIEVEMENT_FOLDS,
  BALANCE,
  BOX_SIZES,
  bankFor,
  boxPrice,
  collectionSummary,
  ELEMENTS,
  type ElementKind,
} from '@ventisca/core';
import type { Progress } from '@ventisca/protocol';
import { useId } from 'react';
import { art } from '../art';
import { ACHIEVEMENT_TEXT, CAMINO_TITLE, ES, NOTEBOOK_TEXT as N, NINJA_TEXT, PROGRESS_TEXT as P } from '../i18n/es';
import { openProgress } from '../state/account';
import {
  closeNotebook,
  PAGE_COUNT,
  PAGE_SIZE,
  PAGES_PER_ELEMENT,
  pageElement,
  setNotebookTab,
  showCardsOf,
  turnPage,
} from '../state/notebook';
import { buyBox, loadProgress } from '../state/progress';
import { store, useApp } from '../state/store';
import { CardFace, Coins } from './CardFace';
import { ElementGlyph, Icon, Notice } from './common';
import { RevealModal } from './Progress';

/*
 * La Libreta ninja (D-100): un pergamino con pestañas a la izquierda. "Mi progreso" trae las estadísticas
 * privadas, las cartas y los logros de cada elemento y el amuleto de papel; "Mis cartas", la colección en
 * páginas de 2 × 5, con la tienda de cajas. Reemplaza a "Tu progreso" y a "Colección y tienda": su
 * contenido es el mismo, y todo lo que muestra lo decidió el servidor.
 */

/* ---------- El amuleto de papel (D-100) ---------- */

/** Los logros que ya tiene de cada pliegue. */
export function foldProgress(have: readonly string[]): Record<ElementKind, number> {
  const count = (el: ElementKind) => ACHIEVEMENT_FOLDS[el].filter((id) => have.includes(id)).length;
  return { fire: count('fire'), water: count('water'), snow: count('snow') };
}

const FOLD_SHAPE: Record<ElementKind, string> = {
  fire: '80,70 46,96 52,136 80,112',
  water: '80,70 114,96 108,136 80,112',
  snow: '52,136 80,112 108,136 80,158',
};

const FOLD_FILL: Record<ElementKind, string> = { fire: 'var(--fire)', water: 'var(--water)', snow: 'var(--snow)' };

/**
 * Tres pliegues de color: cada uno se colorea al completar sus tres logros, y mientras tanto queda en
 * blanco, con el borde punteado. Completo, su cordón y su nudo se vuelven dorados: es el doble de monedas.
 */
export function Amulet({ have }: { have: readonly string[] }) {
  const folds = foldProgress(have);
  const done = ELEMENTS.filter((el) => folds[el] === ACHIEVEMENT_FOLDS[el].length);
  const complete = done.length === ELEMENTS.length;
  const cord = complete ? 'var(--gold)' : 'var(--ink-3)';
  return (
    <figure className={`amulet ${complete ? 'complete' : ''}`} data-folds={done.length}>
      <svg viewBox="30 30 100 136" role="img" aria-label={N.amulet(done.length, ELEMENTS.length)}>
        <path d="M80 70 C70 58 70 46 80 40 C90 46 90 58 80 70" fill="none" stroke={cord} strokeWidth="4" />
        <circle cx="80" cy="40" r="6" fill={cord} stroke="var(--ink)" strokeWidth="2.5" />
        {ELEMENTS.map((el) => {
          const full = done.includes(el);
          return (
            <polygon
              key={el}
              points={FOLD_SHAPE[el]}
              fill={full ? FOLD_FILL[el] : '#fffaf0'}
              stroke="var(--ink)"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeDasharray={full ? undefined : '5 4'}
            />
          );
        })}
        <polygon points="80,96 92,112 80,124 68,112" fill="var(--ink)" />
      </svg>
      <figcaption>{complete ? N.doubleActive : N.doubleHint}</figcaption>
    </figure>
  );
}

/* ---------- Mi progreso ---------- */

function ProgressTab({ data }: { data: Progress }) {
  const stats = data.stats.classic;
  const folds = foldProgress(data.achievements);
  const camino = data.camino;
  return (
    <div className="note-progress">
      <header className="note-top">
        {camino ? (
          <div className={`note-camino el-${camino}`}>
            <img src={art.bust(camino)} alt="" />
            <div>
              <h2 className="display">{CAMINO_TITLE[camino]}</h2>
              <p>
                {NINJA_TEXT[camino].name} · {NINJA_TEXT[camino].role}
              </p>
            </div>
          </div>
        ) : null}
        <div className="note-wallet">
          <Coins amount={data.coins} chip />
          <span>
            {P.boxes}: <b>{data.boxesOpened}</b> {P.boxesOpened(data.boxesOpened)}
          </span>
        </div>
        <Amulet have={data.achievements} />
      </header>
      <div className="note-cards">
        <section className="note-card note-stats" aria-label={N.statsTitle}>
          <h3 className="display">{N.statsTitle}</h3>
          <p className="note-quiet">{N.statsPrivate}</p>
          <dl>
            <div>
              <dt>{N.stats.played}</dt>
              <dd data-stat="matches">{stats.matches}</dd>
            </div>
            <div>
              <dt>{N.stats.rounds}</dt>
              <dd data-stat="rounds">{stats.rounds}</dd>
            </div>
            <div>
              <dt>{N.stats.wins}</dt>
              <dd data-stat="wins">{stats.wins}</dd>
            </div>
          </dl>
        </section>
        {ELEMENTS.map((el) => {
          const t = NINJA_TEXT[el];
          const summary = collectionSummary(data.collection, el);
          const ids = ACHIEVEMENT_FOLDS[el];
          const full = folds[el] === ids.length;
          return (
            <section key={el} className={`note-card note-el el-${el} ${full ? 'full' : ''}`} aria-label={t.element}>
              <h3 className="display">
                <ElementGlyph el={el} />
                {t.element}
              </h3>
              <img src={art.ninja(el)} alt="" />
              <p>{N.cardsOf(summary.distinct, bankFor(el).length)}</p>
              <ul className="note-fold">
                {ids.map((id) => {
                  const got = data.achievements.includes(id);
                  return (
                    <li key={id} className={got ? 'got' : ''} title={ACHIEVEMENT_TEXT[id].how} data-achievement={id}>
                      <i aria-hidden="true" />
                      <span>{ACHIEVEMENT_TEXT[id].name}</span>
                      <span className="sr-only">: {got ? N.earned : N.pending}</span>
                    </li>
                  );
                })}
              </ul>
              <p className="note-quiet">{N.fold(folds[el], ids.length)}</p>
              <button
                type="button"
                className="link"
                aria-label={N.toCardsOf(t.element)}
                onClick={() => showCardsOf(el)}
              >
                {N.toCards} ▸
              </button>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Mis cartas ---------- */

function CardsTab({ data }: { data: Progress }) {
  const page = useApp((s) => s.notebook.page);
  const el = pageElement(page);
  const t = NINJA_TEXT[el];
  const start = (page % PAGES_PER_ELEMENT) * PAGE_SIZE;
  const cards = bankFor(el).slice(start, start + PAGE_SIZE);
  return (
    <div className={`note-collection el-${el}`}>
      <header className="note-bar">
        <h2 aria-live="polite">
          <ElementGlyph el={el} />
          {N.page(t.element, page + 1, PAGE_COUNT)}
        </h2>
        <Coins amount={data.coins} chip />
      </header>
      <div className="note-pages">
        <button
          type="button"
          className="icon-btn"
          aria-label={N.previousPage}
          title={N.previousPage}
          onClick={() => turnPage(-1)}
        >
          <Icon name="left" />
        </button>
        <div className="note-grid" data-page={page}>
          {cards.map((card) => {
            const qty = data.collection[card.id] ?? 0;
            return <CardFace key={card.id} card={card} qty={qty} locked={qty === 0} size="sm" />;
          })}
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label={N.nextPage}
          title={N.nextPage}
          onClick={() => turnPage(1)}
        >
          <Icon name="right" />
        </button>
      </div>
      <div className="note-actions">
        <button type="button" className="btn btn-primary" onClick={() => setNotebookTab('boxes')}>
          {N.boxes}
        </button>
      </div>
    </div>
  );
}

/* ---------- Abrir cajas: la tienda (R-27 y R-28) ---------- */

/** Probabilidad por carta de cada valor, calculada desde el banco (R-27). */
function oddsText(): string {
  const values = BALANCE.bank.valuesPerElement;
  const distinct = [...new Set(values)].sort((a, b) => a - b);
  return distinct
    .map((v) => `${v} (${Math.round((100 * values.filter((x) => x === v).length) / values.length)} %)`)
    .join(', ');
}

const CHEAPEST_BOX = Math.min(...BOX_SIZES.map(boxPrice));

function BoxesTab({ data }: { data: Progress }) {
  const tab = useApp((s) => s.progress.tab);
  const busy = useApp((s) => s.progress.busy);
  const pending = useApp((s) => s.progress.pending);
  const error = useApp((s) => s.progress.error);
  const tabsId = useId();
  const coins = data.coins;
  const t = NINJA_TEXT[tab];
  const summary = collectionSummary(data.collection, tab);
  const eco = BALANCE.economy;
  return (
    <div className={`note-boxes el-${tab}`}>
      <header className="note-bar">
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
              onClick={() => showCardsOf(el, 'boxes')}
            >
              <ElementGlyph el={el} />
              {NINJA_TEXT[el].element}
              <span className="count">
                {P.distinct(collectionSummary(data.collection, el).distinct, bankFor(el).length)}
              </span>
            </button>
          ))}
        </div>
        <Coins amount={coins} chip />
      </header>
      <section className="note-shop" role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-${tab}`}>
        <div className="shop-info">
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
          <p className="shop-note">
            {P.odds(oddsText())} {P.repeatedNote}
          </p>
          {/* Con un aviso a la vista, la pista de las monedas espera: las dos cosas no caben juntas. */}
          {coins < CHEAPEST_BOX && !error ? (
            <p className="shop-note">
              {P.earnHint(eco.coinsPerRound.join(', ').replace(/, (\d+)$/, ' y $1'), eco.bonusCoins)}
            </p>
          ) : null}
          {error ? <Notice tone="danger">{error}</Notice> : null}
        </div>
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
      </section>
      <div className="note-actions">
        <button type="button" className="btn" onClick={() => setNotebookTab('cards')}>
          {N.backToCards}
        </button>
      </div>
    </div>
  );
}

/* ---------- La Libreta ---------- */

export function NotebookScreen() {
  const tab = useApp((s) => s.notebook.tab);
  const status = useApp((s) => s.progress.status);
  const data = useApp((s) => s.progress.data);
  const reveal = useApp((s) => s.progress.reveal);
  const cards = tab !== 'progress';
  const title = tab === 'progress' ? N.tabs.progress : tab === 'cards' ? N.tabs.cards : N.boxes;
  const tabsId = useId();
  return (
    <div className="online-root">
      {/* Con una caja abierta encima, lo de abajo no recibe foco ni clics. */}
      <div className="screen notebook" data-notebook={tab} inert={reveal !== null}>
        <button
          type="button"
          className="icon-btn online-x"
          onClick={closeNotebook}
          aria-label={ES.back}
          title={ES.back}
        >
          <Icon name="close" />
        </button>
        <div className="note-tabs" role="tablist" aria-label={N.title} aria-orientation="vertical">
          <button
            type="button"
            role="tab"
            id={`${tabsId}-progress`}
            aria-selected={!cards}
            aria-controls={`${tabsId}-panel`}
            className="note-tab"
            onClick={() => setNotebookTab('progress')}
          >
            <Icon name="chart" />
            <span>{N.tabs.progress}</span>
          </button>
          <button
            type="button"
            role="tab"
            id={`${tabsId}-cards`}
            aria-selected={cards}
            aria-controls={`${tabsId}-panel`}
            className="note-tab"
            onClick={() => setNotebookTab('cards')}
          >
            <Icon name="cards" />
            <span>{N.tabs.cards}</span>
          </button>
        </div>
        <section
          className="scroll note-scroll"
          role="tabpanel"
          id={`${tabsId}-panel`}
          aria-labelledby={`${tabsId}-${cards ? 'cards' : 'progress'}`}
        >
          <h1 className="display scroll-title">{title}</h1>
          {!data ? (
            status === 'error' ? (
              <div className="note-empty">
                <Notice tone="danger">{P.summaryError}</Notice>
                <button type="button" className="btn" onClick={() => void loadProgress()}>
                  {P.retry}
                </button>
              </div>
            ) : (
              <p className="note-empty" role="status">
                {P.summaryLoading}
              </p>
            )
          ) : !data.camino ? (
            <div className="note-empty">
              <h2 className="display">{P.noCaminoTitle}</h2>
              <p>{P.noCaminoBody}</p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  store.setState({ screen: 'account' });
                  openProgress('camino');
                }}
              >
                {P.toCamino}
              </button>
            </div>
          ) : tab === 'progress' ? (
            <ProgressTab data={data} />
          ) : tab === 'cards' ? (
            <CardsTab data={data} />
          ) : (
            <BoxesTab data={data} />
          )}
        </section>
      </div>
      {reveal ? <RevealModal reveal={reveal} /> : null}
    </div>
  );
}

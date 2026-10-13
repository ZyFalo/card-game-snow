import {
  ACHIEVEMENT_FOLD_IDS,
  type AchievementFold,
  BALANCE,
  BOX_SIZES,
  bankFor,
  boxPrice,
  collectionSummary,
  ELEMENTS,
} from '@ventisca/core';
import type { Achievements, Progress } from '@ventisca/protocol';
import { useId } from 'react';
import { art } from '../art';
import {
  ACHIEVEMENT_TEXT,
  CAMINO_TITLE,
  ES,
  FOLD_TEXT,
  NOTEBOOK_TEXT as N,
  NINJA_TEXT,
  PROGRESS_TEXT as P,
} from '../i18n/es';
import { openProgress } from '../state/account';
import { type AchievementRow, completeFolds, type FoldView, foldView } from '../state/achievements';
import {
  closeNotebook,
  PAGE_SIZE,
  PAGES_PER_ELEMENT,
  pageElement,
  pageWithin,
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
 * La Libreta ninja (D-100 y D-105): un pergamino con pestañas a la izquierda. "Mi progreso" trae el amuleto
 * de papel, las estadísticas privadas y los cuatro pliegues con el avance de sus logros; "Mis cartas", la
 * colección de un elemento a la vez, en páginas de 2 × 5, con la tienda de cajas. Todo lo que muestra lo
 * decidió el servidor.
 */

/* ---------- El amuleto de papel (D-104) ---------- */

const FOLD_SHAPE: Record<AchievementFold, string> = {
  fire: '80,70 46,96 52,136 80,112',
  water: '80,70 114,96 108,136 80,112',
  snow: '52,136 80,112 108,136 80,158',
  // El de equipo va en el centro, sobre los otros tres.
  team: '80,92 95,112 80,128 65,112',
};

const FOLD_FILL: Record<AchievementFold, string> = {
  fire: 'var(--fire)',
  water: 'var(--water)',
  snow: 'var(--snow)',
  team: 'var(--ink)',
};

/**
 * Cuatro pliegues: los de Fuego, Agua y Nieve se colorean con su elemento al completarse, y el del centro,
 * el de equipo, se pinta de tinta. Mientras le falta, cada uno queda en blanco, con el borde punteado. Con
 * los cuatro, su cordón y su nudo se vuelven dorados: es el doble de monedas.
 */
export function Amulet({ achievements }: { achievements: Achievements }) {
  const done = completeFolds(achievements);
  const complete = done.length === ACHIEVEMENT_FOLD_IDS.length;
  const cord = complete ? 'var(--gold)' : 'var(--ink-3)';
  return (
    <svg
      className={`amulet ${complete ? 'complete' : ''}`}
      viewBox="30 30 100 136"
      role="img"
      aria-label={`${N.amuletTitle}. ${N.amulet(done.length, ACHIEVEMENT_FOLD_IDS.length)}`}
      data-folds={done.length}
    >
      <path d="M80 70 C70 58 70 46 80 40 C90 46 90 58 80 70" fill="none" stroke={cord} strokeWidth="4" />
      <circle cx="80" cy="40" r="6" fill={cord} stroke="var(--ink)" strokeWidth="2.5" />
      {ACHIEVEMENT_FOLD_IDS.map((fold) => {
        const full = done.includes(fold);
        return (
          <polygon
            key={fold}
            data-fold={fold}
            data-full={full}
            points={FOLD_SHAPE[fold]}
            fill={full ? FOLD_FILL[fold] : '#fffaf0'}
            stroke="var(--ink)"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeDasharray={full ? undefined : fold === 'team' ? '4 3' : '5 4'}
          />
        );
      })}
    </svg>
  );
}

/* ---------- El avance de un logro ---------- */

/**
 * Un logro con su contador y su barra. `detail`: con la explicación de qué cuenta, siempre a la vista. En
 * los resultados, lo que sumó la partida va en dorado, sobre la barra y al final de ella.
 */
export function AchievementLine({
  row,
  detail = false,
  results = false,
}: {
  row: AchievementRow;
  detail?: boolean;
  results?: boolean;
}) {
  const t = ACHIEVEMENT_TEXT[row.id];
  return (
    <li
      className={`ach-line ${row.done ? 'done' : ''} ${row.fresh ? 'fresh' : ''}`}
      data-achievement={row.id}
      data-count={row.count}
      data-done={row.done}
    >
      <div className="ach-head">
        <b>
          {row.done ? <Icon name="check" /> : null}
          {t.name}
          {row.done ? <span className="sr-only">: {N.earned}</span> : null}
        </b>
        <span className="ach-count">
          {results ? (
            row.gained > 0 ? (
              <span className="ach-gain" data-gained={row.gained}>
                {N.gain(row.gained)}
              </span>
            ) : (
              <span className="ach-none">{N.noGain}</span>
            )
          ) : null}
          {results ? ' · ' : null}
          {N.count(row.count, row.goal)}
        </span>
      </div>
      {detail ? <p className="ach-what">{t.counts}</p> : null}
      <div
        className="ach-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={row.goal}
        aria-valuenow={row.count}
        aria-label={N.countLong(t.name, row.count, row.goal)}
      >
        <i style={{ width: `${row.fillBefore}%` }} />
        {row.gained > 0 ? <i className="new" style={{ width: `${row.fill - row.fillBefore}%` }} /> : null}
      </div>
    </li>
  );
}

/** El título de un pliegue: su glifo, su nombre y cuántos de sus logros están completos. */
function FoldTitle({ view }: { view: FoldView }) {
  const t = FOLD_TEXT[view.fold];
  return (
    <h3 className="display">
      {view.fold === 'team' ? <Icon name="team" /> : <ElementGlyph el={view.fold} />}
      {t.name}
      <span className="fold-count">
        <span aria-hidden="true">{N.fold(view.done, view.rows.length)}</span>
        <span className="sr-only">{N.foldLong(t.name, view.done, view.rows.length)}</span>
      </span>
    </h3>
  );
}

/* ---------- Mi progreso ---------- */

function ProgressTab({ data }: { data: Progress }) {
  const stats = data.stats.classic;
  const camino = data.camino;
  const done = completeFolds(data.achievements);
  const complete = done.length === ACHIEVEMENT_FOLD_IDS.length;
  return (
    <div className="note-progress">
      <header className="note-strip">
        {camino ? (
          <div className={`note-camino el-${camino}`}>
            <img src={art.bust(camino)} alt="" />
            <p>
              <b>{CAMINO_TITLE[camino]}</b> · {NINJA_TEXT[camino].name}
            </p>
          </div>
        ) : null}
        <div className="note-wallet">
          <span>
            {P.boxes}: <b>{data.boxesOpened}</b> {P.boxesOpened(data.boxesOpened)}
          </span>
          <Coins amount={data.coins} chip />
        </div>
      </header>
      <div className="note-top">
        <Amulet achievements={data.achievements} />
        <div className="note-amulet">
          <h2 className="display" data-amulet={done.length}>
            {N.amulet(done.length, ACHIEVEMENT_FOLD_IDS.length)}
          </h2>
          {complete ? <p className="amulet-double">{N.doubleActive}</p> : null}
          <p>{N.amuletHint}</p>
        </div>
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
      </div>
      <div className="note-cards">
        {ACHIEVEMENT_FOLD_IDS.map((fold) => {
          const view = foldView(fold, data.achievements);
          const t = FOLD_TEXT[fold];
          return (
            <section
              key={fold}
              className={`note-card note-fold fold-${fold} ${fold === 'team' ? '' : `el-${fold}`} ${view.complete ? 'full' : ''}`}
              aria-label={t.name}
              data-fold={fold}
              data-done={view.done}
            >
              <FoldTitle view={view} />
              <p className="note-quiet">{t.who}</p>
              <ul className="ach-list">
                {view.rows.map((row) => (
                  <AchievementLine key={row.id} row={row} detail />
                ))}
              </ul>
              {fold === 'team' ? null : (
                <p className="fold-foot">
                  <span>{N.cardsOf(collectionSummary(data.collection, fold).distinct, bankFor(fold).length)}</span>
                  <button
                    type="button"
                    className="link"
                    aria-label={N.toCardsOf(t.name)}
                    onClick={() => showCardsOf(fold)}
                  >
                    {N.toCards} ▸
                  </button>
                </p>
              )}
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
  const tabsId = useId();
  const el = pageElement(page);
  const t = NINJA_TEXT[el];
  const within = pageWithin(page);
  const start = within * PAGE_SIZE;
  const cards = bankFor(el).slice(start, start + PAGE_SIZE);
  return (
    <div className={`note-collection el-${el}`}>
      <header className="note-bar">
        <div className="tabs" role="tablist" aria-label={N.elements}>
          {ELEMENTS.map((tab) => {
            const owned = collectionSummary(data.collection, tab).distinct;
            const of = bankFor(tab).length;
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                id={`${tabsId}-${tab}`}
                aria-selected={tab === el}
                aria-controls={`${tabsId}-panel`}
                aria-label={N.ownedLong(NINJA_TEXT[tab].element, owned, of)}
                className={`tab el-${tab}`}
                data-element={tab}
                onClick={() => showCardsOf(tab)}
              >
                <ElementGlyph el={tab} />
                {NINJA_TEXT[tab].element}
                <span className="count">{N.ownedOf(owned, of)}</span>
              </button>
            );
          })}
        </div>
        <Coins amount={data.coins} chip />
      </header>
      <div className="note-pages" role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-${el}`}>
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
        <p className="note-page" aria-live="polite">
          {N.page(t.element, within + 1, PAGES_PER_ELEMENT)}
        </p>
        <button type="button" className="btn btn-primary" onClick={() => setNotebookTab('boxes')}>
          {N.boxesOf(t.element)}
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

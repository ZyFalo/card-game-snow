import {
  type AchievementId,
  BALANCE,
  BOX_SIZES,
  bankCard,
  bankFor,
  boxPrice,
  CAMINO_CARDS,
  collectionSummary,
  ELEMENTS,
  type ElementKind,
  hasDoubleCoins,
} from '@ventisca/core';
import { useEffect, useState } from 'react';
import { art } from '../art';
import { audio } from '../audio/audio';
import { CAMINO_TITLE, NINJA_TEXT, PROGRESSION } from '../i18n/es';
import { buyBox, chooseCamino, closeCollection, closeReveal, goto, setCollectionTab } from '../state/actions';
import { type Reveal, useApp } from '../state/store';
import { CardFace, CoinChip } from './CardFace';
import { ElementGlyph, Modal } from './common';

/* ---------- Elegir camino (R-30) ---------- */

export function CaminoScreen() {
  const [choice, setChoice] = useState<ElementKind | null>(null);
  return (
    <div className="screen camino-screen">
      <div className="screen-head">
        <h1 className="display">{PROGRESSION.caminoTitle}</h1>
        <p>{PROGRESSION.caminoIntro}</p>
      </div>
      <div className="camino-grid">
        {ELEMENTS.map((el) => {
          const card = bankCard(CAMINO_CARDS[el]);
          const t = NINJA_TEXT[el];
          return (
            <button
              key={el}
              type="button"
              className={`camino-option paper el-${el} ${choice === el ? 'chosen' : ''}`}
              aria-pressed={choice === el}
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
      <p className="camino-note">{PROGRESSION.caminoNote}</p>
      <div className="team-actions">
        <button type="button" className="btn btn-lg" onClick={() => goto('title')}>
          Volver
        </button>
        <button
          type="button"
          className="btn btn-primary btn-lg"
          disabled={!choice}
          onClick={() => {
            if (choice) chooseCamino(choice);
          }}
        >
          {choice ? `Elegir el ${CAMINO_TITLE[choice]}` : PROGRESSION.caminoPick}
        </button>
      </div>
    </div>
  );
}

/* ---------- Colección y tienda (R-25 a R-29) ---------- */

/** Probabilidad por carta de cada valor, calculada desde el banco. */
function oddsText(): string {
  const values = BALANCE.bank.valuesPerElement;
  const distinct = [...new Set(values)].sort((a, b) => a - b);
  return distinct
    .map((v) => `${v} (${Math.round((100 * values.filter((x) => x === v).length) / values.length)} %)`)
    .join(', ');
}

const SLOT_KEYS = ['primera', 'segunda', 'tercera'] as const;

function RevealModal({ reveal }: { reveal: Reveal }) {
  useEffect(() => {
    const timers = reveal.cards.map((_, i) => window.setTimeout(() => audio.play('draw'), 380 + i * 380));
    const done = window.setTimeout(
      () => {
        if (reveal.cards.some((c) => c.value === 12)) audio.play('bonus');
      },
      380 + reveal.cards.length * 380,
    );
    return () => {
      for (const t of timers) window.clearTimeout(t);
      window.clearTimeout(done);
    };
  }, [reveal]);
  const t = NINJA_TEXT[reveal.element];
  const freshCount = reveal.fresh.filter(Boolean).length;
  return (
    <Modal label={PROGRESSION.revealTitle(t.element)} className="reveal" onClose={closeReveal}>
      <h2 className="display">{PROGRESSION.revealTitle(t.element)}</h2>
      <div className="reveal-cards">
        {reveal.cards
          .map((card, i) => ({
            card,
            slot: SLOT_KEYS[i] ?? card.id,
            fresh: reveal.fresh[i] ?? false,
            delay: 0.38 + i * 0.38,
          }))
          .map(({ card, slot, fresh, delay }) => (
            <div key={`${reveal.key}-${slot}`} className="reveal-slot" style={{ animationDelay: `${delay}s` }}>
              <CardFace card={card} size="lg" badge={fresh ? PROGRESSION.fresh : PROGRESSION.repeated} />
            </div>
          ))}
      </div>
      <p className="reveal-note">
        {freshCount === 0
          ? 'Todas eran repetidas: igual entran a tu reserva y aumentan la probabilidad de robarlas.'
          : freshCount === 1
            ? 'Una carta nueva para tu colección.'
            : `${freshCount} cartas nuevas para tu colección.`}
      </p>
      <div className="reveal-actions">
        <button type="button" className="btn btn-primary" onClick={closeReveal}>
          {PROGRESSION.keepGoing}
        </button>
      </div>
    </Modal>
  );
}

export function CollectionScreen() {
  const profile = useApp((s) => s.profile);
  const tab = useApp((s) => s.collectionTab);
  const unlocked = useApp((s) => s.unlocked);
  const reveal = useApp((s) => s.reveal);
  const t = NINJA_TEXT[tab];
  const summary = collectionSummary(profile.collection, tab);
  const achievements = Object.keys(unlocked) as AchievementId[];
  const doubled = hasDoubleCoins(achievements);
  return (
    <div className="screen collection-screen">
      <div className="screen-head">
        <h1 className="display">{PROGRESSION.collection}</h1>
        <p>
          {profile.camino ? `${CAMINO_TITLE[profile.camino]}. ` : ''}
          {PROGRESSION.collectionIntro}
        </p>
      </div>
      <div className="wallet">
        <CoinChip amount={profile.coins} />
        <span className="ach-chip">
          Logros {achievements.length} de 9 · {doubled ? 'monedas dobles activas' : 'con los 9, monedas dobles'}
        </span>
      </div>

      <div className="coll-tabs" role="tablist" aria-label="Elemento">
        {ELEMENTS.map((el) => (
          <button
            key={el}
            type="button"
            role="tab"
            aria-selected={tab === el}
            className={`coll-tab el-${el}`}
            onClick={() => setCollectionTab(el)}
          >
            <ElementGlyph el={el} className="tab-glyph" />
            {NINJA_TEXT[el].element}
            <span className="tab-count">{collectionSummary(profile.collection, el).distinct} de 20</span>
          </button>
        ))}
      </div>

      <div className="coll-grid" role="tabpanel" aria-label={`Cartas de ${t.element}`}>
        {bankFor(tab).map((card) => {
          const qty = profile.collection[card.id] ?? 0;
          return <CardFace key={card.id} card={card} qty={qty} locked={qty === 0} size="sm" />;
        })}
      </div>

      <aside className={`shop paper el-${tab}`}>
        <h2 className="display">{PROGRESSION.box(t.element)}</h2>
        <p className="shop-reserve">
          Tu reserva de {t.element}: <b>{PROGRESSION.reserve(summary.total)}</b>
          {summary.total > 0 ? (
            <>
              {' '}
              · promedio <b>{summary.average.toFixed(1).replace('.', ',')}</b>
            </>
          ) : null}{' '}
          · {summary.distinct} de 20 distintas
        </p>
        <div className="shop-boxes">
          {BOX_SIZES.map((size) => {
            const price = boxPrice(size);
            const can = profile.coins >= price;
            return (
              <button
                key={size}
                type="button"
                className="btn shop-box"
                disabled={!can}
                onClick={() => buyBox(tab, size)}
                aria-label={`Comprar caja de ${PROGRESSION.boxSize(size)} de ${t.element} por ${price} monedas`}
              >
                <span>{PROGRESSION.boxSize(size)}</span>
                <CoinChip amount={price} />
              </button>
            );
          })}
        </div>
        <p className="shop-odds">
          Probabilidad por carta: {oddsText()}. {PROGRESSION.repeatedNote}
        </p>
        {profile.coins < boxPrice(1) ? <p className="shop-hint">{PROGRESSION.earnHint}</p> : null}
      </aside>

      <div className="coll-actions">
        <button type="button" className="btn btn-lg" onClick={closeCollection}>
          Volver
        </button>
      </div>
      {reveal ? <RevealModal reveal={reveal} /> : null}
    </div>
  );
}

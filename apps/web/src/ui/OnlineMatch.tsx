import {
  ACHIEVEMENT_FOLDS,
  ACHIEVEMENT_IDS,
  type AchievementId,
  BOX_SIZES,
  boxPrice,
  ELEMENTS,
  type ElementKind,
} from '@ventisca/core';
import type { CSSProperties } from 'react';
import { art } from '../art';
import { URL_SPEED } from '../game/speed';
import { ACHIEVEMENT_TEXT, ES, listOf, NINJA_TEXT, NOTEBOOK_TEXT, ONLINE_TEXT as O, PROGRESS_TEXT } from '../i18n/es';
import { LOADING_MS } from '../state/actions';
import { openNotebook } from '../state/notebook';
import { finishResults } from '../state/online';
import { useApp } from '../state/store';
import { Icon, useCountUp } from './common';

/*
 * La carga y los resultados de una partida en línea (D-100). Todo lo que muestran los resultados lo
 * calculó el servidor: las rondas cobradas, las monedas, los logros y el saldo.
 */

/* ---------- La carga, con el consejo ninja ---------- */

/**
 * Composición en diagonal: el ninja elegido grande y al frente, sus compañeros detrás y los gólems del otro
 * lado, sobre una franja de tinta. El consejo habla del ninja elegido, con su nombre resaltado en su color.
 */
export function OnlineLoading() {
  const tip = useApp((s) => s.loadingTip);
  const you = useApp((s) => s.online.match?.you ?? null);
  if (!you) return null;
  const [first, second] = ELEMENTS.filter((el) => el !== you) as [ElementKind, ElementKind];
  return (
    <div
      className={`screen online-loading el-${you}`}
      data-online="loading"
      style={{ '--load-ms': `${LOADING_MS.online * URL_SPEED}ms` } as CSSProperties}
    >
      <div className="load-slash" />
      <img className="load-figure load-mate first" src={art.ninja(first)} alt="" />
      <img className="load-figure load-mate second" src={art.ninja(second)} alt="" />
      <img className="load-figure load-you" src={art.action(you, false)} alt="" />
      <img className="load-figure load-golem g1" src={art.golem('colossus')} alt="" />
      <img className="load-figure load-golem g2" src={art.golem('artillery')} alt="" />
      <img className="load-figure load-golem g3" src={art.golem('sniper')} alt="" />
      <div className="load-band" />
      <div className="load-bar" role="status" aria-label={ES.loading}>
        <span className="spin" aria-hidden="true">
          <Icon name="spin" />
        </span>
        <div className="load-track">
          <div className="load-fill" />
        </div>
      </div>
      <div className="load-tip">
        <h2 className="display">{O.ninjaTip}</h2>
        <p>
          <b>{NINJA_TEXT[you].name}</b> {tip}
        </p>
      </div>
    </div>
  );
}

/* ---------- Los logros ---------- */

/** Los 9 logros en el orden del amuleto: los tres de cada pliegue, de Fuego a Nieve. */
export const AMULET_ORDER: { id: AchievementId; fold: ElementKind }[] = ELEMENTS.flatMap((fold) =>
  ACHIEVEMENT_FOLDS[fold].map((id) => ({ id, fold })),
);

/** El dibujo de cada logro. Toma el color del texto. */
export function AchievementIcon({ id }: { id: AchievementId }) {
  const line = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  const bolt = 'M13 2.5 5.5 13.5h5.5l-1 8 7.5-11h-5.5z';
  switch (id) {
    case 'combo2':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d={bolt} fill="currentColor" />
        </svg>
      );
    case 'combo3':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d={bolt} fill="currentColor" transform="translate(-5 0) scale(0.92)" />
          <path d={bolt} fill="currentColor" transform="translate(6 1) scale(0.92)" />
        </svg>
      );
    case 'perfectSweep':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="7" {...line} />
          <path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5" {...line} />
        </svg>
      );
    case 'upAgain':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 20.5V4M5.5 10.5 12 4l6.5 6.5" {...line} />
        </svg>
      );
    case 'bonusWon':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.2 6-5.5-3-5.5 3 1.2-6L3.2 9.4l6.1-.8z" fill="currentColor" />
        </svg>
      );
    case 'untouched':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3 4.5 6v5.5c0 4.5 3.2 7.8 7.5 9.5 4.3-1.7 7.5-5 7.5-9.5V6z" {...line} />
        </svg>
      );
    case 'reviver':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 20.5S3.5 15 3.5 9.2A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8.5 2.2c0 5.8-8.5 11.3-8.5 11.3z"
            fill="currentColor"
          />
        </svg>
      );
    case 'healer15':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4.5v15M4.5 12h15" {...line} strokeWidth={3.6} />
        </svg>
      );
    case 'noOneLeft':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="6" cy="9" r="2.6" fill="currentColor" />
          <circle cx="12" cy="7" r="2.8" fill="currentColor" />
          <circle cx="18" cy="9" r="2.6" fill="currentColor" />
          <path
            d="M3 19c0-3 1.6-4.8 3.6-4.8M21 19c0-3-1.6-4.8-3.6-4.8M7.5 19.5c0-3.6 2-5.8 4.5-5.8s4.5 2.2 4.5 5.8"
            {...line}
          />
        </svg>
      );
  }
}

/** Los 9 logros en fila. `fresh`: los que se acaban de ganar, con un aro dorado. */
export function AchievementRow({
  have,
  fresh = [],
}: {
  have: readonly AchievementId[];
  fresh?: readonly AchievementId[];
}) {
  return (
    <ul className="ach-row">
      {AMULET_ORDER.map(({ id, fold }) => {
        const got = have.includes(id);
        const t = ACHIEVEMENT_TEXT[id];
        return (
          <li
            key={id}
            className={`ach el-${fold} ${got ? 'got' : ''} ${fresh.includes(id) ? 'fresh' : ''}`}
            title={`${t.name}. ${t.how}`}
            data-achievement={id}
            data-got={got}
          >
            <AchievementIcon id={id} />
            <span className="sr-only">
              {t.name}: {got ? NOTEBOOK_TEXT.earned : NOTEBOOK_TEXT.pending}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------- Los resultados ---------- */

/** La caja de 3 cartas: la "próxima recompensa" de los resultados. */
const REWARD_SIZE = BOX_SIZES.includes(3) ? 3 : (BOX_SIZES[0] ?? 1);

/** Un pergamino con rollos a los lados, sobre la batalla, con el orden de la pantalla de pago del original. */
export function OnlineResults() {
  const end = useApp((s) => s.online.end);
  const state = useApp((s) => s.results?.state ?? null);
  const you = useApp((s) => s.online.match?.you ?? null);
  const reduced = useApp((s) => s.settings.reducedMotion);
  const total = end?.coins.total ?? 0;
  const shown = useCountUp(total, { ms: 1100, delay: 350, enabled: !reduced });
  if (!end || !state || !you) return null;
  const win = end.result === 'victory';
  // Las rondas superadas: las tres con la victoria; con la derrota, las anteriores a la que se perdió.
  const cleared = win || state.round === 'bonus' ? 3 : state.round - 1;
  const bonus = state.bonusOutcome === 'won' ? 'won' : state.bonusOutcome === 'lost' ? 'lost' : 'locked';
  const price = boxPrice(REWARD_SIZE);
  const enough = end.balance >= price;
  const element = NINJA_TEXT[you].element;
  const fresh = end.earned;
  return (
    <div className={`screen online-results el-${you}`} data-online="results" data-result={end.result}>
      <section className="scroll" aria-labelledby="results-title">
        <h1 id="results-title" className="display scroll-title">
          {win ? O.won : O.lost}
        </h1>
        <div className="scroll-box res-rounds">
          <h3>{O.rounds}</h3>
          <ol className="res-track">
            {[1, 2, 3].map((r) => (
              <li key={r} className={r < cleared || (r === 3 && cleared === 3 && bonus !== 'locked') ? 'linked' : ''}>
                <span
                  className={`res-round ${r <= cleared ? 'done' : ''}`}
                  title={r <= cleared ? O.roundReached(r) : O.roundMissed(r)}
                >
                  <span aria-hidden="true">{r}</span>
                  <span className="sr-only">{r <= cleared ? O.roundReached(r) : O.roundMissed(r)}</span>
                </span>
              </li>
            ))}
            <li>
              <span className={`res-round bonus ${bonus === 'won' ? 'done' : ''}`} data-bonus={bonus}>
                {bonus === 'won' ? <Icon name="star" /> : bonus === 'locked' ? <Icon name="lock" /> : null}
                <span aria-hidden="true">{O.bonus}</span>
                <span className="sr-only">{O.bonusState[bonus]}</span>
              </span>
            </li>
          </ol>
        </div>
        <div className="res-row">
          <div className="scroll-box res-coins">
            <h3>{O.coins}</h3>
            <div className="res-counter">
              <Icon name="coin" />
              <output aria-label={`${total} ${PROGRESS_TEXT.coinsWord(total)}`} data-coins={total}>
                {String(shown).padStart(5, '0')}
              </output>
              {end.coins.doubled ? (
                <span className="res-double" title={O.doubledTitle}>
                  {O.doubled}
                </span>
              ) : null}
            </div>
            <p className="res-small">{O.roundsPaid(end.coins.lines.length)}</p>
          </div>
          <div className="scroll-box res-reward">
            <div>
              <h3>{O.nextReward}</h3>
              <p className="res-small">{O.rewardBox(element, REWARD_SIZE, price)}</p>
              <div
                className={`res-bar ${enough ? 'ok' : ''}`}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={price}
                aria-valuenow={Math.min(end.balance, price)}
                aria-label={O.nextReward}
              >
                <i style={{ width: `${Math.min(100, (end.balance / price) * 100)}%` }} />
              </div>
              <p>
                {enough ? (
                  <>
                    <b>{O.rewardReady}</b> {O.rewardHave(end.balance)}
                  </>
                ) : (
                  O.rewardMissing(end.balance, price - end.balance)
                )}
              </p>
            </div>
            <span className="res-box" aria-hidden="true">
              <Icon name="box" />
            </span>
          </div>
        </div>
        <div className="scroll-box res-amulet">
          <h3>{O.amulet(end.achievements.length, ACHIEVEMENT_IDS.length)}</h3>
          <AchievementRow have={end.achievements} fresh={fresh} />
          {fresh.length > 0 ? (
            <p className="res-new">
              <b>{O.fresh}</b> {listOf(fresh.map((id) => ACHIEVEMENT_TEXT[id].name))}
            </p>
          ) : null}
        </div>
        <div className="scroll-actions">
          {enough ? (
            <button type="button" className="btn" onClick={() => openNotebook('boxes', you)}>
              {O.openBoxes}
            </button>
          ) : null}
          <button type="button" className="btn" onClick={() => openNotebook('progress')}>
            {O.yourProgress}
          </button>
          <button type="button" className="btn btn-primary" onClick={finishResults}>
            {O.done}
          </button>
        </div>
      </section>
    </div>
  );
}

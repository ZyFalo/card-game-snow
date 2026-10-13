import { BOX_SIZES, boxPrice, ELEMENTS, type ElementKind } from '@ventisca/core';
import type { CSSProperties } from 'react';
import { art } from '../art';
import { URL_SPEED } from '../game/speed';
import { ES, NINJA_TEXT, ONLINE_TEXT as O, PROGRESS_TEXT } from '../i18n/es';
import { foldView } from '../state/achievements';
import { LOADING_MS } from '../state/actions';
import { openNotebook } from '../state/notebook';
import { finishResults } from '../state/online';
import { useApp } from '../state/store';
import { Icon, useCountUp } from './common';
import { AchievementLine } from './Notebook';

/*
 * La carga y los resultados de una partida en línea (D-100 y D-105). Todo lo que muestran los resultados lo
 * calculó el servidor: las rondas cobradas, las monedas, el avance de los logros y el saldo.
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
  // El avance de la partida: el del pliegue del ninja con que jugó y el de equipo, que avanza con cualquiera.
  const gains = { gained: end.gained, completed: end.completed };
  const mine = foldView(you, end.achievements, gains);
  const team = foldView('team', end.achievements, gains);
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
        <div className="res-folds">
          <section className={`scroll-box res-fold fold-${you}`} data-fold={you} aria-labelledby="res-fold-mine">
            <h3 id="res-fold-mine">{O.foldGain(element)}</h3>
            <ul className="ach-list">
              {mine.rows.map((row) => (
                <AchievementLine key={row.id} row={row} results />
              ))}
            </ul>
          </section>
          <section className="scroll-box res-fold fold-team" data-fold="team" aria-labelledby="res-fold-team">
            <h3 id="res-fold-team">{O.teamGain}</h3>
            <ul className="ach-list">
              {team.rows.map((row) => (
                <AchievementLine key={row.id} row={row} results />
              ))}
            </ul>
          </section>
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

import { BALANCE, type Difficulty, ELEMENTS } from '@ventisca/core';
import { art } from '../art';
import { audio } from '../audio/audio';
import {
  ACCOUNT_TEXT,
  BONUS_OUTCOME_TEXT,
  BONUS_SHORT,
  DIFFICULTIES,
  ES,
  MAP_NAMES,
  NINJA_TEXT,
  PACES,
  type Pace,
  SCREEN_TEXT,
  STAT_LABELS,
} from '../i18n/es';
import { openAccount } from '../state/account';
import { goto, setHelp, startMatch, updateSettings } from '../state/actions';
import { useApp } from '../state/store';
import { Icon, Segmented, Toggle, useCountUp } from './common';

export function TitleScreen() {
  const account = useApp((s) => s.account);
  return (
    <div className="screen title-screen">
      <img className="bg" src={art.background('cumbre')} alt="" />
      <div className="veil" />
      <div className="title-block">
        <div className="title-kicker">{SCREEN_TEXT.kicker}</div>
        <h1 className="title-word display">{ES.title}</h1>
        <p className="title-tagline">{ES.tagline}</p>
        <div className="title-actions">
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={() => {
              audio.unlock();
              audio.play('confirm');
              goto('team');
            }}
          >
            <Icon name="play" /> {ACCOUNT_TEXT.playSandbox}
          </button>
          {account.status === 'ready' ? (
            <button type="button" className="btn btn-lg" onClick={() => openAccount()}>
              {account.user ? ACCOUNT_TEXT.myAccount : ACCOUNT_TEXT.enter}
            </button>
          ) : null}
          <button type="button" className="btn btn-lg" onClick={() => setHelp(true)}>
            {ES.howToPlay}
          </button>
        </div>
      </div>
      <div className="title-ninjas" aria-hidden="true">
        {ELEMENTS.map((el) => (
          <img key={el} src={art.ninja(el)} alt="" />
        ))}
      </div>
      <div className="title-foot">
        {SCREEN_TEXT.credits}
        {account.status === 'ready' ? (
          <button type="button" className="link" onClick={() => openAccount('privacy')}>
            {ACCOUNT_TEXT.privacy}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function TeamScreen() {
  const settings = useApp((s) => s.settings);
  return (
    <div className="screen team-screen">
      <div className="screen-head">
        <h1 className="display">{ES.team}</h1>
        <p>{ES.teamIntro}</p>
      </div>
      <div className="team-grid">
        {ELEMENTS.map((el) => {
          const t = NINJA_TEXT[el];
          const st = BALANCE.ninjas[el];
          return (
            <section key={el} className={`class-card paper el-${el}`}>
              <header>
                <img src={art.bust(el)} alt="" />
                <div>
                  <h2 className="display">{t.name}</h2>
                  <div className="sub">
                    {t.element} · {t.role}
                  </div>
                </div>
              </header>
              <p>{t.basic}</p>
              <p>
                <b>{SCREEN_TEXT.cardLabel}</b> {t.card}
              </p>
              <p>
                <b>{SCREEN_TEXT.comboLabel}</b> {t.comboShort}
              </p>
              <div className="stats">
                <div>
                  <b>{st.hp}</b>
                  <span>{SCREEN_TEXT.stats.hp}</span>
                </div>
                <div>
                  <b>{st.attack}</b>
                  <span>{SCREEN_TEXT.stats.attack}</span>
                </div>
                <div>
                  <b>{st.range}</b>
                  <span>{SCREEN_TEXT.stats.range}</span>
                </div>
                <div>
                  <b>{st.move}</b>
                  <span>{SCREEN_TEXT.stats.move}</span>
                </div>
              </div>
            </section>
          );
        })}
      </div>
      <div className="team-options">
        <div>
          <h3 className="opt-title">{ES.pace}</h3>
          <Segmented<Pace>
            label={ES.pace}
            value={settings.pace}
            onChange={(pace) => updateSettings({ pace })}
            options={(Object.keys(PACES) as Pace[]).map((p) => ({
              value: p,
              label: PACES[p].label,
              detail: PACES[p].detail,
            }))}
          />
        </div>
        <div>
          <h3 className="opt-title">{ES.difficulty}</h3>
          <Segmented<Difficulty>
            label={ES.difficulty}
            value={settings.difficulty}
            onChange={(difficulty) => updateSettings({ difficulty })}
            options={(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => ({
              value: d,
              label: DIFFICULTIES[d].label,
              detail: DIFFICULTIES[d].detail,
            }))}
          />
        </div>
        <div>
          <h3 className="opt-title">{SCREEN_TEXT.aids}</h3>
          <Toggle label={ES.tipsMode} checked={settings.tips} onChange={(tips) => updateSettings({ tips })} />
          <Toggle
            label={ES.autoAdvance}
            checked={settings.autoAdvance}
            onChange={(autoAdvance) => updateSettings({ autoAdvance })}
          />
          <Toggle
            label={ES.fastAnimations}
            checked={settings.fastAnimations}
            onChange={(fastAnimations) => updateSettings({ fastAnimations })}
          />
        </div>
      </div>
      <div className="team-actions">
        <button type="button" className="btn btn-lg" onClick={() => goto('title')}>
          {ES.back}
        </button>
        <button
          type="button"
          className="btn btn-primary btn-lg"
          onClick={() => {
            audio.unlock();
            audio.play('confirm');
            void startMatch();
          }}
        >
          {ES.startMatch}
        </button>
      </div>
    </div>
  );
}

/** Sin WebGL no hay tablero: se explica en lugar de dejar la carga colgada. */
export function NoWebGLScreen() {
  return (
    <div className="screen loading-screen">
      <div className="loading-box" role="alert">
        <h2 className="display">{ES.noWebglTitle}</h2>
        <p>{ES.noWebglBody}</p>
      </div>
    </div>
  );
}

export function LoadingScreen() {
  const tip = useApp((s) => s.loadingTip);
  return (
    <div className="screen loading-screen">
      <div className="loading-box">
        <div className="folds" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <h2 className="display">{ES.loading}</h2>
        <div className="tip-label">{SCREEN_TEXT.tip}</div>
        <p>{tip}</p>
      </div>
    </div>
  );
}

export function ResultsScreen() {
  const results = useApp((s) => s.results);
  const account = useApp((s) => s.account);
  const seed = useApp((s) => s.seed);
  const reduced = useApp((s) => s.settings.reducedMotion);
  if (!results) return null;
  const { state } = results;
  const win = state.status === 'victory';
  const stats = state.stats;
  const outcome = BONUS_OUTCOME_TEXT[state.bonusOutcome];
  return (
    <div className="screen results-screen">
      <div className="screen-head">
        <h1 className={`result-word display ${win ? 'win' : 'lose'}`}>{win ? ES.victory : ES.defeat}</h1>
        <p>
          {win ? SCREEN_TEXT.victory : SCREEN_TEXT.defeat} {outcome}
        </p>
      </div>
      <div className="results-body">
        <section className="paper">
          <div className="stat-grid">
            {(Object.keys(STAT_LABELS) as (keyof typeof STAT_LABELS)[]).map((k, i) => (
              <Stat key={k} label={STAT_LABELS[k]} value={stats[k]} delay={250 + i * 60} animate={!reduced} />
            ))}
          </div>
          <p className="results-meta">
            {SCREEN_TEXT.matchMeta(DIFFICULTIES[state.difficulty].label.toLowerCase(), MAP_NAMES[state.mapId])}{' '}
            {state.stats.turnsToClearMain !== null ? `${SCREEN_TEXT.clearedIn(state.stats.turnsToClearMain)} ` : ''}
            {BONUS_SHORT[state.bonusCondition]}.
          </p>
        </section>
      </div>
      {/* PRD de v2, sandbox: resultados sin monedas, con una invitación a crear una cuenta. */}
      {/* Su botón es secundario: el primario de esta vista es "Jugar otra vez" (lineamientos, sección 3). */}
      {account.status === 'ready' && !account.user ? (
        <div className="paper results-invite">
          <span>{ACCOUNT_TEXT.invite}</span>
          <button type="button" className="btn" onClick={() => openAccount('register')}>
            {ACCOUNT_TEXT.inviteButton}
          </button>
        </div>
      ) : null}
      <div className="results-seed">
        {ES.seed}: {seed} · {DIFFICULTIES[state.difficulty].label}
      </div>
      <div className="results-actions">
        <button type="button" className="btn btn-lg" onClick={() => goto('title')}>
          {ES.menu}
        </button>
        <button type="button" className="btn btn-primary btn-lg" onClick={() => goto('team')}>
          {ES.playAgain}
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, delay, animate }: { label: string; value: number; delay: number; animate: boolean }) {
  const shown = useCountUp(value, { ms: 650, delay, enabled: animate });
  return (
    <div>
      <span>{label}</span>
      <b>{shown}</b>
    </div>
  );
}

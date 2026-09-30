import {
  ACHIEVEMENT_IDS,
  BALANCE,
  bankCard,
  CAMINO_CARDS,
  collectionSummary,
  type Difficulty,
  ELEMENTS,
} from '@ventisca/core';
import { art } from '../art';
import { audio } from '../audio/audio';
import {
  ACHIEVEMENT_TEXT,
  BONUS_OUTCOME_TEXT,
  BONUS_SHORT,
  CAMINO_TITLE,
  DIFFICULTIES,
  ES,
  MAP_NAMES,
  NINJA_TEXT,
  PACES,
  type Pace,
  PROGRESSION,
  STAT_LABELS,
} from '../i18n/es';
import { dismissWelcome, enterGame, goto, openCollection, setHelp, startMatch, updateSettings } from '../state/actions';
import { useApp } from '../state/store';
import { CoinChip } from './CardFace';
import { Icon, Segmented, Toggle, useCountUp } from './common';

export function TitleScreen() {
  const profile = useApp((s) => s.profile);
  return (
    <div className="screen title-screen">
      <img className="bg" src={art.background('cumbre')} alt="" />
      <div className="veil" />
      <div className="title-block">
        <div className="title-kicker">Tácticas por turnos · 1 jugador</div>
        <h1 className="title-word display">{ES.title}</h1>
        <p className="title-tagline">{ES.tagline}</p>
        <div className="title-actions">
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={() => {
              audio.unlock();
              audio.play('confirm');
              enterGame();
            }}
          >
            <Icon name="play" /> {ES.play}
          </button>
          {profile.camino ? (
            <button type="button" className="btn btn-lg" onClick={() => openCollection('title')}>
              <Icon name="cards" /> Colección
            </button>
          ) : null}
          <button type="button" className="btn btn-lg" onClick={() => setHelp(true)}>
            {ES.howToPlay}
          </button>
        </div>
      </div>
      {profile.camino ? (
        <div className={`title-profile el-${profile.camino}`}>
          <span>{CAMINO_TITLE[profile.camino]}</span>
          <CoinChip amount={profile.coins} />
        </div>
      ) : null}
      <div className="title-ninjas" aria-hidden="true">
        {ELEMENTS.map((el) => (
          <img key={el} src={art.ninja(el)} alt="" />
        ))}
      </div>
      <div className="title-foot">Proyecto de clase. Arte, sonido y música generados en código.</div>
    </div>
  );
}

export function TeamScreen() {
  const settings = useApp((s) => s.settings);
  const profile = useApp((s) => s.profile);
  const welcome = useApp((s) => s.welcome);
  const reserveOf = (el: (typeof ELEMENTS)[number]) => collectionSummary(profile.collection, el).total;
  const stormRisk =
    settings.difficulty === 'storm' &&
    ELEMENTS.some((el) => reserveOf(el) < BALANCE.starter.stormRecommendedPerElement);
  const welcomeCard = welcome ? bankCard(CAMINO_CARDS[welcome]) : undefined;
  return (
    <div className="screen team-screen">
      <div className="screen-head">
        <h1 className="display">{ES.team}</h1>
        {welcome ? (
          <p className="welcome">
            Bienvenida al {CAMINO_TITLE[welcome]}: recibiste{' '}
            {welcomeCard ? `${welcomeCard.name} (12)` : 'tu carta de camino'} y un 9 de cada elemento.
          </p>
        ) : (
          <p>{ES.teamIntro}</p>
        )}
      </div>
      <div className="team-grid">
        {ELEMENTS.map((el) => {
          const t = NINJA_TEXT[el];
          const st = BALANCE.ninjas[el];
          return (
            <section key={el} className={`class-card paper el-${el}`}>
              <span className="reserve-chip" title="Cartas de tu reserva para esta partida">
                <Icon name="cards" /> {PROGRESSION.reserve(reserveOf(el))}
              </span>
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
                <b>Carta:</b> {t.card}
              </p>
              <p>
                <b>Combo:</b> {t.combo.replace('En combo, ', '')}
              </p>
              <div className="stats">
                <div>
                  <b>{st.hp}</b>
                  <span>Vida</span>
                </div>
                <div>
                  <b>{st.attack}</b>
                  <span>Daño</span>
                </div>
                <div>
                  <b>{st.range}</b>
                  <span>Alcance</span>
                </div>
                <div>
                  <b>{st.move}</b>
                  <span>Paso</span>
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
          {stormRisk ? (
            <p className="storm-warn" role="note">
              {PROGRESSION.stormWarning}
            </p>
          ) : null}
        </div>
        <div>
          <h3 className="opt-title">Ayudas</h3>
          <Toggle label={ES.tipsMode} checked={settings.tips} onChange={(tips) => updateSettings({ tips })} />
          <Toggle
            label="Pasar al siguiente ninja"
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
      <div className="team-left">
        <CoinChip amount={profile.coins} />
        <button type="button" className="btn" onClick={() => openCollection('team')}>
          <Icon name="cards" /> {PROGRESSION.collection}
        </button>
      </div>
      <div className="team-actions">
        <button
          type="button"
          className="btn btn-lg"
          onClick={() => {
            dismissWelcome();
            goto('title');
          }}
        >
          {ES.back}
        </button>
        <button
          type="button"
          className="btn btn-primary btn-lg"
          onClick={() => {
            audio.unlock();
            audio.play('confirm');
            dismissWelcome();
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
        <div className="tip-label">Consejo</div>
        <p>{tip}</p>
      </div>
    </div>
  );
}

export function ResultsScreen() {
  const results = useApp((s) => s.results);
  const unlocked = useApp((s) => s.unlocked);
  const seed = useApp((s) => s.seed);
  const reduced = useApp((s) => s.settings.reducedMotion);
  const total = results?.reward.total ?? 0;
  const endBalance = results?.balance ?? 0;
  const shownTotal = useCountUp(total, { ms: 900, delay: 450, enabled: !reduced });
  const shownBalance = useCountUp(endBalance, { from: endBalance - total, ms: 900, delay: 450, enabled: !reduced });
  if (!results) return null;
  const { state, earned, fresh, reward } = results;
  const win = state.status === 'victory';
  const stats = state.stats;
  const outcome = BONUS_OUTCOME_TEXT[state.bonusOutcome];
  const unlockedCount = Object.keys(unlocked).length;
  return (
    <div className="screen results-screen">
      <div className="screen-head">
        <h1 className={`result-word display ${win ? 'win' : 'lose'}`}>{win ? ES.victory : ES.defeat}</h1>
        <p>
          {win
            ? 'Los tres aprendices resistieron la tormenta.'
            : 'La escarcha cubrió a los tres. Revisa el orden de acciones y vuelve a intentarlo.'}{' '}
          {outcome}
        </p>
      </div>
      <div className="results-body">
        <div className="results-left">
          <section className="paper">
            <div className="stat-grid">
              {(Object.keys(STAT_LABELS) as (keyof typeof STAT_LABELS)[]).map((k, i) => (
                <Stat key={k} label={STAT_LABELS[k]} value={stats[k]} delay={250 + i * 60} animate={!reduced} />
              ))}
            </div>
          </section>
          <section className="paper results-coins">
            <h2 className="display">{PROGRESSION.coins}</h2>
            {reward.lines.length === 0 ? (
              <p className="coin-empty">{PROGRESSION.noCoins}</p>
            ) : (
              <ul className="coin-lines">
                {reward.lines.map((l) => (
                  <li key={String(l.round)}>
                    <span>{l.round === 'bonus' ? 'Bonus' : `Ronda ${l.round}`}</span>
                    <b>+{l.coins}</b>
                  </li>
                ))}
                {reward.doubled ? (
                  <li className="double">
                    <span>{PROGRESSION.doubleCoins}</span>
                    <b>×2</b>
                  </li>
                ) : null}
              </ul>
            )}
            <div className="coin-total">
              <span>
                Total <b>+{shownTotal}</b>
              </span>
              <span className="coin-balance">
                Ahora tienes <CoinChip amount={shownBalance} />
              </span>
            </div>
            <div className="coin-meta">
              Dificultad {DIFFICULTIES[state.difficulty].label.toLowerCase()}, mapa {MAP_NAMES[state.mapId]}.{' '}
              {state.stats.turnsToClearMain !== null ? `Rondas 1 a 3 en ${state.stats.turnsToClearMain} turnos. ` : ''}
              {BONUS_SHORT[state.bonusCondition]}.
            </div>
          </section>
        </div>
        <section className="paper ach-list">
          <h2 className="display">
            {ES.achievements} · {unlockedCount} de {ACHIEVEMENT_IDS.length}
          </h2>
          {ACHIEVEMENT_IDS.map((id, i) => {
            const got = earned.includes(id);
            const ever = !!unlocked[id];
            const t = ACHIEVEMENT_TEXT[id];
            return (
              <div key={id} className={`ach ${ever ? 'got' : 'off'}`} style={{ animationDelay: `${0.4 + i * 0.05}s` }}>
                <span className="medal">{ever ? <Icon name="check" /> : null}</span>
                <span>
                  <b>{t.name}</b>
                  {t.detail}
                </span>
                {fresh.includes(id) ? (
                  <span className="badge-new">{ES.newAchievement}</span>
                ) : got ? (
                  <span />
                ) : (
                  <span />
                )}
              </div>
            );
          })}
        </section>
      </div>
      <div className="results-seed">
        {ES.seed}: {seed} · {DIFFICULTIES[state.difficulty].label}
      </div>
      <div className="results-actions">
        <button type="button" className="btn btn-lg" onClick={() => goto('title')}>
          {ES.menu}
        </button>
        <button type="button" className="btn btn-lg" onClick={() => openCollection('results')}>
          <Icon name="cards" /> {PROGRESSION.collection}
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

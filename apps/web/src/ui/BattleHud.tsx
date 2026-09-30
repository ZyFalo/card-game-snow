import { type ElementKind, type Ninja, resolutionOrder } from '@ventisca/core';
import { useEffect, useReducer, useRef, useState } from 'react';
import { art } from '../art';
import { audio } from '../audio/audio';
import { BONUS_SHORT, ES, NINJA_TEXT } from '../i18n/es';
import { confirmTurn, selectCard, selectNinja, setBoost, setHelp, suggest, togglePause } from '../state/actions';
import { bonusProgress, contextualTip, planLabel, planStatus, plansArray } from '../state/planning';
import { useApp } from '../state/store';
import { ElementGlyph, Icon } from './common';

export function BattleHud() {
  const blocked = useApp((s) => s.paused || s.helpOpen);
  return (
    <div className="hud" inert={blocked}>
      <TipBar />
      <TurnControls />
      <RoundInfo />
      <Notice />
      <NinjaPanels />
      <Hand />
    </div>
  );
}

function TipBar() {
  const tip = useApp((s) => (s.settings.tips ? contextualTip(s) : null));
  if (!tip) return null;
  return (
    <div className="tip" aria-live="polite">
      <Icon name="flake" />
      <span key={tip} className="tip-text">
        {tip}
      </span>
    </div>
  );
}

const RING = 2 * Math.PI * 22;
const METER_SEGMENTS = ['m1', 'm2', 'm3', 'm4', 'm5'] as const;
const HAND_SLOTS = ['h1', 'h2', 'h3', 'h4'] as const;

function Timer() {
  const timer = useApp((s) => s.timer);
  const phase = useApp((s) => s.phase);
  const [, redraw] = useReducer((x: number) => x + 1, 0);
  const lastTick = useRef<number | null>(null);

  useEffect(() => {
    if (timer.deadline === null) return;
    let raf = 0;
    const loop = () => {
      redraw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [timer.deadline]);

  const remaining = timer.deadline !== null ? Math.max(0, timer.deadline - performance.now()) : timer.remaining;
  const secs = remaining !== null ? Math.ceil(remaining / 1000) : null;

  useEffect(() => {
    if (secs !== null && secs <= 3 && secs > 0 && timer.deadline !== null) {
      if (lastTick.current !== secs) {
        lastTick.current = secs;
        audio.play('tick');
      }
    } else if (secs === null || secs > 3) {
      lastTick.current = null;
    }
  }, [secs, timer.deadline]);

  if (phase !== 'planning' || timer.total === null || remaining === null || secs === null) {
    const label = phase === 'planning' ? ES.noTimer : ES.resolving;
    return (
      <div className="timer" role="img" aria-label={label} title={label}>
        <svg viewBox="0 0 56 56" aria-hidden="true">
          <circle cx="28" cy="28" r="22" fill="#F6F9FB" stroke="#1F2440" strokeWidth="2.5" />
        </svg>
        <span className="num">{phase === 'planning' ? '∞' : '·'}</span>
      </div>
    );
  }
  const frac = remaining / timer.total;
  const urgent = secs <= 3;
  return (
    <div className={`timer ${urgent ? 'urgent' : ''}`} role="timer" aria-label={`${secs} segundos`}>
      <svg viewBox="0 0 56 56" aria-hidden="true">
        <circle cx="28" cy="28" r="22" fill="#F6F9FB" stroke="#1F2440" strokeWidth="2.5" />
        <circle
          cx="28"
          cy="28"
          r="22"
          fill="none"
          stroke={urgent ? '#D14545' : '#F2B84B'}
          strokeWidth="6"
          strokeDasharray={RING}
          strokeDashoffset={RING * (1 - frac)}
          strokeLinecap="round"
        />
      </svg>
      <span className="num">{secs}</span>
    </div>
  );
}

function TurnControls() {
  const phase = useApp((s) => s.phase);
  const paused = useApp((s) => s.paused);
  const boosting = useApp((s) => s.boosting);
  if (phase === 'resolving') {
    // Mantener pulsado acelera la resolución (igual que mantener Espacio).
    return (
      <div className="turnbox interactive">
        <Timer />
        <button
          type="button"
          className={`btn confirm accelerate ${boosting ? 'on' : ''}`}
          aria-pressed={boosting}
          onPointerDown={() => setBoost(true)}
          onPointerUp={() => setBoost(false)}
          onPointerLeave={() => setBoost(false)}
          onPointerCancel={() => setBoost(false)}
        >
          {boosting ? ES.accelerating : ES.accelerate} <span className="kbd">Espacio</span>
        </button>
      </div>
    );
  }
  return (
    <div className="turnbox interactive">
      <Timer />
      <button
        type="button"
        className="btn btn-primary confirm"
        disabled={phase !== 'planning' || paused}
        onClick={() => void confirmTurn()}
      >
        {phase === 'planning' ? (
          <>
            {ES.confirmTurn} <span className="kbd">Espacio</span>
          </>
        ) : (
          ES.preparing
        )}
      </button>
    </div>
  );
}

function RoundInfo() {
  const view = useApp((s) => s.view);
  const phase = useApp((s) => s.phase);
  if (!view) return null;
  const progress = bonusProgress(view);
  return (
    <div className="roundbox">
      <div className="chip">
        <span className="round">{ES.round(view.round)}</span>
        <span className="bonus">
          <small>{BONUS_SHORT[view.bonusCondition]}</small>
          <small className={progress.cls}>{progress.text}</small>
        </span>
      </div>
      <button
        type="button"
        className="icon-btn interactive"
        onClick={suggest}
        disabled={phase !== 'planning'}
        aria-label={`${ES.suggest} (S)`}
        title={`${ES.suggest} (S)`}
      >
        <Icon name="bulb" />
      </button>
      <button
        type="button"
        className="icon-btn interactive"
        onClick={() => {
          togglePause(true);
          setHelp(true);
        }}
        aria-label={ES.howToPlay}
        title={ES.howToPlay}
      >
        <Icon name="help" />
      </button>
      <button
        type="button"
        className="icon-btn interactive"
        onClick={() => togglePause(true)}
        aria-label={`${ES.pause} (P)`}
        title={`${ES.pause} (P)`}
      >
        <Icon name="pause" />
      </button>
    </div>
  );
}

function Notice() {
  const notice = useApp((s) => s.notice);
  if (!notice) return null;
  return (
    <div key={notice.key} className="notice" role="status">
      {notice.text}
    </div>
  );
}

function NinjaPanel({ n, order }: { n: Ninja; order: number | undefined }) {
  const plan = useApp((s) => s.plans[n.id]);
  const match = useApp((s) => s.match);
  const isActive = useApp((s) => s.active === n.id);
  const planning = useApp((s) => s.phase === 'planning');
  const reduced = useApp((s) => s.settings.reducedMotion);
  const t = NINJA_TEXT[n.id];
  const status = match ? planStatus(plan, n) : 'none';
  const label = match ? planLabel(plan, n, match) : '';
  const frac = Math.max(0, n.hp / n.maxHp);
  const filled = Math.floor(n.meter / 2);
  const charged = n.meter >= 10;

  // Rastro de vida perdida: se queda un instante y luego se encoge (al curar, salta).
  const [ghost, setGhost] = useState(frac);
  useEffect(() => {
    if (frac >= ghost) {
      setGhost(frac);
      return;
    }
    const id = window.setTimeout(() => setGhost(frac), reduced ? 0 : 380);
    return () => window.clearTimeout(id);
  }, [frac, ghost, reduced]);

  // Reacciones del panel: temblor al recibir daño, segmentos que saltan y descarga al robar.
  const inner = useRef<HTMLSpanElement>(null);
  const meter = useRef<HTMLDivElement>(null);
  const last = useRef({ hp: n.hp, meter: n.meter, deck: n.deck.length });
  useEffect(() => {
    const prev = last.current;
    last.current = { hp: n.hp, meter: n.meter, deck: n.deck.length };
    if (reduced) return;
    if (n.hp < prev.hp && n.hp > 0) {
      inner.current?.animate(
        [
          { transform: 'translateX(0)' },
          { transform: 'translateX(-6px)' },
          { transform: 'translateX(5px)' },
          { transform: 'translateX(-2px)' },
          { transform: 'translateX(0)' },
        ],
        { duration: 300, easing: 'ease-out' },
      );
    }
    const segs = meter.current?.children;
    if (segs && n.meter > prev.meter) {
      for (let i = Math.floor(prev.meter / 2); i < Math.floor(n.meter / 2); i++) {
        (segs[i] as HTMLElement | undefined)?.animate(
          [{ transform: 'scale(1)' }, { transform: 'scale(1.55)', offset: 0.4 }, { transform: 'scale(1)' }],
          { duration: 380, easing: 'ease-out' },
        );
      }
    }
    if (n.deck.length < prev.deck) {
      meter.current?.animate(
        [
          { filter: 'brightness(1)', transform: 'scaleY(1)' },
          { filter: 'brightness(1.9)', transform: 'scaleY(1.5)', offset: 0.3 },
          { filter: 'brightness(1)', transform: 'scaleY(1)' },
        ],
        { duration: 520, easing: 'ease-out' },
      );
    }
  }, [n.hp, n.meter, n.deck.length, reduced]);

  return (
    <button
      type="button"
      data-ninja-panel={n.id}
      className={`ninja-panel paper interactive el-${n.id} ${isActive && planning ? 'active' : ''} ${n.hp <= 0 ? 'ko' : ''}`}
      onClick={() => selectNinja(n.id)}
      aria-pressed={isActive}
      aria-label={`${t.name}, ${n.hp} de ${n.maxHp} de vida. ${label}`}
    >
      <span ref={inner} className="np-inner">
        {order ? (
          <span className="np-order" title="Orden de resolución">
            {order}
          </span>
        ) : null}
        <div className="np-top">
          <img src={art.bust(n.id)} alt="" />
          <div>
            <div className="np-name">{t.name}</div>
            <div className="np-el" title={t.role}>
              {t.element}
            </div>
          </div>
        </div>
        <div className={`bar ${frac <= 0.3 ? 'low' : ''}`}>
          <i className="ghost" style={{ width: `${Math.max(frac, ghost) * 100}%` }} />
          <i className="fill" style={{ width: `${frac * 100}%` }} />
          <span>
            {n.hp} / {n.maxHp}
          </span>
        </div>
        <div className="meter-row">
          <div
            ref={meter}
            className={`meter ${charged ? 'charged' : ''}`}
            title={charged ? 'Medidor lleno: juega una carta para robar otra' : `Medidor ${n.meter} de 10`}
          >
            {METER_SEGMENTS.map((seg, i) => (
              <i key={seg} className={i < filled ? 'on' : ''} />
            ))}
          </div>
          <span>{ES.deck(n.deck.length)}</span>
        </div>
        <div className="np-foot">
          {planning || status === 'ko' ? (
            <span key={label} className={`plan-pill ${status === 'ko' ? 'ko' : status === 'none' ? '' : 'set'}`}>
              {label}
            </span>
          ) : (
            <span />
          )}
          <span className="np-status">
            {n.shield ? <img src={art.icon('shield')} alt="Escudo" title="Escudo: anula el siguiente golpe" /> : null}
            {n.boost ? (
              <img src={art.icon('boost')} alt="Potencia" title="Potencia: +50 % en el siguiente golpe o cura" />
            ) : null}
          </span>
        </div>
      </span>
    </button>
  );
}

function NinjaPanels() {
  const ninjas = useApp((s) => s.view?.ninjas);
  const match = useApp((s) => s.match);
  const plans = useApp((s) => s.plans);
  if (!ninjas) return null;
  // D-32: el orden real de R-11 según los planes del momento; sin acción no hay número.
  const order = match ? resolutionOrder(match, plansArray(plans)) : {};
  return (
    <div className="panels">
      {ninjas.map((n) => (
        <NinjaPanel key={n.id} n={n} order={order[n.id]} />
      ))}
    </div>
  );
}

function Hand() {
  const active = useApp((s) => s.active);
  const view = useApp((s) => s.view);
  const plans = useApp((s) => s.plans);
  const pendingCard = useApp((s) => s.pendingCard);
  const phase = useApp((s) => s.phase);
  const incoming = useApp((s) => s.incoming);
  const arrived = useApp((s) => s.arrived);
  const last = useRef<ElementKind>('fire');
  if (active) last.current = active;
  const shown = active ?? last.current;
  const ninja = view?.ninjas.find((n) => n.id === shown);
  if (!ninja) return null;
  const plan = plans[shown];
  const placed = plan?.action?.type === 'card' ? plan.action.cardId : null;
  const usable = phase === 'planning' && ninja.hp > 0 && active === shown;
  return (
    <div className={`hand interactive el-${shown}`}>
      <div className="hand-head">
        {ES.hand(NINJA_TEXT[shown].name)}
        <span>Teclas 1 a 4 · clic derecho o Esc deshace</span>
      </div>
      <div className="cards">
        {HAND_SLOTS.map((slot, i) => {
          const card = ninja.hand[i];
          if (!card) {
            return (
              <div key={slot} className="card empty">
                {ES.emptySlot}
              </div>
            );
          }
          const t = NINJA_TEXT[card.element];
          return (
            <button
              key={card.id}
              type="button"
              data-card-id={card.id}
              className={`card el-${card.element} ${pendingCard === card.id ? 'selected' : ''} ${placed === card.id ? 'placed' : ''} ${incoming.includes(card.id) ? 'incoming' : ''} ${arrived.includes(card.id) ? 'arrived' : ''}`}
              disabled={!usable}
              onClick={() => selectCard(card.id)}
              aria-pressed={pendingCard === card.id || placed === card.id}
              aria-label={`Carta de ${t.element} de valor ${card.value}`}
              title={t.card}
            >
              <span className="band">
                <span>{t.element}</span>
                <span>{i + 1}</span>
              </span>
              <span className="value">{card.value}</span>
              <ElementGlyph el={card.element} className="glyph" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

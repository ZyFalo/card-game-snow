import { BALANCE, type ElementKind, type Ninja, resolutionOrder } from '@ventisca/core';
import { type CSSProperties, useEffect, useReducer, useRef, useState } from 'react';
import { art } from '../art';
import { audio } from '../audio/audio';
import { BONUS_SHORT, DEMO_TEXT, ES, HUD, MOMENT_TIP, NINJA_TEXT, ONLINE_TEXT as O } from '../i18n/es';
import {
  closeDemo,
  confirmTurn,
  holdSpotted,
  learnTip,
  openCardDemo,
  openGolemDemo,
  selectCard,
  selectNinja,
  setBoost,
  setHelp,
  suggest,
  togglePause,
} from '../state/actions';
import { askLeave, leaveMatch } from '../state/online';
import { bonusProgress, contextualTip, namedGolem, planLabel, planStatus, plansArray } from '../state/planning';
import { useApp } from '../state/store';
import { isAsleep, onlineTip, SEAT_TEXT, seatState, whoPlays } from '../state/team';
import { type BubbleSlot, bubbleSlot, type MomentTip, momentTip } from '../state/tips';
import { ElementGlyph, Icon } from './common';
import { DemoLayer } from './Demos';
import { Dialog } from './Online';

export function BattleHud() {
  const blocked = useApp((s) => s.paused || s.helpOpen || s.online.leaving);
  const online = useApp((s) => !s.local && s.online.match !== null);
  return (
    <>
      <div className={`hud ${online ? 'hud-online' : ''}`} inert={blocked}>
        <TipBar />
        {online ? <OnlineTurnControls /> : <TurnControls />}
        <RoundInfo />
        <Toast />
        {online ? <NetStrip /> : null}
        <NinjaPanels />
        <Hand />
        <DemoLayer />
      </div>
      {online ? <LeaveDialog /> : null}
    </>
  );
}

function TipBar() {
  // En línea la franja dice además a quién se espera y anuncia el combo (D-91).
  const tip = useApp((s) => (s.settings.tips ? (s.local ? contextualTip(s) : onlineTip(s)) : null));
  // El gólem que la franja está nombrando: con él va el botón de su demostración (D-82).
  const golem = useApp(namedGolem);
  const open = useApp((s) => s.demo?.kind === 'golem');
  if (!tip) return null;
  return (
    // Con el ratón sobre la franja, el gólem se queda: así se llega a su botón.
    <div
      className="tip interactive"
      aria-live="polite"
      onPointerEnter={() => holdSpotted(true)}
      onPointerLeave={() => holdSpotted(false)}
    >
      <Icon name="flake" />
      <span key={tip} className="tip-text">
        {tip}
      </span>
      {golem ? (
        <button
          type="button"
          className={`tip-demo ${open ? 'on' : ''}`}
          aria-expanded={open}
          onClick={() => (open ? closeDemo() : openGolemDemo(golem))}
        >
          <Icon name="play" />
          {DEMO_TEXT.showAttack}
        </button>
      ) : null}
    </div>
  );
}

/** El consejo en el momento que toca mostrar ahora (D-80), o `null`. */
function useMomentTip(): MomentTip | null {
  const phase = useApp((s) => s.phase);
  const settings = useApp((s) => s.settings);
  const match = useApp((s) => s.match);
  const plans = useApp((s) => s.plans);
  const active = useApp((s) => s.active);
  const pendingCard = useApp((s) => s.pendingCard);
  const local = useApp((s) => s.local);
  // Una burbuja a la vez: con una demostración abierta (D-81), el consejo espera.
  const demo = useApp((s) => s.demo !== null);
  return demo ? null : momentTip({ phase, settings, match, plans, active, pendingCard, local });
}

/**
 * La burbuja de un consejo en el momento (D-80): va siempre junto a la mano, nunca sobre el tablero, con
 * una franja del color del ninja del que habla, y se cierra con "Entendido" o con Enter. Lo que señala
 * lleva el borde dorado (`tip-mark`): el panel de ese ninja o sus cartas.
 */
function TipBubble({ tip, slot }: { tip: MomentTip; slot: BubbleSlot }) {
  return (
    <div className={`bubble paper interactive el-${tip.ninja} at-${slot}`} role="status" data-tip={tip.id}>
      <p>{tip.text}</p>
      <button
        type="button"
        className="link"
        title={MOMENT_TIP.dismissTitle}
        aria-keyshortcuts="Enter"
        onClick={() => learnTip(tip.id)}
      >
        {MOMENT_TIP.dismiss}
      </button>
    </div>
  );
}

const RING = 2 * Math.PI * 22;
const METER_SEGMENTS = ['m1', 'm2', 'm3', 'm4', 'm5'] as const;

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

/** Cuántos segundos dura el turno en línea: uno por porción de la tarta (R-36). */
const PIE_R = 24;

/** Una porción de la tarta, la `k` de `n`, empezando arriba y en el sentido del reloj. */
function slicePath(k: number, n: number, r: number): string {
  const a0 = (k / n) * 2 * Math.PI - Math.PI / 2;
  const a1 = ((k + 1) / n) * 2 * Math.PI - Math.PI / 2;
  const p = (a: number) => `${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
  return `M0 0 L${p(a0)} A${r} ${r} 0 0 1 ${p(a1)} Z`;
}

/**
 * El reloj de una partida en línea (R-36): una tarta con una porción por segundo, que pierde una cada
 * segundo. En los últimos 3 cambia por el número, grande. El reloj es del servidor: aquí solo se dibuja.
 */
function PieTimer() {
  const timer = useApp((s) => s.timer);
  const planning = useApp((s) => s.phase === 'planning');
  const [, redraw] = useReducer((x: number) => x + 1, 0);
  const lastTick = useRef<number | null>(null);
  const running = planning && timer.deadline !== null && timer.total !== null;

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(redraw, 100);
    return () => window.clearInterval(id);
  }, [running]);

  const remaining = running && timer.deadline !== null ? Math.max(0, timer.deadline - performance.now()) : null;
  const total = timer.total !== null ? Math.max(1, Math.round(timer.total / 1000)) : 10;
  const secs = remaining !== null ? Math.min(total, Math.ceil(remaining / 1000)) : null;

  useEffect(() => {
    if (secs !== null && secs <= 3 && secs > 0) {
      if (lastTick.current !== secs) {
        lastTick.current = secs;
        audio.play('tick');
      }
    } else {
      lastTick.current = null;
    }
  }, [secs]);

  if (secs === null) {
    return (
      <div className="pie" role="img" aria-label={ES.resolving} title={ES.resolving}>
        <svg viewBox="-28 -28 56 56" aria-hidden="true">
          <circle r={PIE_R + 2} className="pie-rim" />
        </svg>
      </div>
    );
  }
  if (secs <= 3) {
    return (
      <div className="pie urgent" role="timer" aria-label={O.secondsLeft(secs)} data-seconds={secs}>
        <span className="display">{secs}</span>
      </div>
    );
  }
  return (
    <div className="pie" role="timer" aria-label={O.secondsLeft(secs)} data-seconds={secs}>
      <svg viewBox="-28 -28 56 56" aria-hidden="true">
        <circle r={PIE_R + 2} className="pie-rim" />
        {Array.from({ length: total }, (_, k) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: las porciones son fijas, una por segundo
          <path key={k} d={slicePath(k, total, PIE_R - 2)} className={k < secs ? (k % 2 ? 'on alt' : 'on') : 'off'} />
        ))}
      </svg>
    </div>
  );
}

/**
 * En línea: la tarta pegada a "Confirmar", que pasa a "Listo" cuando esta persona ya confirmó. Confirmar
 * es definitivo; el turno se resuelve al confirmar todos o al llegar a cero.
 */
function OnlineTurnControls() {
  const phase = useApp((s) => s.phase);
  const boosting = useApp((s) => s.boosting);
  const match = useApp((s) => s.online.match);
  const open = useApp((s) => s.online.link === 'open');
  const waiting = match?.waiting ?? false;
  if (phase === 'resolving' && !waiting) {
    return (
      <div className="turnbox interactive">
        <PieTimer />
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
  const ready = !!match && match.ready.includes(match.you);
  const plays = !!match?.plays && phase === 'planning';
  return (
    <div className="turnbox interactive">
      <PieTimer />
      {ready && plays ? (
        <button type="button" className="btn confirm is-ready" disabled>
          <Icon name="check" /> {O.ready}
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-primary confirm"
          disabled={!plays || !open}
          onClick={() => void confirmTurn()}
        >
          {phase === 'planning' ? (
            <>
              {O.confirm} <span className="kbd">Espacio</span>
            </>
          ) : (
            ES.preparing
          )}
        </button>
      )}
    </div>
  );
}

/** Las franjas de la conexión, arriba y sin bloquear el tablero: se perdió, o esta persona acaba de volver. */
function NetStrip() {
  const link = useApp((s) => s.online.link);
  const back = useApp((s) => s.online.back);
  if (link === 'reconnecting' || link === 'connecting') {
    return (
      <div className="net-strip paper lost" role="alert">
        <span className="spin" aria-hidden="true">
          <Icon name="spin" />
        </span>
        <span>
          <b>{O.lostTitle}</b> {O.lostBody}
        </span>
      </div>
    );
  }
  if (back) {
    return (
      <div className="net-strip paper back" role="status">
        <span className="net-icon" aria-hidden="true">
          <Icon name="plug" />
        </span>
        <span>
          <b>{O.backTitle}</b> {O.backBody}
        </span>
      </div>
    );
  }
  return null;
}

/** "¿Salir de la partida?": salir es abandonar (R-39). El principal es "Seguir jugando", al final de la fila. */
function LeaveDialog() {
  const leaving = useApp((s) => s.online.leaving);
  if (!leaving) return null;
  return (
    <Dialog
      icon="door"
      tone="danger"
      title={O.leaveTitle}
      actions={
        <>
          <button type="button" className="btn" onClick={leaveMatch}>
            {O.leaveConfirm}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => askLeave(false)}>
            {O.leaveCancel}
          </button>
        </>
      }
    >
      {O.leaveBody}
    </Dialog>
  );
}

function RoundInfo() {
  const view = useApp((s) => s.view);
  const phase = useApp((s) => s.phase);
  const online = useApp((s) => !s.local && s.online.match !== null);
  if (!view) return null;
  const progress = bonusProgress(view);
  if (online) {
    // En línea no hay pausa ni "Sugerir jugada": la ayuda, y la ✕, que es salir de la partida (R-39).
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
          onClick={() => setHelp(true)}
          aria-label={ES.howToPlay}
          title={ES.howToPlay}
        >
          <Icon name="help" />
        </button>
        <button
          type="button"
          className="icon-btn interactive leave-x"
          onClick={() => askLeave(true)}
          aria-label={O.leaveMatch}
          title={O.leaveMatch}
        >
          <Icon name="close" />
        </button>
      </div>
    );
  }
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

function Toast() {
  const notice = useApp((s) => s.notice);
  if (!notice) return null;
  return (
    <div key={notice.key} className="toast" role="status">
      {notice.text}
    </div>
  );
}

function NinjaPanel({ n, order, marked }: { n: Ninja; order: number | undefined; marked: boolean }) {
  const plan = useApp((s) => s.plans[n.id]);
  const match = useApp((s) => s.match);
  const isActive = useApp((s) => s.active === n.id);
  const planning = useApp((s) => s.phase === 'planning');
  const reduced = useApp((s) => s.settings.reducedMotion);
  // En línea: de quién es el ninja y cómo va esa persona (planeando, lista, desconectada o fuera).
  const om = useApp((s) => (s.local ? null : s.online.match));
  const seat = useApp((s) => (!s.local && s.online.match ? seatState(s, s.online.match, n.id) : null));
  const mine = om?.you === n.id;
  const asleep = isAsleep(om, n.id);
  const t = NINJA_TEXT[n.id];
  const status = match ? planStatus(plan, n) : 'none';
  const label = match ? planLabel(plan, n, match) : '';
  const spoken = match ? planLabel(plan, n, match, true) : '';
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

  const who = om ? whoPlays(om, n.id) : null;
  const body = (
    <>
      <span ref={inner} className="np-inner">
        {order ? (
          <span className="np-order" title={HUD.orderTitle}>
            {order}
          </span>
        ) : null}
        <div className="np-top">
          <img src={asleep ? art.asleep(n.id) : art.bust(n.id)} alt="" />
          <div>
            <div className="np-name">{t.name}</div>
            {who === null ? (
              <div className="np-el" title={t.role}>
                {t.element}
              </div>
            ) : (
              <div className="np-el np-who" title={`${t.element} · ${t.role}`}>
                {who}
              </div>
            )}
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
            title={charged ? HUD.meterFull : HUD.meter(n.meter, BALANCE.meter.max)}
          >
            {METER_SEGMENTS.map((seg, i) => (
              <i key={seg} className={i < filled ? 'on' : ''} />
            ))}
          </div>
          <span>{ES.deck(n.deck.length)}</span>
        </div>
        {/* Los estados van arriba, bajo el número de orden: el resumen del plan ocupa todo el pie. */}
        <span className="np-status">
          {n.shield ? <img src={art.icon('shield')} alt={HUD.shield} title={HUD.shieldTitle} /> : null}
          {n.boost ? <img src={art.icon('boost')} alt={HUD.boost} title={HUD.boostTitle} /> : null}
        </span>
        <div className="np-foot">
          {om ? (
            seat ? (
              <span key={seat} className={`plan-pill seat-pill is-${seat}`}>
                {seat === 'ready' ? <Icon name="check" /> : null}
                {seat === 'planning' ? <Icon name="pencil" /> : null}
                {SEAT_TEXT[seat]}
              </span>
            ) : null
          ) : planning || status === 'ko' ? (
            <span key={label} className={`plan-pill ${status === 'ko' ? 'ko' : status === 'none' ? '' : 'set'}`}>
              {label}
            </span>
          ) : null}
        </div>
      </span>
    </>
  );
  if (om) {
    // En línea cada persona lleva a un solo ninja: los paneles informan, no se eligen.
    return (
      <section
        data-ninja-panel={n.id}
        data-seat-state={seat ?? 'idle'}
        className={`ninja-panel paper el-${n.id} ${mine ? 'mine' : ''} ${asleep ? 'asleep' : ''} ${n.hp <= 0 ? 'ko' : ''} ${marked ? 'tip-mark' : ''}`}
        aria-label={`${O.seatOf(t.name, who ?? '')}. ${HUD.panelLabel(t.name, n.hp, n.maxHp, seat ? SEAT_TEXT[seat] : '')}`}
      >
        {body}
      </section>
    );
  }
  return (
    <button
      type="button"
      data-ninja-panel={n.id}
      className={`ninja-panel paper interactive el-${n.id} ${isActive && planning ? 'active' : ''} ${n.hp <= 0 ? 'ko' : ''} ${marked ? 'tip-mark' : ''}`}
      onClick={() => selectNinja(n.id)}
      aria-pressed={isActive}
      aria-label={HUD.panelLabel(t.name, n.hp, n.maxHp, spoken)}
    >
      {body}
    </button>
  );
}

function NinjaPanels() {
  const ninjas = useApp((s) => s.view?.ninjas);
  const match = useApp((s) => s.match);
  const plans = useApp((s) => s.plans);
  const tip = useMomentTip();
  if (!ninjas) return null;
  // D-32: el orden real de R-11 según los planes del momento; sin acción no hay número.
  const order = match ? resolutionOrder(match, plansArray(plans)) : {};
  return (
    <div className="panels">
      {/* El panel del ninja del que habla el consejo en pantalla lleva el borde dorado (D-80). */}
      {ninjas.map((n) => (
        <NinjaPanel key={n.id} n={n} order={order[n.id]} marked={tip?.mark === 'panel' && tip.ninja === n.id} />
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
  const demo = useApp((s) => s.demo);
  const tip = useMomentTip();
  const you = useApp((s) => (s.local ? null : (s.online.match?.you ?? null)));
  const last = useRef<ElementKind>('fire');
  if (active) last.current = active;
  // En línea cada persona ve solo su mano (R-35), tenga o no el turno a medias.
  const shown = you ?? active ?? last.current;
  // La demostración de las cartas es la de las que se ven: si la mano pasa a otro ninja, se cierra.
  const cardDemo = demo?.kind === 'card' ? demo.ninja : null;
  const demoOpen = cardDemo === shown;
  useEffect(() => {
    if (cardDemo && !demoOpen) closeDemo();
  }, [cardDemo, demoOpen]);
  const ninja = view?.ninjas.find((n) => n.id === shown);
  if (!ninja) return null;
  const plan = plans[shown];
  const placed = plan?.action?.type === 'card' ? plan.action.cardId : null;
  const usable = phase === 'planning' && ninja.hp > 0 && active === shown;
  // La burbuja de los consejos va siempre aquí: en el espacio libre junto a las cartas, o encima si no lo hay.
  const count = ninja.hand.length;
  return (
    <div
      className={`hand interactive el-${shown} ${tip ? 'has-tip' : ''}`}
      style={{ '--cards': count } as CSSProperties}
    >
      <div className="hand-head">
        <div className="hand-title">
          {ES.hand(NINJA_TEXT[shown].name)}
          {/* Un solo ▶ para toda la mano: las cartas de un ninja son de su elemento y hacen lo mismo. */}
          <button
            type="button"
            className={`demo-open ${demoOpen ? 'on' : ''}`}
            aria-label={DEMO_TEXT.open(NINJA_TEXT[shown].name)}
            title={DEMO_TEXT.open(NINJA_TEXT[shown].name)}
            aria-expanded={demoOpen}
            onClick={() => (demoOpen ? closeDemo() : openCardDemo(shown))}
          >
            <Icon name="play" />
          </button>
        </div>
        <span>{HUD.handHint}</span>
      </div>
      {/* Solo las cartas que hay: un lugar sin carta no se dibuja. Sin ninguna, dice cómo se ganan. */}
      <div className="cards">
        {ninja.hand.length === 0 ? <p className="hand-empty">{HUD.handEmpty}</p> : null}
        {ninja.hand.map((card, i) => {
          const t = NINJA_TEXT[card.element];
          // La carta de la que habla el consejo en pantalla: la primera, o todas las de la mano (D-80).
          const marked = tip?.mark === 'hand' || (tip?.mark === 'card' && i === 0);
          return (
            <button
              key={card.id}
              type="button"
              data-card-id={card.id}
              className={`card el-${card.element} ${pendingCard === card.id ? 'selected' : ''} ${placed === card.id ? 'placed' : ''} ${incoming.includes(card.id) ? 'incoming' : ''} ${arrived.includes(card.id) ? 'arrived' : ''} ${marked ? 'tip-mark' : ''}`}
              disabled={!usable}
              onClick={() => selectCard(card.id)}
              aria-pressed={pendingCard === card.id || placed === card.id}
              aria-label={HUD.card(t.element, card.value)}
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
      {tip ? <TipBubble key={tip.id} tip={tip} slot={bubbleSlot(count)} /> : null}
    </div>
  );
}

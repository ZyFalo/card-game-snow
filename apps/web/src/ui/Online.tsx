import { BALANCE, collectionSummary, ELEMENTS, type ElementKind } from '@ventisca/core';
import { formatRoomCode } from '@ventisca/protocol';
import { type FormEvent, type ReactNode, useEffect, useReducer, useRef, useState } from 'react';
import { art } from '../art';
import { audio } from '../audio/audio';
import {
  ACCOUNT_TEXT,
  DIFFICULTIES,
  ES,
  NOTEBOOK_TEXT as N,
  NINJA_TEXT,
  ONLINE_TEXT as O,
  PLAY_ERRORS,
  SCREEN_TEXT,
} from '../i18n/es';
import { type FoldView, foldView } from '../state/achievements';
import { updateSettings } from '../state/actions';
import { openNotebook } from '../state/notebook';
import {
  acceptBot,
  backToTitle,
  closeOnline,
  connectHere,
  createRoom,
  cyclePick,
  dismissNotice,
  dismissRoomClosed,
  joinQueue,
  joinRoom,
  leaveQueue,
  leaveRoom,
  pickSeat,
  reloadPage,
  showPick,
  showRooms,
  signInAgain,
  startRoom,
} from '../state/online';
import { type OnlineState, type QueueView, type RoomView, useApp } from '../state/store';
import { Icon, type IconName, NinjaTrio, Notice, Toggle } from './common';
import { PickDemo } from './Demos';
import { AchievementLine } from './Notebook';

/*
 * Las pantallas del juego en línea fuera del tablero (D-87 a D-89 y D-100): la ficha para elegir ninja, la búsqueda
 * de equipo, las salas con código y sus avisos. Todas comparten el mismo escenario, con un lugar fijo para
 * cada elemento: Fuego a la izquierda, Agua al centro y Nieve a la derecha.
 *
 * Se componen sobre la grilla (lineamientos, sección 12) y son adaptables: el mismo marcado sirve en el
 * escenario de 1280×720 y, en ventanas angostas, a lo ancho de la pantalla (ver `online.css`).
 */

/** En la Beta solo se juega Clásica (D-85). */
const CLASSIC = DIFFICULTIES.classic.label;

/** La mayor cifra de cada dato entre los tres ninjas: el tope de su barra en la ficha. */
const STAT_MAX = {
  move: Math.max(...ELEMENTS.map((el) => BALANCE.ninjas[el].move)),
  range: Math.max(...ELEMENTS.map((el) => BALANCE.ninjas[el].range)),
  attack: Math.max(...ELEMENTS.map((el) => BALANCE.ninjas[el].attack)),
} as const;

const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** La ✕ de arriba a la derecha: en todas las pantallas en línea hace de "Volver" o de "Salir". */
function CloseButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="icon-btn online-x" onClick={onClick} aria-label={label} title={label}>
      <Icon name="close" />
    </button>
  );
}

export function BetaChip() {
  return <span className="beta-chip">{O.beta}</span>;
}

/** El escenario: el fondo de la cumbre y, encima, lo que cada pantalla ponga. */
function Scenery({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`scenery ${className}`}>
      <img className="scenery-bg" src={art.background('cumbre')} alt="" />
      {children}
    </div>
  );
}

/** La línea que dice cómo va la conexión mientras no está abierta. */
function LinkLine() {
  const link = useApp((s) => s.online.link);
  if (link !== 'connecting' && link !== 'reconnecting') return null;
  return (
    <p className="link-line" role="status">
      <span className="spin" aria-hidden="true">
        <Icon name="spin" />
      </span>
      {link === 'connecting' ? O.connecting : O.reconnecting}
    </p>
  );
}

/* ---------- La ficha: elegir ninja (D-87) ---------- */

/** Un pliegue al pie de la ficha (D-105): su título, con cuántos logros lleva, y el avance de cada uno. */
function PickFold({ view, title }: { view: FoldView; title: string }) {
  return (
    <section className={`pick-fold fold-${view.fold}`} data-fold={view.fold} aria-label={title}>
      <h2>{title}</h2>
      <ul className="ach-list">
        {view.rows.map((row) => (
          <AchievementLine key={row.id} row={row} />
        ))}
      </ul>
    </section>
  );
}

function PickScreen() {
  const element = useApp((s) => s.online.element);
  const busy = useApp((s) => s.online.busy);
  const open = useApp((s) => s.online.link === 'open');
  const error = useApp((s) => s.online.error);
  const roomClosed = useApp((s) => s.online.roomClosed);
  const camino = useApp((s) => s.progress.data?.camino ?? null);
  const collection = useApp((s) => s.progress.data?.collection);
  const achievements = useApp((s) => s.progress.data?.achievements);
  const tips = useApp((s) => s.settings.tips);
  const reduced = useApp((s) => s.settings.reducedMotion);
  const [demo, setDemo] = useState<'card' | 'combo' | null>(null);
  // Esc cierra la demostración abierta, como en el resto del juego.
  useEffect(() => {
    if (!demo) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setDemo(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [demo]);
  const t = NINJA_TEXT[element];
  const st = BALANCE.ninjas[element];
  const at = ELEMENTS.indexOf(element);
  const previous = ELEMENTS[(at + 2) % 3] as ElementKind;
  const next = ELEMENTS[(at + 1) % 3] as ElementKind;
  const total = collection ? collectionSummary(collection, element).total : null;
  const stats = [
    { label: O.stats.move, value: st.move, max: STAT_MAX.move },
    { label: O.stats.range, value: st.range, max: STAT_MAX.range },
    { label: O.stats.attack, value: st.attack, max: STAT_MAX.attack },
  ];
  const message = error && error !== 'code_empty' ? (PLAY_ERRORS[error as keyof typeof PLAY_ERRORS] ?? null) : null;
  return (
    <div className={`screen online-screen pick el-${element}`} data-online="pick">
      <CloseButton label={ES.back} onClick={closeOnline} />
      <div className="online-grid pick-body">
        <section className="paper pick-card" aria-label={O.pickLabel}>
          <div className="online-kicker">
            <span>{O.kicker}</span>
            <BetaChip />
            <button type="button" className="link pick-notebook" onClick={() => openNotebook('progress')}>
              {N.link} ▸
            </button>
          </div>
          <header>
            <img src={art.bust(element)} alt="" />
            <div>
              <h1 className="display">{t.name}</h1>
              <p>{total === null ? t.element : O.cardsOf(total, t.element)}</p>
            </div>
          </header>
          <dl className="pick-stats">
            {stats.map((s) => (
              <div key={s.label}>
                <dt>{s.label}</dt>
                <dd>
                  <span className="statbar" role="img" aria-label={O.statOf(s.label, s.value, s.max)}>
                    <i style={{ width: `${(s.value / s.max) * 100}%` }} />
                  </span>
                </dd>
              </div>
            ))}
          </dl>
          <div className="pick-line card-line">
            <button
              type="button"
              className="demo-open"
              aria-label={O.demoCard(t.name)}
              title={O.demoCard(t.name)}
              onClick={() => setDemo('card')}
            >
              <Icon name="play" />
            </button>
            <p>
              <b>{SCREEN_TEXT.cardLabel}</b> {t.card}
            </p>
          </div>
          <div className="pick-line combo-line">
            <button
              type="button"
              className="demo-open"
              aria-label={O.demoCombo(t.name)}
              title={O.demoCombo(t.name)}
              onClick={() => setDemo('combo')}
            >
              <Icon name="play" />
            </button>
            <p>
              <b>{SCREEN_TEXT.comboLabel}</b> {capital(t.comboShort)}
            </p>
          </div>
          {/* El avance que se juega con este ninja: su pliegue y el de equipo. Cambia con las flechas. */}
          {achievements ? (
            <div className="pick-folds">
              {[foldView(element, achievements), foldView('team', achievements)].map((view) => (
                <PickFold
                  key={view.fold}
                  view={view}
                  title={
                    view.fold === 'team'
                      ? N.teamFold(view.done, view.rows.length)
                      : N.yourFold(t.element, view.done, view.rows.length)
                  }
                />
              ))}
            </div>
          ) : null}
          <div className="pick-foot">
            <Toggle label={ES.tipsMode} checked={tips} onChange={(v) => updateSettings({ tips: v })} />
          </div>
        </section>
        <div className="pick-main">
          <Scenery className="pick-stage">
            {element === camino ? <span className="path-chip">{O.yourPath}</span> : null}
            <img className="pick-side at-left" src={art.ninja(previous)} alt="" />
            <img className="pick-side at-right" src={art.ninja(next)} alt="" />
            <img key={element} className="pick-front" src={art.idle(element, !reduced)} alt="" />
            <button
              type="button"
              className="icon-btn stage-arrow at-left"
              aria-label={O.previous}
              title={O.previous}
              onClick={() => {
                audio.play('select');
                cyclePick(-1);
              }}
            >
              <Icon name="left" />
            </button>
            <button
              type="button"
              className="icon-btn stage-arrow at-right"
              aria-label={O.next}
              title={O.next}
              onClick={() => {
                audio.play('select');
                cyclePick(1);
              }}
            >
              <Icon name="right" />
            </button>
          </Scenery>
          {roomClosed ? (
            <div className="online-note">
              <Notice tone="gold">{O.roomClosed}</Notice>
              <button type="button" className="link" onClick={dismissRoomClosed}>
                {O.understood}
              </button>
            </div>
          ) : message ? (
            <Notice tone="danger">{message}</Notice>
          ) : null}
          <div className="pick-actions">
            <LinkLine />
            <button type="button" className="btn btn-lg" onClick={showRooms}>
              {O.roomWithCode}
            </button>
            <button
              type="button"
              className="btn btn-primary btn-xl"
              disabled={!open || busy}
              onClick={() => {
                audio.play('confirm');
                joinQueue();
              }}
            >
              {ES.play}
            </button>
          </div>
        </div>
      </div>
      {demo ? (
        <PickDemo
          ninja={element}
          combo={demo === 'combo'}
          onCombo={(combo) => setDemo(combo ? 'combo' : 'card')}
          onClose={() => setDemo(null)}
        />
      ) : null}
    </div>
  );
}

/* ---------- Buscando equipo (R-52 y D-88) ---------- */

const clock = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/** El tiempo que lleva buscando: sigue contando entre un mensaje del servidor y el siguiente. */
function useWaited(queue: QueueView, at: number): number {
  const [, tick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, []);
  return queue.waitedMs + (performance.now() - at);
}

function QueueScreen({ queue }: { queue: QueueView }) {
  const at = useApp((s) => s.online.queueAt);
  const open = useApp((s) => s.online.link === 'open');
  const reduced = useApp((s) => s.settings.reducedMotion);
  const waited = useWaited(queue, at);
  const wanted = queue.seats.filter((s) => s.name === null && s.element !== queue.you);
  const { offer } = queue;
  return (
    <div className="screen online-screen queue" data-online="queue">
      <CloseButton label={O.cancelSearch} onClick={leaveQueue} />
      <header className="online-head">
        <h1 className="display">{O.searching}</h1>
        <BetaChip />
      </header>
      <Scenery className="seats">
        {offer ? (
          <div className="paper stage-strip" role="status">
            <span>{O.botOffer(NINJA_TEXT[offer.bot].name)}</span>
            {offer.accepted ? (
              <span className="strip-note">{O.botAccepted(offer.waitingFor)}</span>
            ) : (
              <button type="button" className="btn btn-primary" disabled={!open} onClick={acceptBot}>
                {O.botAccept}
              </button>
            )}
          </div>
        ) : null}
        {queue.seats.map((seat) => {
          const t = NINJA_TEXT[seat.element];
          const mine = seat.element === queue.you;
          const taken = mine || seat.name !== null;
          return (
            <div
              key={seat.element}
              className={`seat el-${seat.element} ${mine ? 'mine' : ''}`}
              data-seat={seat.element}
              data-state={mine ? 'you' : taken ? 'taken' : 'free'}
            >
              {taken ? (
                <img
                  className="seat-figure"
                  src={mine ? art.action(seat.element, !reduced) : art.idle(seat.element, !reduced)}
                  alt=""
                />
              ) : (
                <span className="seat-empty">
                  <img className="seat-figure" src={art.silhouette(seat.element)} alt="" />
                  <span className="spin" aria-hidden="true">
                    <Icon name="spin" />
                  </span>
                </span>
              )}
              <span className="seat-label">
                {taken ? (
                  <>
                    <b>{t.name}</b> · {mine ? O.you : seat.name}
                  </>
                ) : (
                  <span className="quiet">{O.wanted([t.element])}</span>
                )}
              </span>
            </div>
          );
        })}
      </Scenery>
      <div className="online-foot">
        <LinkLine />
        <p className="online-line" role="status">
          {wanted.length > 0
            ? O.searchLine(
                CLASSIC,
                wanted.map((s) => NINJA_TEXT[s.element].element),
                clock(waited),
              )
            : O.teamFound(CLASSIC)}
        </p>
      </div>
    </div>
  );
}

/* ---------- Salas con código (R-53 y D-89) ---------- */

function RoomsMenu() {
  const busy = useApp((s) => s.online.busy);
  const open = useApp((s) => s.online.link === 'open');
  const error = useApp((s) => s.online.error);
  const roomClosed = useApp((s) => s.online.roomClosed);
  const [code, setCode] = useState('');
  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    joinRoom(code);
  };
  const message =
    error === 'code_empty'
      ? O.joinEmpty
      : error
        ? (PLAY_ERRORS[error as keyof typeof PLAY_ERRORS] ?? PLAY_ERRORS.generic)
        : null;
  return (
    <div className="screen online-screen rooms" data-online="rooms">
      <header className="online-head">
        <h1 className="display">{O.roomWithCode}</h1>
        <BetaChip />
      </header>
      <p className="online-intro">{O.roomsIntro}</p>
      {roomClosed ? (
        <div className="online-note">
          <Notice tone="gold">{O.roomClosed}</Notice>
          <button type="button" className="link" onClick={dismissRoomClosed}>
            {O.understood}
          </button>
        </div>
      ) : null}
      <div className="online-grid rooms-body">
        <section className="paper room-option">
          <h2 className="display">{O.createTitle}</h2>
          <p>{O.createBody}</p>
          <button type="button" className="btn btn-primary" disabled={!open || busy} onClick={createRoom}>
            {O.create}
          </button>
        </section>
        <section className="paper room-option">
          <h2 className="display">{O.joinTitle}</h2>
          <p>{O.joinBody}</p>
          <form className="join-form" onSubmit={submit} noValidate>
            <input
              className="code-input"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={8}
              placeholder={O.codePlaceholder}
              aria-label={O.codeLabel}
              aria-invalid={message ? true : undefined}
              aria-describedby={message ? 'join-error' : undefined}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
            />
            <button type="submit" className="btn btn-primary" disabled={!open || busy}>
              {O.join}
            </button>
          </form>
          <p id="join-error" className="field-error join-error" role="alert">
            {message ? (
              <>
                <Icon name="alert" />
                <span>{message}</span>
              </>
            ) : null}
          </p>
        </section>
      </div>
      <div className="rooms-art">
        <NinjaTrio />
      </div>
      <div className="online-foot">
        <LinkLine />
        <button type="button" className="btn btn-lg" onClick={showPick}>
          {ES.back}
        </button>
      </div>
    </div>
  );
}

function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin permiso para el portapapeles, el código sigue a la vista para copiarlo a mano.
    }
  };
  return (
    <button type="button" className="btn copy-code" onClick={() => void copy()}>
      <Icon name={copied ? 'check' : 'copy'} />
      <span aria-live="polite">{copied ? O.copied : O.copy}</span>
    </button>
  );
}

function RoomScreen({ room }: { room: RoomView }) {
  const busy = useApp((s) => s.online.busy);
  const open = useApp((s) => s.online.link === 'open');
  const camino = useApp((s) => s.progress.data?.camino ?? null);
  const reduced = useApp((s) => s.settings.reducedMotion);
  const { you } = room;
  const free = room.seats.filter((s) => s.name === null);
  const status =
    room.start === 'alone'
      ? O.needAnother
      : room.start === 'choosing'
        ? O.choosing(room.choosing)
        : room.start === 'bot'
          ? O.botWillPlay(NINJA_TEXT[room.bot ?? 'fire'].name)
          : O.fullTeam;
  return (
    <div className="screen online-screen room" data-online="room">
      <CloseButton label={O.leaveRoom} onClick={leaveRoom} />
      <header className="online-head">
        <h1 className="display">{you.host ? O.yourRoom : O.roomOf(room.host)}</h1>
        <BetaChip />
        <div className="room-code">
          <span className="quiet">{O.codeCaption(CLASSIC)}</span>
          <output className="paper code" aria-label={`${O.codeLabel}: ${room.code.split('').join(' ')}`}>
            {formatRoomCode(room.code)}
          </output>
          <CopyCode code={room.code} />
        </div>
      </header>
      <Scenery className="seats">
        {you.seat === null && you.wanted ? (
          <div className="paper stage-strip" role="status">
            <span>{O.seatTaken(NINJA_TEXT[you.wanted].name, you.wanted === camino)}</span>
            {free.map((seat) => (
              <button
                key={seat.element}
                type="button"
                className="btn"
                disabled={!open}
                onClick={() => pickSeat(seat.element)}
              >
                {NINJA_TEXT[seat.element].name}
              </button>
            ))}
          </div>
        ) : null}
        {room.seats.map((seat) => {
          const t = NINJA_TEXT[seat.element];
          const taken = seat.name !== null;
          return (
            <div
              key={seat.element}
              className={`seat el-${seat.element} ${seat.you ? 'mine' : ''} ${taken && !seat.connected ? 'away' : ''}`}
              data-seat={seat.element}
              data-state={seat.you ? 'you' : taken ? 'taken' : 'free'}
            >
              <img
                className="seat-figure"
                src={
                  !taken
                    ? art.dotted(seat.element)
                    : seat.you
                      ? art.action(seat.element, !reduced)
                      : art.idle(seat.element, !reduced && seat.connected)
                }
                alt=""
              />
              <span className="seat-label">
                {taken ? (
                  <>
                    <b>{t.name}</b> · {seat.you ? O.you : seat.name}
                    {seat.host ? <span className="quiet"> · {O.host}</span> : null}
                    {seat.connected ? null : <span className="quiet"> · {O.offline}</span>}
                  </>
                ) : (
                  <span className="quiet">{O.free(t.element)}</span>
                )}
              </span>
            </div>
          );
        })}
      </Scenery>
      <div className="online-foot">
        <LinkLine />
        <p className="online-line quiet" role="status">
          {you.host ? status : you.seat === null ? '' : O.waitingHost(room.host)}
        </p>
        <button type="button" className="btn btn-lg" onClick={leaveRoom}>
          {O.leaveRoom}
        </button>
        {you.host ? (
          <button
            type="button"
            className="btn btn-primary btn-lg"
            disabled={!open || busy || (room.start !== 'bot' && room.start !== 'full')}
            onClick={() => {
              audio.play('confirm');
              startRoom();
            }}
          >
            {room.start === 'full' ? O.startMatch : O.startWithBot}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* ---------- Los avisos (D-100) ---------- */

/**
 * Un diálogo: fondo oscurecido, un papel de 6 columnas al centro y, al final de la fila, el botón principal.
 * Es para cuando hay que decidir o enterarse de algo importante; los estados pasajeros van en una franja.
 */
export function Dialog({
  icon,
  tone = 'gold',
  title,
  children,
  actions,
}: {
  icon: IconName;
  tone?: 'gold' | 'danger' | 'snow';
  title: string;
  children: ReactNode;
  actions: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement;
    // El foco va al botón principal, que es el último de la fila.
    const buttons = panel.current?.querySelectorAll<HTMLButtonElement>('.dialog-actions button');
    buttons?.[buttons.length - 1]?.focus();
    return () => {
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop dialog-backdrop">
      <div ref={panel} className="paper dialog" role="alertdialog" aria-modal="true" aria-label={title}>
        <div className="dialog-head">
          <span className={`dialog-icon tone-${tone}`} aria-hidden="true">
            <Icon name={icon} />
          </span>
          <h2 className="display">{title}</h2>
        </div>
        <p>{children}</p>
        <div className="dialog-actions">{actions}</div>
      </div>
    </div>
  );
}

/** Los avisos que van sobre "Jugar en línea": el de la última partida, una sola vez, y los de la conexión. */
export function OnlineDialogs() {
  const link = useApp((s) => s.online.link);
  const notice = useApp((s) => s.online.notice);
  const inMatch = useApp((s) => s.online.match !== null);
  if (link === 'replaced') {
    return (
      <Dialog
        icon="cards"
        title={O.replacedTitle}
        actions={
          <>
            <button type="button" className="btn" onClick={backToTitle}>
              {O.toMenu}
            </button>
            <button type="button" className="btn btn-primary" onClick={connectHere}>
              {O.replacedHere}
            </button>
          </>
        }
      >
        {O.replacedBody}
      </Dialog>
    );
  }
  if (link === 'outdated') {
    return (
      <Dialog
        icon="restart"
        title={O.outdatedTitle}
        actions={
          <button type="button" className="btn btn-primary" onClick={reloadPage}>
            {O.reload}
          </button>
        }
      >
        {O.outdatedBody}
      </Dialog>
    );
  }
  if (link === 'signedOut') {
    return (
      <Dialog
        icon="door"
        tone="danger"
        title={O.signedOutTitle}
        actions={
          <button type="button" className="btn btn-primary" onClick={signInAgain}>
            {ACCOUNT_TEXT.enter}
          </button>
        }
      >
        {O.signedOutBody}
      </Dialog>
    );
  }
  // El aviso de la última partida se lee en el inicio en línea, no en medio de otra.
  if (notice && !inMatch) {
    const text = O.notices[notice];
    return (
      <Dialog
        icon={notice === 'restart' ? 'restart' : 'plug'}
        tone={notice === 'restart' ? 'gold' : 'danger'}
        title={text.title}
        actions={
          <button type="button" className="btn btn-primary" onClick={dismissNotice}>
            {O.understood}
          </button>
        }
      >
        {text.body}
      </Dialog>
    );
  }
  return null;
}

/* ---------- La pantalla ---------- */

/** Qué pantalla en línea toca: la decide dónde dice el servidor que está la persona. */
export function onlineView(online: Pick<OnlineState, 'place' | 'view' | 'queue' | 'room'>) {
  if (online.place === 'queue' && online.queue) return 'queue' as const;
  if (online.place === 'room' && online.room) return 'room' as const;
  return online.view === 'rooms' ? ('rooms' as const) : ('pick' as const);
}

export function OnlineScreen() {
  const online = useApp((s) => s.online);
  const view = onlineView(online);
  return (
    <div className="online-root">
      {view === 'queue' && online.queue ? <QueueScreen queue={online.queue} /> : null}
      {view === 'room' && online.room ? <RoomScreen room={online.room} /> : null}
      {view === 'rooms' ? <RoomsMenu /> : null}
      {view === 'pick' ? <PickScreen /> : null}
      <OnlineDialogs />
    </div>
  );
}

import { ELEMENTS, type ElementKind } from '@ventisca/core';
import {
  type ClientPayload,
  isRoomCode,
  normalizeRoomCode,
  playStatusSchema,
  type ServerMessage,
} from '@ventisca/protocol';
import { NetworkHost } from '../host/NetworkHost';
import { api } from '../net/api';
import { type LinkStatus, PlaySocket, playUrl, type SocketLike } from '../net/socket';
import { openAccount, showView } from './account';
import { dropOnlineMatch, playOn } from './actions';
import { loadProgress } from './progress';
import { clearSession } from './session';
import { initialOnline, type OnlineState, store } from './store';

/*
 * El juego en línea fuera del tablero: la conexión, la ficha del ninja, la cola, las salas y los avisos.
 * El servidor dice dónde está cada persona (en el inicio, en la cola, en una sala o en una partida) y aquí
 * solo se guarda lo que dijo. La partida en sí la lleva `state/actions.ts`, con un `NetworkHost`.
 */

const patch = (p: Partial<OnlineState>) => store.setState((s) => ({ online: { ...s.online, ...p } }));

/** Lo que este módulo toma del navegador: las pruebas lo reemplazan. */
export const onlineDeps = {
  open: (url: string): SocketLike => new WebSocket(url) as unknown as SocketLike,
  url: (): string => playUrl(window.location),
  later: (task: () => void, ms: number): (() => void) => {
    const timer = window.setTimeout(task, ms);
    return () => window.clearTimeout(timer);
  },
  reload: (): void => window.location.reload(),
};

let socket: PlaySocket | null = null;
let host: NetworkHost | null = null;
/** Estaba buscando equipo cuando se cayó la conexión: al volver, sigue buscando con ese ninja. */
let requeue: ElementKind | null = null;
/** Salió de su partida sin conexión: si al volver el servidor la devuelve a ella, se le avisa que salió. */
let leftOffline = false;

function send(payload: ClientPayload): boolean {
  return socket?.send(payload) ?? false;
}

/** ¿Sigue habiendo sesión? `null`: el servidor no respondió. */
async function signedIn(): Promise<boolean | null> {
  const res = await api.get('/api/play/status', playStatusSchema);
  if (res.ok) return true;
  return res.status === 401 ? false : null;
}

function connect(): void {
  socket ??= new PlaySocket({
    url: onlineDeps.url(),
    open: (url) => onlineDeps.open(url),
    later: (task, ms) => onlineDeps.later(task, ms),
    signedIn,
    onStatus,
    onMessage: receive,
  });
  socket.connect();
}

/** Las pantallas del juego en línea: fuera de ellas, lo que pase con la conexión no interrumpe a nadie. */
const inOnline = (): boolean => {
  const { screen, online } = store.getState();
  return screen === 'online' || online.match !== null;
};

function onStatus(status: LinkStatus): void {
  const { online } = store.getState();
  // Se cayó mientras buscaba equipo: el servidor la sacó de la cola. Al volver, entra de nuevo.
  if (status === 'reconnecting' && online.place === 'queue' && online.queue) requeue = online.queue.you;
  if (status === 'closed') requeue = null;
  patch({ link: status, busy: false });
  if (status === 'signedOut') {
    // La sesión terminó: la cerró desde otra parte, cambió su contraseña o borró la cuenta.
    const here = inOnline();
    const playing = online.match !== null;
    dropOnlineMatch();
    // Quien estaba en una partida queda en el inicio en línea, con el aviso encima.
    if (playing) store.setState({ screen: 'online' });
    if (here) clearSession();
    else patch({ link: 'off' });
  }
}

/** Sale del tablero de una partida en línea que ya no existe para esta persona, y vuelve al inicio en línea. */
function leaveBattle(): void {
  dropOnlineMatch();
  host = null;
  store.setState({ screen: 'online' });
  patch({ view: 'pick' });
}

/** Un mensaje del servidor, ya comprobado contra el protocolo. */
export function receive(message: ServerMessage): void {
  const { online } = store.getState();
  switch (message.type) {
    case 'welcome':
      return;
    case 'idle': {
      // Estaba en una partida que para esta persona ya no existe: salió, terminó sin ella o se interrumpió.
      if (online.match && !online.end) {
        leaveBattle();
        // Lo que sumó a sus logros en esa partida ya está en su cuenta (R-55): la ficha lo lee del progreso.
        void loadProgress();
      }
      patch({
        place: 'home',
        queue: null,
        room: null,
        busy: false,
        notice: message.notice ?? online.notice,
        roomClosed: message.reason === 'room_closed' ? true : online.roomClosed,
      });
      if (requeue) {
        const element = requeue;
        requeue = null;
        if (send({ type: 'queue.join', element })) patch({ busy: true });
      }
      return;
    }
    case 'queue.state': {
      const { v, seq, re, ...queue } = message;
      requeue = null;
      patch({ place: 'queue', queue, queueAt: performance.now(), room: null, busy: false, error: null });
      return;
    }
    case 'room.state': {
      const { v, seq, re, ...room } = message;
      patch({ place: 'room', room, queue: null, busy: false, error: null, roomClosed: false });
      return;
    }
    case 'error':
      // Los errores del protocolo no son de quien juega: no hay nada que mostrarle.
      if (message.code === 'bad_message' || message.code === 'not_now' || message.code === 'rate_limited') {
        patch({ busy: false });
      } else if (message.code !== 'protocol_version') {
        patch({ busy: false, error: message.code });
      }
      return;
    case 'match.start':
    case 'match.resume': {
      requeue = null;
      if (message.type === 'match.resume' && leftOffline) {
        // Ya había salido de esa partida, sin conexión para decirlo: se dice ahora (R-39).
        leftOffline = false;
        send({ type: 'match.leave' });
        return;
      }
      leftOffline = false;
      host = new NetworkHost(send);
      playOn(host);
      // Al terminar, quien juega desde una sala vuelve a ella; quien salió de la cola, al inicio.
      patch({ place: message.room ? 'room' : 'home', queue: null, busy: false, error: null });
      host.receive(message);
      return;
    }
    case 'match.end':
      host?.receive(message);
      if (message.room === null) patch({ place: 'home', room: null });
      // El saldo y los logros cambiaron: la Libreta y la tienda los leen del progreso.
      void loadProgress();
      return;
    default:
      host?.receive(message);
  }
}

/* ---------- Entrar y salir ---------- */

/**
 * "Jugar en línea", desde la portada. Sin sesión lleva a "Entrar", y sin carta de camino, a elegirla
 * (R-30): sin ella no hay colección con que jugar. Se ofrece primero el ninja del camino (D-87).
 */
export function openOnline(): void {
  const { account, progress } = store.getState();
  if (!account.user) {
    openAccount('login');
    return;
  }
  if (progress.data && !progress.data.camino) {
    store.setState({ screen: 'account' });
    showView('camino');
    return;
  }
  store.setState({ screen: 'online' });
  patch({ view: 'pick', element: progress.data?.camino ?? store.getState().online.element, error: null });
  connect();
  void loadProgress();
}

/** La ✕ de la ficha: vuelve a la portada y cierra la conexión. */
export function closeOnline(): void {
  requeue = null;
  leftOffline = false;
  socket?.close();
  host = null;
  const { element } = store.getState().online;
  store.setState({ screen: 'title', online: { ...initialOnline(), element } });
}

/**
 * Al abrir el juego con sesión: si la cuenta tiene una partida en curso de la que se desconectó, vuelve
 * derecho a ella (R-38). Si ya la está jugando en otra pestaña, no se le quita la conexión.
 */
export async function resumeIfPlaying(): Promise<void> {
  if (!store.getState().account.user) return;
  const res = await api.get('/api/play/status', playStatusSchema);
  if (res.ok && res.data.match === 'away' && store.getState().online.link === 'off') connect();
}

/** "Conectarme aquí": la cuenta abrió el juego en otra pestaña, y la persona quiere seguir en esta. */
export function connectHere(): void {
  connect();
}

/** Recarga la página: el juego tiene una versión nueva. */
export function reloadPage(): void {
  onlineDeps.reload();
}

/** Cierra el aviso de la sesión terminada y lleva a "Entrar". */
export function signInAgain(): void {
  store.setState({ online: initialOnline() });
  openAccount('login');
}

/** Sale del juego en línea hacia la portada, desde un aviso que ya no deja seguir. */
export function backToTitle(): void {
  dropOnlineMatch();
  closeOnline();
}

/* ---------- La ficha: elegir ninja (D-87) ---------- */

export function pickNinja(element: ElementKind): void {
  patch({ element });
}

/** Las flechas del escenario: el ninja anterior o el siguiente, en orden Fuego, Agua y Nieve. */
export function cyclePick(dir: 1 | -1): void {
  const { element } = store.getState().online;
  const at = ELEMENTS.indexOf(element);
  pickNinja(ELEMENTS[(at + dir + ELEMENTS.length) % ELEMENTS.length] as ElementKind);
}

/* ---------- La cola pública (R-52) ---------- */

/** "Jugar": entra a la cola con el ninja elegido. */
export function joinQueue(): void {
  const { element } = store.getState().online;
  if (send({ type: 'queue.join', element })) patch({ busy: true, error: null, roomClosed: false });
}

/** La ✕ de "Buscando equipo": cancela la búsqueda. */
export function leaveQueue(): void {
  requeue = null;
  send({ type: 'queue.leave' });
}

export function acceptBot(): void {
  send({ type: 'queue.acceptBot' });
}

/* ---------- Las salas con código (R-53) ---------- */

export function showRooms(): void {
  patch({ view: 'rooms', error: null });
}

export function showPick(): void {
  patch({ view: 'pick', error: null });
}

export function createRoom(): void {
  const { element } = store.getState().online;
  if (send({ type: 'room.create', element })) patch({ busy: true, error: null, roomClosed: false });
}

/** Se une a una sala con el código tal como lo escribió la persona. */
export function joinRoom(text: string): void {
  const code = normalizeRoomCode(text);
  if (code === '') {
    patch({ error: 'code_empty' });
    return;
  }
  // Un código que no tiene la forma de uno no puede ser de ninguna sala: no hace falta preguntar.
  if (!isRoomCode(code)) {
    patch({ error: 'room_not_found' });
    return;
  }
  const { element } = store.getState().online;
  if (send({ type: 'room.join', code, element })) patch({ busy: true, error: null, roomClosed: false });
}

/** Elige un ninja libre de la sala. */
export function pickSeat(element: ElementKind): void {
  send({ type: 'room.pick', element });
}

export function startRoom(): void {
  if (send({ type: 'room.start' })) patch({ busy: true });
}

export function leaveRoom(): void {
  send({ type: 'room.leave' });
  patch({ view: 'rooms' });
}

/** Cierra el aviso de que la sala se cerró. */
export function dismissRoomClosed(): void {
  patch({ roomClosed: false });
}

/* ---------- La partida ---------- */

/** Abre o cierra el aviso "¿Salir de la partida?". */
export function askLeave(open: boolean): void {
  const { online } = store.getState();
  if (!online.match || online.end || online.leaving === open) return;
  patch({ leaving: open });
}

/** "Salir": abandona la partida (R-39). El servidor responde llevándola al inicio en línea. */
export function leaveMatch(): void {
  patch({ leaving: false });
  // Sin conexión no hay a quién avisarle: se sale igual, y contará como no haber vuelto.
  if (!host || store.getState().online.link !== 'open') {
    leftOffline = true;
    leaveBattle();
    return;
  }
  host.leave();
}

/** "Entendido": el aviso de la última partida no vuelve a salir. */
export function dismissNotice(): void {
  send({ type: 'notice.seen' });
  patch({ notice: null });
}

/** "Listo", en los resultados: de vuelta a la sala si se jugaba en una, o al inicio en línea. */
export function finishResults(): void {
  leaveBattle();
}

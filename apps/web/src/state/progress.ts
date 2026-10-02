import type { ElementKind } from '@ventisca/core';
import { boxResultSchema, progressSchema } from '@ventisca/protocol';
import { PROGRESS_TEXT } from '../i18n/es';
import { type ApiResult, api, type ClientError } from '../net/api';
import { errorMessage } from './errors';
import { sessionExpired } from './session';
import { type ProgressState, store } from './store';

/*
 * Progreso de la cuenta en el cliente (D-34): la carta de camino, la colección y las cajas. El servidor
 * decide todo; aquí solo se pide y se muestra lo que respondió.
 */

const patch = (p: Partial<ProgressState>) => store.setState((s) => ({ progress: { ...s.progress, ...p } }));

/** La cuenta con la sesión abierta. Una respuesta que llega cuando ya es otra, o ninguna, se descarta. */
const currentUser = () => store.getState().account.user?.id ?? null;

/** Sube cada vez que empieza o termina una petición que cambia el progreso. */
let changes = 0;

/** Lee el progreso de la cuenta. Devuelve si quedó al día. */
export async function loadProgress(): Promise<boolean> {
  const user = currentUser();
  if (!user) return false;
  const at = changes;
  patch({ status: 'loading' });
  const res = await api.get('/api/progress', progressSchema);
  if (currentUser() !== user) return false;
  // Se cruzó con una compra o con la elección del camino, y su respuesta trae un progreso más nuevo.
  if (at !== changes) {
    patch({ status: store.getState().progress.data ? 'ready' : 'idle' });
    return true;
  }
  if (!res.ok) {
    if (res.error.code === 'unauthorized') sessionExpired();
    else patch({ status: 'error' });
    return false;
  }
  patch({ status: 'ready', data: res.data });
  return true;
}

/** Una petición que cambia el progreso. Mientras espera, `busy` deshabilita los botones. */
async function change<T>(call: () => Promise<ApiResult<T>>): Promise<ApiResult<T> | null> {
  const user = currentUser();
  changes += 1;
  patch({ busy: true, error: null });
  const res = await call();
  changes += 1;
  if (currentUser() !== user) return null;
  if (res.ok) patch({ busy: false });
  else if (res.error.code === 'unauthorized') sessionExpired();
  else patch({ busy: false, error: errorMessage(res.error) });
  return res;
}

/** R-30: elige la carta de camino, que es permanente. Devuelve si quedó elegida. */
export async function chooseCamino(element: ElementKind): Promise<boolean> {
  if (!currentUser() || store.getState().progress.busy) return false;
  const res = await change(() => api.post('/api/progress/camino', { element }, progressSchema));
  if (!res) return false;
  if (!res.ok) {
    // La cuenta ya tenía camino (elegido en otra pestaña, por ejemplo): se trae el que quedó.
    if (res.error.code === 'camino_already_chosen') void loadProgress();
    return false;
  }
  patch({ status: 'ready', data: res.data });
  return true;
}

let reveals = 0;

/**
 * La respuesta de una compra se perdió: no llegó (`offline`) o el servidor falló a mitad (`internal`).
 * En los dos casos no se sabe si la compra quedó hecha. Cualquier otro error es una respuesta
 * definitiva: el servidor dijo que no hubo compra.
 */
const purchaseLost = (error: ClientError) => error.code === 'offline' || error.code === 'internal';

/**
 * R-28: compra una caja. El identificador de la compra se genera aquí (D-66) y se borra con cualquier
 * respuesta definitiva del servidor, sea la caja o un rechazo. Solo se conserva si la respuesta se
 * pierde (D-68): entonces comprar de nuevo la misma caja es un reintento, y otra caja es otra compra.
 */
export async function buyBox(element: ElementKind, size: number): Promise<void> {
  const { progress } = store.getState();
  if (!currentUser() || progress.busy) return;
  const retry = progress.pending?.element === element && progress.pending.size === size ? progress.pending : null;
  const purchase = retry ?? { purchaseId: crypto.randomUUID(), element, size };
  patch({ pending: purchase });
  const res = await change(() => api.post('/api/progress/boxes', purchase, boxResultSchema));
  if (!res) return;
  if (!res.ok) {
    if (!purchaseLost(res.error)) {
      // Un rechazo: `change` ya dejó su mensaje, y la compra siguiente es otra compra.
      patch({ pending: null });
      return;
    }
    // Se dice que reintentar es seguro y se vuelve a leer el progreso, para mostrar el saldo real: si
    // el servidor sí había cobrado, las monedas y las cartas ya cambiaron.
    patch({ error: PROGRESS_TEXT.purchaseUnknown });
    void loadProgress();
    return;
  }
  const { cards, progress: data } = res.data;
  // Una carta era nueva si todas sus copias llegaron en esta caja; solo la primera cuenta como nueva.
  const seen = new Set<string>();
  const fresh = cards.map((id) => {
    const inBox = cards.filter((c) => c === id).length;
    const isNew = !seen.has(id) && (data.collection[id] ?? 0) === inBox;
    seen.add(id);
    return isNew;
  });
  reveals += 1;
  patch({ status: 'ready', data, pending: null, reveal: { key: reveals, element, cards, fresh } });
}

export function closeReveal(): void {
  patch({ reveal: null });
}

export function setCollectionTab(tab: ElementKind): void {
  patch({ tab, error: null });
}

/** Al entrar a una pantalla del progreso, no queda a la vista el error de una visita anterior. */
export function clearProgressError(): void {
  patch({ error: null });
}

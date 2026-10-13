import { ELEMENTS, type ElementKind } from '@ventisca/core';
import { clearProgressError, loadProgress, setCollectionTab } from './progress';
import { type NotebookState, store } from './store';

/*
 * La Libreta ninja (D-100): el progreso y las cartas de la cuenta, con la tienda de cajas. Reemplaza a "Tu
 * progreso" y a "Colección y tienda". Se abre desde el perfil, desde los resultados de una partida en
 * línea y desde "Abrir cajas", y al cerrarse vuelve a la pantalla desde la que se abrió.
 */

/** Las páginas de la colección: dos por elemento, de 2 × 5 cartas. */
export const PAGE_SIZE = 10;
export const PAGES_PER_ELEMENT = 2;
export const PAGE_COUNT = ELEMENTS.length * PAGES_PER_ELEMENT;

/** El elemento cuyas cartas muestra esa página. */
export const pageElement = (page: number): ElementKind =>
  ELEMENTS[Math.floor(page / PAGES_PER_ELEMENT) % ELEMENTS.length] as ElementKind;

/** La primera página de ese elemento. */
export const firstPageOf = (element: ElementKind): number => ELEMENTS.indexOf(element) * PAGES_PER_ELEMENT;

const patch = (p: Partial<NotebookState>) => store.setState((s) => ({ notebook: { ...s.notebook, ...p } }));

/** Abre la Libreta en esa pestaña. `element`: el elemento cuyas cartas o cajas se muestran primero. */
export function openNotebook(tab: NotebookState['tab'] = 'progress', element?: ElementKind): void {
  const { screen, notebook } = store.getState();
  clearProgressError();
  const page = element ? firstPageOf(element) : notebook.page;
  setCollectionTab(pageElement(page));
  store.setState({
    screen: 'notebook',
    // Abierta desde sí misma (de "Mis cartas" a "Abrir cajas"), sigue volviendo a donde se abrió.
    notebook: { tab, page, from: screen === 'notebook' ? notebook.from : screen },
  });
  void loadProgress();
}

export function closeNotebook(): void {
  store.setState((s) => ({ screen: s.notebook.from }));
}

export function setNotebookTab(tab: NotebookState['tab']): void {
  clearProgressError();
  patch({ tab });
}

/** Va a las cartas de ese elemento, o a sus cajas. */
export function showCardsOf(element: ElementKind, tab: 'cards' | 'boxes' = 'cards'): void {
  clearProgressError();
  setCollectionTab(element);
  patch({ tab, page: firstPageOf(element) });
}

/** Las flechas de "Mis cartas": la página anterior o la siguiente, dando la vuelta. */
export function turnPage(dir: 1 | -1): void {
  const page = (store.getState().notebook.page + dir + PAGE_COUNT) % PAGE_COUNT;
  setCollectionTab(pageElement(page));
  patch({ page });
}

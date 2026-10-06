import { createRoot } from 'react-dom/client';
import { App } from './App';
import { loadBoard } from './state/actions';
import { discardLocalProgress } from './state/persist';
import { store } from './state/store';
import './ui/fonts.css';
import './ui/styles.css';

// Acceso al estado para depurar y para las pruebas e2e (solo en desarrollo). Con `__ventiscaLoad`, una
// prueba deja la partida en curso en un tablero preparado.
if (import.meta.env.DEV) {
  const w = window as unknown as { __ventisca: typeof store; __ventiscaLoad: typeof loadBoard };
  w.__ventisca = store;
  w.__ventiscaLoad = loadBoard;
}

discardLocalProgress();

const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);

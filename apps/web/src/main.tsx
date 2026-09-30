import { createRoot } from 'react-dom/client';
import { App } from './App';
import { discardLocalProgress } from './state/persist';
import { store } from './state/store';
import './ui/fonts.css';
import './ui/styles.css';

// Acceso al estado para depurar y para las pruebas e2e (solo en desarrollo).
if (import.meta.env.DEV) (window as unknown as { __ventisca: typeof store }).__ventisca = store;

discardLocalProgress();

const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);

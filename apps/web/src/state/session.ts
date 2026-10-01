import { ACCOUNT_ERRORS } from '../i18n/es';
import { type AccountState, initialProgress, store } from './store';

/** Deja el cliente sin sesión: fuera la cuenta y su progreso, y de vuelta a "Entrar". */
export function clearSession(extra: Partial<AccountState> = {}): void {
  store.setState((s) => ({
    account: { ...s.account, user: null, view: 'login', ...extra },
    progress: initialProgress(),
  }));
}

/** El servidor ya no reconoce la sesión: venció o se cerró desde otra parte. */
export function sessionExpired(): void {
  clearSession({ busy: false, error: ACCOUNT_ERRORS.unauthorized, errorField: null, info: null });
}

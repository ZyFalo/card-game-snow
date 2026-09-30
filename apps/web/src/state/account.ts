import { publicConfigSchema, sessionSchema, type User } from '@ventisca/protocol';
import { ACCOUNT_ERRORS, ACCOUNT_TEXT } from '../i18n/es';
import { type ApiResult, api, type ClientError } from '../net/api';
import { type AccountState, type AccountView, store } from './store';

/*
 * Cuentas en el cliente (PRD de v2, R-43 a R-50). La UI solo llama a estas funciones; el servidor
 * decide y responde con códigos, y aquí se convierten en mensajes (i18n/es.ts). Los datos viajan
 * siempre en el cuerpo de la petición.
 */

const patch = (p: Partial<AccountState>) => store.setState((s) => ({ account: { ...s.account, ...p } }));

/** El mensaje de un error de la API, con el motivo cuando la persona puede corregirlo. */
export function errorMessage(error: ClientError): string {
  const e = ACCOUNT_ERRORS;
  switch (error.code) {
    case 'bad_request':
      if (error.reason === 'email') return e.badEmail;
      if (error.reason === 'same_email') return e.sameEmail;
      return e.bad_request;
    case 'name_not_allowed':
      return e.name[error.reason as keyof typeof e.name] ?? e.name.offensive;
    case 'weak_password':
      return e.password[error.reason as keyof typeof e.password] ?? e.password.length;
    case 'invalid_code':
      return error.attemptsLeft === undefined
        ? e.invalid_code
        : `${e.invalid_code} ${e.attemptsLeft(error.attemptsLeft)}`;
    case 'offline':
    case 'privacy_not_accepted':
    case 'name_taken':
    case 'code_expired':
    case 'too_many_attempts':
    case 'invalid_credentials':
    case 'email_not_verified':
    case 'too_many_requests':
    case 'captcha_failed':
    case 'captcha_unavailable':
    case 'email_unavailable':
    case 'email_taken':
    case 'unauthorized':
      return e[error.code];
    default:
      return e.generic;
  }
}

/** Corre una llamada con el formulario ocupado; si falla, muestra su mensaje. */
async function run<T>(call: () => Promise<ApiResult<T>>): Promise<ApiResult<T>> {
  patch({ busy: true, error: null, info: null });
  const res = await call();
  if (!res.ok) {
    patch({ busy: false, error: errorMessage(res.error) });
    if (res.error.code === 'unauthorized') patch({ user: null, view: 'login' });
    return res;
  }
  patch({ busy: false });
  return res;
}

/** Al abrir el juego: ¿hay servidor, hay sesión? Sin servidor se juega sin cuenta. */
export async function initAccount(): Promise<void> {
  const config = await api.get('/api/config', publicConfigSchema);
  if (!config.ok) {
    patch({ status: 'offline' });
    return;
  }
  const me = await api.get('/api/auth/me', sessionSchema);
  patch({ status: 'ready', turnstileSiteKey: config.data.turnstileSiteKey, user: me.ok ? me.data.user : null });
}

/** Abre la pantalla de cuenta en una vista; sin vista, el perfil o la entrada según haya sesión. */
export function openAccount(view?: AccountView): void {
  const { account } = store.getState();
  const next = view ?? (account.user ? 'profile' : 'login');
  store.setState({ screen: 'account' });
  patch({ view: next, previous: account.view, error: null, info: null, pendingEmail: null });
}

export function showView(view: AccountView, extra: Partial<AccountState> = {}): void {
  const { account } = store.getState();
  patch({ view, previous: account.view, error: null, info: null, ...extra });
}

export function closeAccount(): void {
  store.setState({ screen: 'title' });
  patch({ error: null, info: null });
}

const signedIn = (user: User) => patch({ user, view: 'profile', email: '', error: null });

export async function register(form: {
  email: string;
  password: string;
  displayName: string;
  acceptPrivacy: boolean;
  captchaToken: string;
}): Promise<boolean> {
  const res = await run(() => api.post('/api/auth/register', form));
  if (!res.ok) return false;
  showView('verify', { email: form.email.trim() });
  return true;
}

export async function verify(code: string): Promise<void> {
  const { email } = store.getState().account;
  const res = await run(() => api.post('/api/auth/verify', { email, code }, sessionSchema));
  if (res.ok) signedIn(res.data.user);
}

export async function resendCode(): Promise<void> {
  const { email } = store.getState().account;
  const res = await run(() => api.post('/api/auth/resend', { email }));
  if (res.ok) patch({ info: ACCOUNT_TEXT.resendDone });
}

export async function login(email: string, password: string): Promise<void> {
  const res = await run(() => api.post('/api/auth/login', { email, password }, sessionSchema));
  if (res.ok) signedIn(res.data.user);
  // Sin verificar: pasa al código, con la opción de pedir otro.
  else if (res.error.code === 'email_not_verified') {
    showView('verify', { email: email.trim(), error: ACCOUNT_ERRORS.email_not_verified });
  }
}

export async function logout(): Promise<void> {
  await api.post('/api/auth/logout', {});
  patch({ user: null, view: 'login' });
  store.setState({ screen: 'title' });
}

export async function recoverRequest(email: string): Promise<void> {
  const res = await run(() => api.post('/api/auth/recover/request', { email }));
  if (res.ok) showView('recoverCode', { email: email.trim() });
}

export async function recoverConfirm(code: string, password: string, repeat: string): Promise<void> {
  if (password !== repeat) {
    patch({ error: ACCOUNT_TEXT.passwordsDiffer });
    return;
  }
  const { email } = store.getState().account;
  const res = await run(() => api.post('/api/auth/recover/confirm', { email, code, password }, sessionSchema));
  if (res.ok) signedIn(res.data.user);
}

/** R-50: sin sesión, deshace un cambio de correo con el código que llegó al correo anterior. */
export async function revertEmail(email: string, code: string, password: string, repeat: string): Promise<void> {
  if (password !== repeat) {
    patch({ error: ACCOUNT_TEXT.passwordsDiffer });
    return;
  }
  const res = await run(() => api.post('/api/auth/email/revert', { email, code, password }));
  if (res.ok) showView('login', { info: ACCOUNT_TEXT.revertDone });
}

export async function changePassword(current: string, next: string, repeat: string): Promise<boolean> {
  if (next !== repeat) {
    patch({ error: ACCOUNT_TEXT.passwordsDiffer });
    return false;
  }
  const res = await run(() => api.post('/api/auth/password', { currentPassword: current, newPassword: next }));
  if (res.ok) patch({ info: ACCOUNT_TEXT.changePasswordDone });
  return res.ok;
}

export async function changeEmailRequest(password: string, newEmail: string): Promise<void> {
  const res = await run(() => api.post('/api/auth/email/request', { password, newEmail }));
  if (res.ok) patch({ pendingEmail: newEmail.trim(), info: ACCOUNT_TEXT.changeEmailSent });
}

export async function changeEmailConfirm(code: string): Promise<void> {
  const res = await run(() => api.post('/api/auth/email/confirm', { code }, sessionSchema));
  if (res.ok)
    patch({ user: res.data.user, pendingEmail: null, info: ACCOUNT_TEXT.changeEmailDone(res.data.user.email) });
}

export function cancelEmailChange(): void {
  patch({ pendingEmail: null, error: null, info: null });
}

export async function deleteAccount(password: string): Promise<void> {
  const res = await run(() => api.post('/api/auth/delete', { password }));
  if (res.ok) patch({ user: null, view: 'login', info: ACCOUNT_TEXT.deleteDone });
}

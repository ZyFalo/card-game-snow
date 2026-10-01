import { publicConfigSchema, sessionSchema, type User } from '@ventisca/protocol';
import { ACCOUNT_ERRORS, ACCOUNT_TEXT } from '../i18n/es';
import { type ApiResult, api, type ClientError } from '../net/api';
import { errorMessage } from './errors';
import { loadProgress } from './progress';
import { clearSession } from './session';
import { type AccountField, type AccountState, type AccountView, store } from './store';

/*
 * Cuentas en el cliente (PRD de v2, R-43 a R-50). La UI solo llama a estas funciones; el servidor
 * decide y responde con códigos, y aquí se convierten en mensajes (i18n/es.ts). Los datos viajan
 * siempre en el cuerpo de la petición.
 */

const patch = (p: Partial<AccountState>) => store.setState((s) => ({ account: { ...s.account, ...p } }));

/**
 * El campo que causó el error, si lo hay. Un correo o una contraseña incorrectos al entrar no apuntan a
 * ninguno de los dos, para no delatar cuál falló (D-59); en el perfil, `credentials` dice a qué campo va.
 */
export function errorField(error: ClientError, credentials?: AccountField): AccountField | null {
  switch (error.code) {
    case 'bad_request':
      return error.reason === 'email' || error.reason === 'same_email' ? 'email' : null;
    case 'email_taken':
      return 'email';
    case 'name_not_allowed':
    case 'name_taken':
      return 'displayName';
    case 'weak_password':
      return 'password';
    case 'invalid_code':
    case 'code_expired':
    case 'too_many_attempts':
      return 'code';
    case 'invalid_credentials':
      return credentials ?? null;
    default:
      return null;
  }
}

/** Corre una llamada con el formulario ocupado; si falla, muestra su mensaje, junto a su campo si lo hay. */
async function run<T>(call: () => Promise<ApiResult<T>>, credentials?: AccountField): Promise<ApiResult<T>> {
  patch({ busy: true, error: null, errorField: null, info: null });
  const res = await call();
  if (!res.ok) {
    patch({ busy: false, error: errorMessage(res.error), errorField: errorField(res.error, credentials) });
    if (res.error.code === 'unauthorized') clearSession();
    return res;
  }
  patch({ busy: false });
  return res;
}

const passwordsDiffer = () => patch({ error: ACCOUNT_TEXT.passwordsDiffer, errorField: 'repeat', info: null });

/** Al abrir el juego: ¿hay servidor, hay sesión? Sin servidor se juega sin cuenta. */
export async function initAccount(): Promise<void> {
  const config = await api.get('/api/config', publicConfigSchema);
  if (!config.ok) {
    patch({ status: 'offline' });
    return;
  }
  const me = await api.get('/api/auth/me', sessionSchema);
  patch({ status: 'ready', turnstileSiteKey: config.data.turnstileSiteKey, user: me.ok ? me.data.user : null });
  if (me.ok) void loadProgress();
}

/** Abre la pantalla de cuenta en una vista; sin vista, el perfil o la entrada según haya sesión. */
export function openAccount(view?: AccountView): void {
  const { account } = store.getState();
  const next = view ?? (account.user ? 'profile' : 'login');
  store.setState({ screen: 'account' });
  patch({ view: next, previous: account.view, error: null, errorField: null, info: null, pendingEmail: null });
  // El perfil muestra el progreso: se trae al día cada vez que se abre.
  if (next === 'profile') void loadProgress();
}

export function showView(view: AccountView, extra: Partial<AccountState> = {}): void {
  const { account } = store.getState();
  patch({ view, previous: account.view, error: null, errorField: null, info: null, ...extra });
}

export function closeAccount(): void {
  store.setState({ screen: 'title' });
  patch({ error: null, errorField: null, info: null });
}

/** Tras entrar, se lee el progreso de la cuenta. */
function signedIn(user: User): void {
  patch({ user, view: 'profile', email: '', error: null, errorField: null });
  void loadProgress();
}

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
  if (res.ok) patch({ info: { text: ACCOUNT_TEXT.resendDone, tone: 'gold' } });
}

export async function login(email: string, password: string): Promise<void> {
  const res = await run(() => api.post('/api/auth/login', { email, password }, sessionSchema));
  if (res.ok) signedIn(res.data.user);
  // Sin verificar: pasa al código, con la opción de pedir otro.
  else if (res.error.code === 'email_not_verified') {
    showView('verify', { email: email.trim(), info: { text: ACCOUNT_ERRORS.email_not_verified, tone: 'gold' } });
  }
}

export async function logout(): Promise<void> {
  await api.post('/api/auth/logout', {});
  clearSession();
  store.setState({ screen: 'title' });
}

export async function recoverRequest(email: string): Promise<void> {
  const res = await run(() => api.post('/api/auth/recover/request', { email }));
  if (res.ok) showView('recoverCode', { email: email.trim() });
}

export async function recoverConfirm(code: string, password: string, repeat: string): Promise<void> {
  if (password !== repeat) {
    passwordsDiffer();
    return;
  }
  const { email } = store.getState().account;
  const res = await run(() => api.post('/api/auth/recover/confirm', { email, code, password }, sessionSchema));
  if (res.ok) signedIn(res.data.user);
}

/** R-50: sin sesión, deshace un cambio de correo con el código que llegó al correo anterior. */
export async function revertEmail(email: string, code: string, password: string, repeat: string): Promise<void> {
  if (password !== repeat) {
    passwordsDiffer();
    return;
  }
  const res = await run(() => api.post('/api/auth/email/revert', { email, code, password }));
  if (res.ok) showView('login', { info: { text: ACCOUNT_TEXT.revertDone, tone: 'snow' } });
}

export async function changePassword(current: string, next: string, repeat: string): Promise<boolean> {
  if (next !== repeat) {
    passwordsDiffer();
    return false;
  }
  const res = await run(
    () => api.post('/api/auth/password', { currentPassword: current, newPassword: next }),
    'current',
  );
  if (res.ok) patch({ info: { text: ACCOUNT_TEXT.changePasswordDone, tone: 'snow' } });
  return res.ok;
}

export async function changeEmailRequest(password: string, newEmail: string): Promise<void> {
  const res = await run(() => api.post('/api/auth/email/request', { password, newEmail }), 'current');
  if (res.ok) patch({ pendingEmail: newEmail.trim(), info: { text: ACCOUNT_TEXT.changeEmailSent, tone: 'gold' } });
}

export async function changeEmailConfirm(code: string): Promise<void> {
  const res = await run(() => api.post('/api/auth/email/confirm', { code }, sessionSchema));
  if (res.ok)
    patch({
      user: res.data.user,
      pendingEmail: null,
      info: { text: ACCOUNT_TEXT.changeEmailDone(res.data.user.email), tone: 'snow' },
    });
}

export function cancelEmailChange(): void {
  patch({ pendingEmail: null, error: null, errorField: null, info: null });
}

export async function deleteAccount(password: string): Promise<void> {
  const res = await run(() => api.post('/api/auth/delete', { password }), 'current');
  if (res.ok) clearSession({ info: { text: ACCOUNT_TEXT.deleteDone, tone: 'snow' } });
}

import { type FormEvent, type ReactNode, type RefObject, useEffect, useId, useRef, useState } from 'react';
import { PROGRESS_TEXT as P, PRIVACY_NOTICE, ACCOUNT_TEXT as T } from '../i18n/es';
import {
  cancelEmailChange,
  changeEmailConfirm,
  changeEmailRequest,
  changePassword,
  closeAccount,
  deleteAccount,
  login,
  logout,
  openProgress,
  recoverConfirm,
  recoverRequest,
  register,
  resendCode,
  revertEmail,
  showView,
  verify,
} from '../state/account';
import { type AccountField, useApp } from '../state/store';
import {
  ScreenActions as Actions,
  Check,
  Field,
  ScreenHead as Head,
  type IconName,
  NinjaTrio,
  Notice,
  Points,
  SubmitButton,
} from './common';
import { CaminoView, CollectionView, ProgressSummary } from './Progress';
import { Turnstile } from './Turnstile';

/*
 * Pantalla de cuenta del modo en línea (PRD de v2, R-43 a R-50), compuesta según
 * docs/lineamientos-de-diseno.md: encabezado arriba a la izquierda, el formulario en un panel con los
 * ninjas y los beneficios a la derecha, y las acciones abajo a la derecha, como en "Tu equipo".
 */

export function AccountScreen() {
  const view = useApp((s) => s.account.view);
  // Cada vista se monta de nuevo, así repite las entradas escalonadas.
  return (
    <div key={view} className={`screen account-screen${view === 'collection' ? ' collection-screen' : ''}`}>
      {view === 'login' ? <LoginView /> : null}
      {view === 'register' ? <RegisterView /> : null}
      {view === 'verify' ? <VerifyView /> : null}
      {view === 'recover' ? <RecoverView /> : null}
      {view === 'recoverCode' ? <RecoverCodeView /> : null}
      {view === 'revert' ? <RevertView /> : null}
      {view === 'profile' ? <ProfileView /> : null}
      {view === 'privacy' ? <PrivacyParts onBack={closeAccount} /> : null}
      {view === 'camino' ? <CaminoView /> : null}
      {view === 'collection' ? <CollectionView /> : null}
    </div>
  );
}

/**
 * Lo que da una cuenta. `soon` marca "Próximamente" lo que todavía no existe: quítalo cuando llegue cada
 * uno. El juego en línea llega con el M8.
 */
const BENEFITS: { mark: IconName; text: string; soon: boolean }[] = [
  { mark: 'coin', text: T.benefits.progress, soon: false },
  { mark: 'play', text: T.benefits.online, soon: true },
  { mark: 'cards', text: T.benefits.collection, soon: false },
];
const benefits = BENEFITS.map(({ mark, text, soon }) => ({ mark, text, tag: soon ? T.soon : undefined }));
const steps = (texts: readonly string[]) => texts.map((text, i) => ({ mark: i + 1, text }));

/**
 * El panel del formulario a la izquierda; a la derecha, los tres ninjas y, si los hay, los puntos. Con
 * `summary`, la columna derecha es el resumen del progreso, que trae su propia ilustración.
 */
function FormBody({ aside, summary, children }: { aside?: ReactNode; summary?: ReactNode; children: ReactNode }) {
  return (
    <div className="account-body">
      <section className="paper account-form">{children}</section>
      <div className="account-aside">
        {summary ?? (
          <>
            {aside}
            <NinjaTrio />
          </>
        )}
      </div>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="btn btn-lg" onClick={onClick}>
      {T.back}
    </button>
  );
}

/** El error sin campo y el aviso de la última acción; los errores de un campo van debajo de él. */
function Messages() {
  const error = useApp((s) => s.account.error);
  const field = useApp((s) => s.account.errorField);
  const info = useApp((s) => s.account.info);
  return (
    <>
      {error && !field ? <Notice tone="danger">{error}</Notice> : null}
      {info ? <Notice tone={info.tone}>{info.text}</Notice> : null}
    </>
  );
}

function useFieldError() {
  const error = useApp((s) => s.account.error);
  const field = useApp((s) => s.account.errorField);
  return (f: AccountField) => (field === f ? error : null);
}

const useBusy = () => useApp((s) => s.account.busy);

const onSubmit = (fn: () => void) => (ev: FormEvent) => {
  ev.preventDefault();
  fn();
};

const codeInput = {
  inputMode: 'numeric' as const,
  autoComplete: 'one-time-code',
  maxLength: 6,
  pattern: '\\d{6}',
};

function LoginView() {
  const formId = useId();
  const busy = useBusy();
  const fieldError = useFieldError();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return (
    <>
      <Head title={T.loginTitle} intro={T.loginIntro} />
      <FormBody aside={<Points items={benefits} />}>
        <Messages />
        <form id={formId} className="form" noValidate onSubmit={onSubmit(() => void login(email, password))}>
          <Field
            label={T.email}
            type="email"
            autoComplete="email"
            value={email}
            error={fieldError('email')}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            label={T.password}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="button" className="link forgot" onClick={() => showView('recover')}>
            {T.toRecover}
          </button>
        </form>
      </FormBody>
      <Actions>
        <button type="button" className="link link-quiet foot" onClick={() => showView('revert')}>
          {T.toRevert}
        </button>
        <BackButton onClick={closeAccount} />
        <button type="button" className="btn btn-lg" onClick={() => showView('register')}>
          {T.toRegister}
        </button>
        <SubmitButton large form={formId} label={T.loginSubmit} busy={busy} />
      </Actions>
    </>
  );
}

function RegisterView() {
  const formId = useId();
  const busy = useBusy();
  const fieldError = useFieldError();
  const siteKey = useApp((s) => s.account.turnstileSiteKey);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  // El token del captcha vale una vez: tras cada envío se remonta el widget para pedir otro.
  const [captchaKey, setCaptchaKey] = useState(0);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const privacyLink = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  // Al cerrar el aviso, el foco vuelve al enlace que lo abrió.
  useEffect(() => {
    if (privacyOpen) wasOpen.current = true;
    else if (wasOpen.current) privacyLink.current?.focus();
  }, [privacyOpen]);

  const submit = async () => {
    // Sin clave de Turnstile (desarrollo) el servidor no pide captcha.
    const captchaToken = siteKey ? token : 'sin-captcha';
    if (!captchaToken) return;
    await register({ email, password, displayName, acceptPrivacy, captchaToken });
    setToken(null);
    setCaptchaKey((k) => k + 1);
  };

  return (
    <>
      {/* Con el aviso abierto encima, lo de abajo no recibe foco ni clics, pero conserva lo escrito. */}
      <div className="contents" inert={privacyOpen}>
        <Head title={T.registerTitle} intro={T.registerIntro} />
        <FormBody aside={<Points items={benefits} />}>
          <Messages />
          <form id={formId} className="form" noValidate onSubmit={onSubmit(() => void submit())}>
            <Field
              label={T.email}
              type="email"
              autoComplete="email"
              value={email}
              error={fieldError('email')}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Field
              label={T.displayName}
              hint={T.displayNameHint}
              autoComplete="nickname"
              maxLength={32}
              value={displayName}
              error={fieldError('displayName')}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <Field
              label={T.password}
              hint={T.passwordHint}
              type="password"
              autoComplete="new-password"
              value={password}
              error={fieldError('password')}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Check checked={acceptPrivacy} onChange={setAcceptPrivacy}>
              {T.acceptPrivacy}{' '}
              <button ref={privacyLink} type="button" className="link" onClick={() => setPrivacyOpen(true)}>
                {T.privacy.toLowerCase()}
              </button>
              .
            </Check>
            {siteKey ? (
              <div className="field">
                <Turnstile key={captchaKey} siteKey={siteKey} onToken={setToken} />
                {token ? null : <small>{T.captchaWaiting}</small>}
              </div>
            ) : null}
          </form>
        </FormBody>
        <Actions>
          <BackButton onClick={() => showView('login')} />
          <SubmitButton
            large
            form={formId}
            label={T.registerSubmit}
            busy={busy}
            disabled={siteKey !== null && !token}
          />
        </Actions>
      </div>
      {privacyOpen ? <PrivacyDialog onClose={() => setPrivacyOpen(false)} /> : null}
    </>
  );
}

/** R-43: solo se puede pedir otro código tras 60 s. */
function useCooldown(seconds: number) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (left <= 0) return;
    const id = window.setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [left]);
  return [left, () => setLeft(seconds)] as const;
}

/** Verificar un código: el código ocupa el centro, en dígitos grandes. */
function VerifyView() {
  const formId = useId();
  const busy = useBusy();
  const fieldError = useFieldError();
  const email = useApp((s) => s.account.email);
  const [code, setCode] = useState('');
  const [left, restart] = useCooldown(60);
  return (
    <>
      <Head title={T.verifyTitle} intro={T.verifyIntro(email)} />
      <div className="code-stage">
        <section className="paper code-panel">
          <Messages />
          <form id={formId} className="form" noValidate onSubmit={onSubmit(() => void verify(code.trim()))}>
            <Field
              code
              label={T.code}
              {...codeInput}
              value={code}
              error={fieldError('code')}
              onChange={(e) => setCode(e.target.value)}
            />
          </form>
          <button
            type="button"
            className="btn"
            disabled={left > 0}
            onClick={() => {
              restart();
              void resendCode();
            }}
          >
            {left > 0 ? T.resendWait(left) : T.resend}
          </button>
        </section>
      </div>
      <Actions>
        <BackButton onClick={() => showView('login')} />
        <SubmitButton large form={formId} label={T.verifySubmit} busy={busy} />
      </Actions>
    </>
  );
}

function RecoverView() {
  const formId = useId();
  const busy = useBusy();
  const fieldError = useFieldError();
  const [email, setEmail] = useState('');
  return (
    <>
      <Head title={T.recoverTitle} intro={T.recoverIntro} />
      <FormBody aside={<Points items={steps(T.recoverSteps)} />}>
        <Messages />
        <form id={formId} className="form" noValidate onSubmit={onSubmit(() => void recoverRequest(email))}>
          <Field
            label={T.email}
            type="email"
            autoComplete="email"
            value={email}
            error={fieldError('email')}
            onChange={(e) => setEmail(e.target.value)}
          />
        </form>
      </FormBody>
      <Actions>
        <BackButton onClick={() => showView('login')} />
        <SubmitButton large form={formId} label={T.recoverSubmit} busy={busy} />
      </Actions>
    </>
  );
}

function NewPasswordFields({
  value,
  repeat,
  onValue,
  onRepeat,
}: {
  value: string;
  repeat: string;
  onValue: (v: string) => void;
  onRepeat: (v: string) => void;
}) {
  const fieldError = useFieldError();
  return (
    <>
      <Field
        label={T.newPassword}
        hint={T.passwordHint}
        type="password"
        autoComplete="new-password"
        value={value}
        error={fieldError('password')}
        onChange={(e) => onValue(e.target.value)}
      />
      <Field
        label={T.newPasswordRepeat}
        type="password"
        autoComplete="new-password"
        value={repeat}
        error={fieldError('repeat')}
        onChange={(e) => onRepeat(e.target.value)}
      />
    </>
  );
}

function RecoverCodeView() {
  const formId = useId();
  const busy = useBusy();
  const fieldError = useFieldError();
  const email = useApp((s) => s.account.email);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  return (
    <>
      <Head title={T.recoverTitle} intro={T.recoverCodeIntro(email)} />
      <FormBody aside={<Points items={steps(T.recoverSteps)} />}>
        <Messages />
        <form
          id={formId}
          className="form"
          noValidate
          onSubmit={onSubmit(() => void recoverConfirm(code.trim(), password, repeat))}
        >
          <Field
            label={T.code}
            {...codeInput}
            value={code}
            error={fieldError('code')}
            onChange={(e) => setCode(e.target.value)}
          />
          <NewPasswordFields value={password} repeat={repeat} onValue={setPassword} onRepeat={setRepeat} />
        </form>
      </FormBody>
      <Actions>
        <BackButton onClick={() => showView('login')} />
        <SubmitButton large form={formId} label={T.recoverCodeSubmit} busy={busy} />
      </Actions>
    </>
  );
}

function RevertView() {
  const formId = useId();
  const busy = useBusy();
  const fieldError = useFieldError();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  return (
    <>
      <Head title={T.revertTitle} intro={T.revertIntro} />
      <FormBody aside={<Points items={steps(T.revertSteps)} />}>
        <Messages />
        <form
          id={formId}
          className="form"
          noValidate
          onSubmit={onSubmit(() => void revertEmail(email, code.trim(), password, repeat))}
        >
          <Field
            label={T.revertEmail}
            type="email"
            autoComplete="email"
            value={email}
            error={fieldError('email')}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            label={T.code}
            {...codeInput}
            value={code}
            error={fieldError('code')}
            onChange={(e) => setCode(e.target.value)}
          />
          <NewPasswordFields value={password} repeat={repeat} onValue={setPassword} onRepeat={setRepeat} />
        </form>
      </FormBody>
      <Actions>
        <BackButton onClick={() => showView('login')} />
        <SubmitButton large form={formId} label={T.revertSubmit} busy={busy} />
      </Actions>
    </>
  );
}

type Section = 'password' | 'email' | 'delete' | null;

function ProfileView() {
  const user = useApp((s) => s.account.user);
  const pendingEmail = useApp((s) => s.account.pendingEmail);
  const progress = useApp((s) => s.progress.data);
  const [open, setOpen] = useState<Section>(null);
  if (!user) return null;
  const toggle = (s: Section) => {
    cancelEmailChange();
    setOpen(open === s ? null : s);
  };
  const row = (s: Exclude<Section, null>, title: string, detail: string | null, action: string) => (
    <div className="account-row">
      <div>
        <b>{title}</b>
        {detail ? <span>{detail}</span> : null}
      </div>
      <button type="button" className="btn" aria-expanded={open === s} onClick={() => toggle(s)}>
        {action}
      </button>
    </div>
  );
  return (
    <>
      <Head title={T.profileTitle(user.displayName)} intro={T.profileIntro} />
      <FormBody summary={<ProgressSummary />}>
        <Messages />
        {row('password', T.password, null, T.changePassword)}
        {open === 'password' ? (
          <Opened>
            <ChangePasswordForm onDone={() => setOpen(null)} />
          </Opened>
        ) : null}
        {row('email', T.email, user.email, T.changeEmail)}
        {open === 'email' ? <Opened>{pendingEmail ? <ConfirmEmailForm /> : <ChangeEmailForm />}</Opened> : null}
        {row('delete', T.accountRow, T.accountRowDetail, T.deleteAccount)}
        {open === 'delete' ? (
          <Opened>
            <DeleteForm />
          </Opened>
        ) : null}
      </FormBody>
      <Actions>
        <BackButton onClick={closeAccount} />
        <button type="button" className="btn btn-lg" onClick={() => void logout()}>
          {T.logout}
        </button>
        {/* El primario lleva al progreso: a elegir el camino o, ya elegido, a la colección y la tienda. */}
        {progress ? (
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={() => openProgress(progress.camino ? 'collection' : 'camino')}
          >
            {progress.camino ? P.toCollection : P.toCamino}
          </button>
        ) : null}
      </Actions>
    </>
  );
}

/** La sección abierta del perfil; si el panel se desplaza, la trae a la vista. */
function Opened({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // Sin devolver nada: en Chromium, scrollIntoView devuelve una promesa y React la tomaría por limpieza.
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest' });
  }, []);
  return (
    <div ref={ref} className="account-open">
      {children}
    </div>
  );
}

function ChangePasswordForm({ onDone }: { onDone: () => void }) {
  const busy = useBusy();
  const fieldError = useFieldError();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  return (
    <form
      className="form"
      noValidate
      onSubmit={onSubmit(
        () =>
          void changePassword(current, password, repeat).then((ok) => {
            if (ok) onDone();
          }),
      )}
    >
      <Field
        label={T.currentPassword}
        type="password"
        autoComplete="current-password"
        value={current}
        error={fieldError('current')}
        onChange={(e) => setCurrent(e.target.value)}
      />
      <NewPasswordFields value={password} repeat={repeat} onValue={setPassword} onRepeat={setRepeat} />
      <div className="form-actions">
        <SubmitButton label={T.savePassword} busy={busy} />
      </div>
    </form>
  );
}

function ChangeEmailForm() {
  const busy = useBusy();
  const fieldError = useFieldError();
  const [password, setPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  return (
    <form className="form" noValidate onSubmit={onSubmit(() => void changeEmailRequest(password, newEmail))}>
      <Field
        label={T.newEmail}
        type="email"
        autoComplete="email"
        value={newEmail}
        error={fieldError('email')}
        onChange={(e) => setNewEmail(e.target.value)}
      />
      <Field
        label={T.currentPassword}
        type="password"
        autoComplete="current-password"
        value={password}
        error={fieldError('current')}
        onChange={(e) => setPassword(e.target.value)}
      />
      <div className="form-actions">
        <SubmitButton label={T.send} busy={busy} />
      </div>
    </form>
  );
}

function ConfirmEmailForm() {
  const busy = useBusy();
  const fieldError = useFieldError();
  const [code, setCode] = useState('');
  return (
    <form className="form" noValidate onSubmit={onSubmit(() => void changeEmailConfirm(code.trim()))}>
      <Field
        label={T.code}
        {...codeInput}
        value={code}
        error={fieldError('code')}
        onChange={(e) => setCode(e.target.value)}
      />
      <div className="form-actions">
        <button type="button" className="btn" onClick={cancelEmailChange}>
          {T.cancel}
        </button>
        <SubmitButton label={T.changeEmailSubmit} busy={busy} />
      </div>
    </form>
  );
}

/** Borrar pide confirmar con la contraseña: el botón de peligro nunca actúa con un solo clic. */
function DeleteForm() {
  const busy = useBusy();
  const fieldError = useFieldError();
  const [password, setPassword] = useState('');
  return (
    <form className="form" noValidate onSubmit={onSubmit(() => void deleteAccount(password))}>
      <Notice tone="danger">{T.deleteWarning}</Notice>
      <Field
        label={T.currentPassword}
        type="password"
        autoComplete="current-password"
        value={password}
        error={fieldError('current')}
        onChange={(e) => setPassword(e.target.value)}
      />
      <div className="form-actions">
        <SubmitButton danger label={T.deleteSubmit} busy={busy} />
      </div>
    </form>
  );
}

/** El aviso de privacidad como pantalla de lectura: su columna se desplaza y el texto nunca se corta. */
function PrivacyParts({ onBack, readingRef }: { onBack: () => void; readingRef?: RefObject<HTMLElement | null> }) {
  return (
    <>
      <Head title={PRIVACY_NOTICE.title} intro={PRIVACY_NOTICE.since} />
      <div className="reading-body">
        {/* biome-ignore lint/a11y/noNoninteractiveTabindex: una región que se desplaza debe poder enfocarse para leerla con el teclado (WCAG 2.1.1). */}
        <section ref={readingRef} className="paper reading" tabIndex={0} aria-label={PRIVACY_NOTICE.title}>
          {PRIVACY_NOTICE.sections.map((s) => (
            <section key={s.title || 'intro'}>
              {s.title ? <h2>{s.title}</h2> : null}
              {'items' in s ? (
                <ul>
                  {s.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
              {s.body.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </section>
          ))}
        </section>
        <NinjaTrio />
      </div>
      <Actions>
        <BackButton onClick={onBack} />
      </Actions>
    </>
  );
}

/** El aviso abierto desde el registro: la misma pantalla de lectura, encima, sin perder lo escrito. */
function PrivacyDialog({ onClose }: { onClose: () => void }) {
  const reading = useRef<HTMLElement>(null);
  useEffect(() => {
    reading.current?.focus();
  }, []);
  return (
    <div
      className="screen account-screen"
      role="dialog"
      aria-modal="true"
      aria-label={PRIVACY_NOTICE.title}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <PrivacyParts onBack={onClose} readingRef={reading} />
    </div>
  );
}

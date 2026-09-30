import { type FormEvent, type ReactNode, useEffect, useId, useState } from 'react';
import { art } from '../art';
import { PRIVACY_NOTICE, ACCOUNT_TEXT as T } from '../i18n/es';
import {
  cancelEmailChange,
  changeEmailConfirm,
  changeEmailRequest,
  changePassword,
  closeAccount,
  deleteAccount,
  login,
  logout,
  recoverConfirm,
  recoverRequest,
  register,
  resendCode,
  revertEmail,
  showView,
  verify,
} from '../state/account';
import { useApp } from '../state/store';
import { Modal } from './common';
import { Turnstile } from './Turnstile';

/* Pantalla de cuenta del modo en línea (PRD de v2, R-43 a R-50). */

export function AccountScreen() {
  const view = useApp((s) => s.account.view);
  return (
    <div className="screen account-screen">
      <img className="bg" src={art.background('cumbre')} alt="" />
      <div className="veil" />
      <section className="paper account-panel">
        {view === 'login' ? <LoginView /> : null}
        {view === 'register' ? <RegisterView /> : null}
        {view === 'verify' ? <VerifyView /> : null}
        {view === 'recover' ? <RecoverView /> : null}
        {view === 'recoverCode' ? <RecoverCodeView /> : null}
        {view === 'revert' ? <RevertView /> : null}
        {view === 'profile' ? <ProfileView /> : null}
        {view === 'privacy' ? <PrivacyView /> : null}
      </section>
    </div>
  );
}

/** Error y aviso de la última acción; los lectores de pantalla los anuncian. */
function Messages() {
  const error = useApp((s) => s.account.error);
  const info = useApp((s) => s.account.info);
  return (
    <>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="form-info" role="status">
          {info}
        </p>
      ) : null}
    </>
  );
}

function Field({
  label,
  hint,
  ...input
}: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  // La ayuda va aparte de la etiqueta (aria-describedby): el nombre del campo es solo la etiqueta.
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} aria-describedby={hint ? `${id}-hint` : undefined} {...input} />
      {hint ? <small id={`${id}-hint`}>{hint}</small> : null}
    </div>
  );
}

function Form({ onSubmit, children }: { onSubmit: () => void; children: ReactNode }) {
  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    onSubmit();
  };
  return (
    <form className="form" onSubmit={submit} noValidate>
      {children}
    </form>
  );
}

function Submit({ label, disabled }: { label: string; disabled?: boolean }) {
  const busy = useApp((s) => s.account.busy);
  return (
    <button type="submit" className="btn btn-primary" disabled={busy || disabled}>
      {label}
    </button>
  );
}

const codeInput = {
  inputMode: 'numeric' as const,
  autoComplete: 'one-time-code',
  maxLength: 6,
  pattern: '\\d{6}',
};

function LoginView() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return (
    <>
      <h1 className="display">{T.loginTitle}</h1>
      <p>{T.loginIntro}</p>
      <Messages />
      <Form onSubmit={() => void login(email, password)}>
        <Field
          label={T.email}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          label={T.password}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Submit label={T.loginSubmit} />
      </Form>
      <div className="account-links">
        <button type="button" className="link" onClick={() => showView('register')}>
          {T.toRegister}
        </button>
        <button type="button" className="link" onClick={() => showView('recover')}>
          {T.toRecover}
        </button>
        <button type="button" className="link" onClick={() => showView('revert')}>
          {T.toRevert}
        </button>
      </div>
      <BackToTitle />
    </>
  );
}

function RegisterView() {
  const siteKey = useApp((s) => s.account.turnstileSiteKey);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  // El token del captcha vale una vez: tras cada envío se remonta el widget para pedir otro.
  const [captchaKey, setCaptchaKey] = useState(0);
  const [privacyOpen, setPrivacyOpen] = useState(false);

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
      <h1 className="display">{T.registerTitle}</h1>
      <Messages />
      <Form onSubmit={() => void submit()}>
        <Field
          label={T.email}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          label={T.displayName}
          hint={T.displayNameHint}
          autoComplete="nickname"
          maxLength={32}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <Field
          label={T.password}
          hint={T.passwordHint}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <label className="check">
          <input type="checkbox" checked={acceptPrivacy} onChange={(e) => setAcceptPrivacy(e.target.checked)} />
          <span>
            {T.acceptPrivacy}{' '}
            <button type="button" className="link" onClick={() => setPrivacyOpen(true)}>
              {T.privacy.toLowerCase()}
            </button>
            .
          </span>
        </label>
        {siteKey ? (
          <>
            <Turnstile key={captchaKey} siteKey={siteKey} onToken={setToken} />
            {token ? null : <small className="captcha-wait">{T.captchaWaiting}</small>}
          </>
        ) : null}
        <Submit label={T.registerSubmit} disabled={siteKey !== null && !token} />
      </Form>
      <button type="button" className="btn account-back" onClick={() => showView('login')}>
        {T.back}
      </button>
      {privacyOpen ? (
        <Modal label={PRIVACY_NOTICE.title} onClose={() => setPrivacyOpen(false)}>
          <PrivacyText />
          <div className="modal-actions">
            <button type="button" className="btn btn-primary" onClick={() => setPrivacyOpen(false)}>
              {T.back}
            </button>
          </div>
        </Modal>
      ) : null}
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

function VerifyView() {
  const email = useApp((s) => s.account.email);
  const [code, setCode] = useState('');
  const [left, restart] = useCooldown(60);
  return (
    <>
      <h1 className="display">{T.verifyTitle}</h1>
      <p>{T.verifyIntro(email)}</p>
      <Messages />
      <Form onSubmit={() => void verify(code.trim())}>
        <Field label={T.code} {...codeInput} value={code} onChange={(e) => setCode(e.target.value)} />
        <Submit label={T.verifySubmit} />
      </Form>
      <div className="profile-actions">
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
        <button type="button" className="btn" onClick={() => showView('login')}>
          {T.back}
        </button>
      </div>
    </>
  );
}

function RecoverView() {
  const [email, setEmail] = useState('');
  return (
    <>
      <h1 className="display">{T.recoverTitle}</h1>
      <p>{T.recoverIntro}</p>
      <Messages />
      <Form onSubmit={() => void recoverRequest(email)}>
        <Field
          label={T.email}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Submit label={T.recoverSubmit} />
      </Form>
      <button type="button" className="btn account-back" onClick={() => showView('login')}>
        {T.back}
      </button>
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
  return (
    <>
      <Field
        label={T.newPassword}
        hint={T.passwordHint}
        type="password"
        autoComplete="new-password"
        value={value}
        onChange={(e) => onValue(e.target.value)}
      />
      <Field
        label={T.newPasswordRepeat}
        type="password"
        autoComplete="new-password"
        value={repeat}
        onChange={(e) => onRepeat(e.target.value)}
      />
    </>
  );
}

function RecoverCodeView() {
  const email = useApp((s) => s.account.email);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  return (
    <>
      <h1 className="display">{T.recoverTitle}</h1>
      <p>{T.recoverCodeIntro(email)}</p>
      <Messages />
      <Form onSubmit={() => void recoverConfirm(code.trim(), password, repeat)}>
        <Field label={T.code} {...codeInput} value={code} onChange={(e) => setCode(e.target.value)} />
        <NewPasswordFields value={password} repeat={repeat} onValue={setPassword} onRepeat={setRepeat} />
        <Submit label={T.recoverCodeSubmit} />
      </Form>
      <button type="button" className="btn account-back" onClick={() => showView('login')}>
        {T.back}
      </button>
    </>
  );
}

function RevertView() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  return (
    <>
      <h1 className="display">{T.revertTitle}</h1>
      <p>{T.revertIntro}</p>
      <Messages />
      <Form onSubmit={() => void revertEmail(email, code.trim(), password, repeat)}>
        <Field
          label={T.revertEmail}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field label={T.code} {...codeInput} value={code} onChange={(e) => setCode(e.target.value)} />
        <NewPasswordFields value={password} repeat={repeat} onValue={setPassword} onRepeat={setRepeat} />
        <Submit label={T.revertSubmit} />
      </Form>
      <button type="button" className="btn account-back" onClick={() => showView('login')}>
        {T.back}
      </button>
    </>
  );
}

type Section = 'password' | 'email' | 'delete' | null;

function ProfileView() {
  const user = useApp((s) => s.account.user);
  const pendingEmail = useApp((s) => s.account.pendingEmail);
  const [open, setOpen] = useState<Section>(null);
  if (!user) return null;
  const toggle = (s: Section) => {
    cancelEmailChange();
    setOpen(open === s ? null : s);
  };
  return (
    <>
      <h1 className="display">{T.profileTitle(user.displayName)}</h1>
      <p className="profile-email">{user.email}</p>
      <p>{T.profileIntro}</p>
      <Messages />
      <div className="profile-actions">
        <button type="button" className="btn" aria-expanded={open === 'password'} onClick={() => toggle('password')}>
          {T.changePassword}
        </button>
        <button type="button" className="btn" aria-expanded={open === 'email'} onClick={() => toggle('email')}>
          {T.changeEmail}
        </button>
        <button type="button" className="btn" onClick={() => void logout()}>
          {T.logout}
        </button>
        <button
          type="button"
          className="btn btn-danger"
          aria-expanded={open === 'delete'}
          onClick={() => toggle('delete')}
        >
          {T.deleteAccount}
        </button>
      </div>
      {open === 'password' ? <ChangePasswordForm onDone={() => setOpen(null)} /> : null}
      {open === 'email' ? pendingEmail ? <ConfirmEmailForm /> : <ChangeEmailForm /> : null}
      {open === 'delete' ? <DeleteForm /> : null}
      <BackToTitle />
    </>
  );
}

function ChangePasswordForm({ onDone }: { onDone: () => void }) {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  return (
    <Form
      onSubmit={() =>
        void changePassword(current, password, repeat).then((ok) => {
          if (ok) onDone();
        })
      }
    >
      <Field
        label={T.currentPassword}
        type="password"
        autoComplete="current-password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
      />
      <NewPasswordFields value={password} repeat={repeat} onValue={setPassword} onRepeat={setRepeat} />
      <Submit label={T.changePassword} />
    </Form>
  );
}

function ChangeEmailForm() {
  const [password, setPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  return (
    <Form onSubmit={() => void changeEmailRequest(password, newEmail)}>
      <Field
        label={T.newEmail}
        type="email"
        autoComplete="email"
        value={newEmail}
        onChange={(e) => setNewEmail(e.target.value)}
      />
      <Field
        label={T.currentPassword}
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Submit label={T.send} />
    </Form>
  );
}

function ConfirmEmailForm() {
  const [code, setCode] = useState('');
  return (
    <Form onSubmit={() => void changeEmailConfirm(code.trim())}>
      <Field label={T.code} {...codeInput} value={code} onChange={(e) => setCode(e.target.value)} />
      <Submit label={T.changeEmailSubmit} />
      <button type="button" className="btn" onClick={cancelEmailChange}>
        {T.cancel}
      </button>
    </Form>
  );
}

function DeleteForm() {
  const [password, setPassword] = useState('');
  return (
    <Form onSubmit={() => void deleteAccount(password)}>
      <p className="form-warning">{T.deleteWarning}</p>
      <Field
        label={T.currentPassword}
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Submit label={T.deleteSubmit} />
    </Form>
  );
}

export function PrivacyText() {
  return (
    <div className="privacy">
      <h2 className="display">{PRIVACY_NOTICE.title}</h2>
      <p className="privacy-since">{PRIVACY_NOTICE.since}</p>
      {PRIVACY_NOTICE.sections.map((s) => (
        <section key={s.title || 'intro'}>
          {s.title ? <h3>{s.title}</h3> : null}
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
    </div>
  );
}

function PrivacyView() {
  return (
    <>
      <PrivacyText />
      <BackToTitle />
    </>
  );
}

function BackToTitle() {
  return (
    <button type="button" className="btn account-back" onClick={closeAccount}>
      {T.back}
    </button>
  );
}

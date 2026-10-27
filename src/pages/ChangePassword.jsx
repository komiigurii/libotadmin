import { useEffect, useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../api/api';
import { saveSession, getToken, clearSession } from '../auth/session';
import { roleLabel } from '../auth/roles';
import { theme as t, radius, fonts, type } from '../theme';
import { Button } from '../components/Layout';
import { notify } from '../components/AppAlert';
import Icon from '../components/Icon';
import logo from '../assets/logo.png';
import loginBg from '../assets/login-bg.jpg';
import { passwordChecks, passwordProblem, PASSWORD_MAX } from '../utils/passwordRule';
import './Login.css';

/*
 * Choosing your own password (mock defense 2026-10-21).
 *
 *   SetPassword     /set-password — right after signing in with a temporary
 *                   password from a credential slip. Nothing else in the panel
 *                   opens until it's done (the server refuses everything else
 *                   with 403 mustChangePassword). Built in the sign-in page's
 *                   frame, since it's the second step of signing in.
 *   PasswordForm    the form both use. Any time after that, it opens in a
 *                   pop-up over the page you're on (ConsoleShell's
 *                   PasswordDialog; mock defense notes 2026-10-26: "pop-up yung
 *                   change password sa web"), not a page of its own.
 *
 * Saving ends the account's other sessions; this one carries on with the fresh
 * token the server sends back.
 */

export function PasswordForm({ forced, onDone }) {
  const ids = { cur: useId(), next: useId(), again: useId(), err: useId() };
  const [username, setUsername] = useState('');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  const [tried, setTried] = useState(false);
  const [serverError, setServerError] = useState({});
  const [saving, setSaving] = useState(false);

  // Who is signed in, for "Signed in as …" and the not-your-username rule.
  useEffect(() => {
    let live = true;
    authAPI.session().then((d) => { if (live) setUsername(d.username || ''); }).catch(() => {});
    return () => { live = false; };
  }, []);

  // First sign-in: the slip's password was typed a moment ago to sign in, so
  // it isn't asked for again (the server skips that check too).
  const errors = {};
  if (!forced && !current) errors.currentPassword = 'Enter your current password.';
  const p = passwordProblem(next, username);
  if (p) errors.newPassword = p;
  else if (!forced && next === current) errors.newPassword = 'Choose a password different from the current one.';
  if (!again) errors.confirmPassword = 'Type the new password again.';
  else if (again !== next) errors.confirmPassword = 'The two passwords don’t match.';
  const shown = { ...(tried ? errors : {}), ...serverError };
  const checks = passwordChecks(next, username);

  const submit = async (e) => {
    e.preventDefault();
    setTried(true);
    setServerError({});
    const first = Object.keys(errors)[0];
    if (first) {
      document.getElementById({ currentPassword: ids.cur, newPassword: ids.next, confirmPassword: ids.again }[first])?.focus();
      return;
    }
    setSaving(true);
    try {
      const data = await authAPI.changePassword(forced ? undefined : current, next, again);
      saveSession({ token: data.token, role: data.role, city: data.city, mustChangePassword: false });
      onDone();
    } catch (err) {
      const body = err?.response?.data;
      if (body?.field) setServerError({ [body.field]: body.message });
      else notify(body?.message || 'Couldn’t reach the server. Try again.', { tone: 'danger' });
    }
    setSaving(false);
  };

  const field = (key, id, label, value, setter, autoComplete) => (
    <div style={f.field}>
      <label htmlFor={id} style={f.label}>{label}</label>
      <input
        id={id} type={show ? 'text' : 'password'} value={value} maxLength={PASSWORD_MAX}
        autoFocus={key === (forced ? 'newPassword' : 'currentPassword')}
        onChange={(e) => { setter(e.target.value); setServerError({}); }}
        autoComplete={autoComplete} className="modern-input"
        aria-invalid={!!shown[key]} aria-describedby={shown[key] ? `${id}-err` : undefined}
        style={{ ...f.input, ...(shown[key] ? f.inputInvalid : null) }}
      />
      {shown[key] && <p id={`${id}-err`} style={f.error}><Icon name="alert-circle" size={13} /> {shown[key]}</p>}
    </div>
  );

  return (
    <form onSubmit={submit} noValidate aria-describedby={ids.err}>
      {username && <p style={f.who}>Signed in as <strong style={{ fontFamily: fonts.mono }}>{username}</strong></p>}
      {!forced && field('currentPassword', ids.cur, 'Current password', current, setCurrent, 'current-password')}
      {field('newPassword', ids.next, 'New password', next, setNext, 'new-password')}
      <ul style={f.checks} aria-label="The new password needs">
        {checks.map((c) => (
          <li key={c.key} style={{ ...f.check, color: c.ok && next ? t.success : t.textMuted }}>
            <Icon name={c.ok && next ? 'check-circle' : 'alert-circle'} size={13} /> {c.label}
          </li>
        ))}
      </ul>
      {field('confirmPassword', ids.again, 'Type the new password again', again, setAgain, 'new-password')}
      <label style={f.show}>
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show the passwords
      </label>
      <Button type="submit" variant="primary" disabled={saving} style={f.submit}>
        {saving ? 'Saving…' : forced ? 'Save and continue' : 'Change password'}
      </Button>
      <p id={ids.err} style={f.help}>
        Saving signs this account out everywhere else. Only you should know this password: don’t write it on the slip.
      </p>
    </form>
  );
}

/** /set-password — the step after signing in with a temporary password. */
export function SetPassword() {
  const navigate = useNavigate();
  // No console around this page, so no PageHeader to name the tab.
  useEffect(() => { document.title = `Set your password · Libot ${roleLabel()}`; }, []);
  const signOut = () => {
    const token = getToken();
    if (token) authAPI.logout(token).catch(() => {});
    clearSession();
    navigate('/login', { replace: true });
  };
  return (
    <div className="signin">
      <aside className="signin-rail" aria-label="LibotBulacan" style={{ backgroundImage: `url(${loginBg})` }}>
        <div style={f.brand}>
          <img src={logo} alt="" style={f.logo} />
          <div style={f.wordmark}>LibotBulacan</div>
          <div style={f.console}>Admin and moderator console</div>
        </div>
      </aside>
      <main className="signin-panel">
        <div style={f.card}>
          <h1 style={f.title}>Choose your own password</h1>
          <p style={f.subtitle}>
            You signed in with the temporary password from your slip. Choose one that only you know before you continue;
            the temporary one then stops working. No need to type the temporary one again.
          </p>
          <PasswordForm forced onDone={() => {
            notify('Your password is saved. Use it from now on.', { tone: 'success' });
            navigate('/dashboard', { replace: true });
          }} />
          <p style={f.help}>
            Not you, or want to do this later? <button type="button" onClick={signOut} style={f.link}>Sign out</button>
          </p>
        </div>
      </main>
    </div>
  );
}

const f = {
  brand:   { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left', gap: 12 },
  logo:     { width: 64, height: 64, objectFit: 'contain', borderRadius: 18, display: 'block' },
  // Ink comes from .signin-rail (the brand sits on the sign-in artwork).
  wordmark: { fontFamily: fonts.brand, fontWeight: 400, fontSize: 'clamp(24px, 2.4vw, 32px)', lineHeight: 1.1 },
  console:  { fontSize: 13, fontWeight: 600 },
  card: {
    width: '100%', maxWidth: 440, boxSizing: 'border-box',
    background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: radius.xl,
    padding: 'clamp(22px, 4vw, 34px)',
  },
  title:    { ...type.pageTitle, fontSize: 28, color: t.textPrimary, margin: 0 },
  subtitle: { ...type.body, fontSize: 14, color: t.textSecondary, margin: '6px 0 20px' },
  who:      { fontSize: 13, color: t.textSecondary, margin: '0 0 14px' },
  field:    { marginBottom: 14 },
  label:    { display: 'block', fontSize: 13.5, fontWeight: 600, color: t.textPrimary, marginBottom: 7 },
  input: {
    width: '100%', height: 44, padding: '0 14px', boxSizing: 'border-box',
    borderRadius: radius.md, borderWidth: 1, borderStyle: 'solid', borderColor: t.border,
    background: t.sidebarBg, color: t.textPrimary, fontFamily: 'inherit', fontSize: 15, outline: 'none',
  },
  inputInvalid: { borderColor: t.danger },
  error:    { display: 'flex', alignItems: 'center', gap: 6, margin: '6px 0 0', fontSize: 13, color: t.danger },
  checks:   { listStyle: 'none', margin: '-4px 0 14px', padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(170px, 100%), 1fr))', gap: '4px 12px' },
  check:    { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 },
  show:     { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: t.textSecondary, margin: '2px 0 16px', cursor: 'pointer' },
  submit:   { width: '100%', minHeight: 44, fontSize: 15 },
  help:     { fontSize: 12.5, lineHeight: 1.5, color: t.textMuted, textAlign: 'center', margin: '14px 0 0' },
  link:     { background: 'none', border: 'none', padding: 0, color: t.brand, fontFamily: 'inherit', fontSize: 'inherit', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' },
};

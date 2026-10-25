import { useEffect, useId, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI, accountsAPI, activityAPI } from '../api/api';
import { useLiveTick } from '../api/live';
import { saveSession, getToken, clearSession } from '../auth/session';
import { getRole, isSuperAdmin, roleLabel } from '../auth/roles';
import { useHeartbeat } from '../auth/heartbeat';
import { actionLabel, groupOf, GROUP_HUE } from '../utils/activity';
import { fmtDateTime, timeAgo } from '../utils/format';
import { theme as t, radius, fonts, type } from '../theme';
import { Page, PageHeader, Button, Loading } from '../components/Layout';
import { Bone } from '../components/Skeleton';
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
 *   ChangePassword  /change-password — any time, from the rail's footer.
 *
 * Saving ends the account's other sessions; this one carries on with the fresh
 * token the server sends back.
 */

function PasswordForm({ forced, onDone }) {
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

  const errors = {};
  if (!current) errors.currentPassword = forced ? 'Enter the temporary password from your slip.' : 'Enter your current password.';
  const p = passwordProblem(next, username);
  if (p) errors.newPassword = p;
  else if (next === current) errors.newPassword = 'Choose a password different from the current one.';
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
      const data = await authAPI.changePassword(current, next, again);
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
      {field('currentPassword', ids.cur, forced ? 'Temporary password' : 'Current password', current, setCurrent, 'current-password')}
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
            the temporary one then stops working.
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

/** /change-password — any time, from the rail. */
export default function ChangePassword() {
  const navigate = useNavigate();
  const form = (
    <PasswordForm onDone={() => {
      notify('Your password is changed.', { tone: 'success' });
      navigate('/dashboard');
    }} />
  );
  const subtitle = 'Choose a new password for your account. You stay signed in here; any other window or device is signed out.';
  // The form, and beside it: for the super admin, what was done with this
  // account lately, so a sign-in you don't recognise stands out before you
  // change the password (only the super admin can read the activity log);
  // for an admin or a moderator, the account itself and where to turn.
  return (
    <Page>
      <PageHeader title="Change password" subtitle={subtitle} />
      <div className="sa-grid sa-split-even">
        <section className="sa-panel" style={{ padding: '18px 20px' }} aria-label="New password">{form}</section>
        {isSuperAdmin() ? <MyRecentActivity /> : <MyAccount />}
      </div>
    </Page>
  );
}

function MyAccount() {
  const beat = useHeartbeat();
  const role = getRole();
  const city = localStorage.getItem('city') || '';
  const rows = [
    ['Username', beat?.username ? <span style={{ fontFamily: fonts.mono }}>{beat.username}</span> : <Bone inline w={96} h={13} />],
    ['Role', roleLabel(role)],
    ['Looks after', role === 'moderator' ? (city || 'No city assigned') : 'All of Bulacan'],
  ];
  return (
    <section className="sa-panel" aria-labelledby="my-account">
      <div className="sa-panel-head">
        <h2 id="my-account" className="sa-panel-title"><Icon name="user" size={16} /> Your account</h2>
      </div>
      <dl style={{ margin: 0 }}>
        {rows.map(([k, v]) => (
          <div key={k} style={f.fact}>
            <dt style={{ color: t.textMuted }}>{k}</dt>
            <dd style={{ margin: 0, fontWeight: 700, color: t.textPrimary, textAlign: 'right' }}>{v}</dd>
          </div>
        ))}
      </dl>
      <p style={{ ...f.help, textAlign: 'left', margin: 0, padding: '12px 16px 14px' }}>
        Usernames are permanent. Forgot your password later? Use “Forgot your password?” on the sign-in page: the super admin
        gives you a new slip. Something you don’t recognise? <Link to="/tickets" style={f.inlineLink}>Report a Problem</Link>.
      </p>
    </section>
  );
}

function MyRecentActivity() {
  const [entries, setEntries] = useState(undefined);
  const changed = useLiveTick(['activity']);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const { username } = await authAPI.session();
        const { accounts } = await accountsAPI.getStaff({ role: 'superadmin' });
        const me = (accounts || []).find((a) => a.username === username);
        const data = me ? await activityAPI.get({ actor: me.id, limit: 10 }) : { entries: [] };
        if (live) setEntries(data.entries || []);
      } catch {
        // A failed live reload keeps the list shown.
        if (live) setEntries((prev) => (prev === undefined ? null : prev));
      }
    })();
    return () => { live = false; };
  }, [changed]);
  return (
    <section className="sa-panel" aria-labelledby="my-activity">
      <div className="sa-panel-head dark">
        <h2 id="my-activity" className="sa-panel-title">Your account lately</h2>
        <Link to="/activity">Activity Log <Icon name="chevron-right" size={13} /></Link>
      </div>
      {entries === undefined ? <Loading label="Loading your activity…" kind="rows" rows={5} />
        : entries === null ? <p style={f.pad}>Couldn’t load your activity.</p>
          : entries.length === 0 ? <p style={f.pad}>Nothing logged for this account yet.</p>
            : (
              <ol style={f.recent}>
                {entries.map((e) => {
                  const a = actionLabel(e.action);
                  return (
                    <li key={e._id} style={f.recentRow}>
                      <span style={f.recentWhat}>
                        <span className="sa-swatch" style={{ background: `var(--s-${GROUP_HUE[groupOf(e.action)] || 'slate'})` }} aria-hidden="true" />
                        {a.label}
                      </span>
                      <span style={f.recentText} title={e.summary}>{e.summary && e.summary !== a.label ? e.summary : ''}</span>
                      <time className="sa-mono" dateTime={e.at} title={fmtDateTime(e.at)} style={{ color: t.textMuted, whiteSpace: 'nowrap' }}>{timeAgo(e.at)}</time>
                    </li>
                  );
                })}
              </ol>
            )}
      <p style={{ ...f.help, margin: 0, padding: '10px 16px 14px' }}>A sign-in you don’t recognise? Change the password now, then tell the team.</p>
    </section>
  );
}

const f = {
  pad:        { margin: 0, padding: '14px 16px', fontSize: 15, color: t.textMuted },
  fact:       { display: 'flex', justifyContent: 'space-between', gap: 16, padding: '10px 16px', borderBottom: `1px solid ${t.divider}`, fontSize: 16 },
  inlineLink: { color: t.brand, fontWeight: 700 },
  recent:     { listStyle: 'none', margin: 0, padding: 0 },
  recentRow:  { display: 'grid', gridTemplateColumns: 'minmax(120px, auto) minmax(0, 1fr) auto', alignItems: 'center', gap: 12, padding: '9px 16px', borderBottom: `1px solid ${t.divider}`, fontSize: 15 },
  recentWhat: { display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700, color: t.textPrimary, whiteSpace: 'nowrap' },
  recentText: { color: t.textSecondary, overflowWrap: 'anywhere' },
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

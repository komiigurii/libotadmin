import { useEffect, useId, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { authAPI, systemAPI } from '../api/api';
import { saveSession, hasValidSession, mustChangePassword } from '../auth/session';
import { theme as t, radius, fonts, type } from '../theme';
import { Button } from '../components/Layout';
import Icon from '../components/Icon';
import logo from '../assets/logo.png';
// The mobile app's sign-in background (LibotBulacan/assets/bg.png: Bulacan
// landmarks under the cyan→yellow wash), re-encoded as JPEG — 478 KB → 54 KB.
import loginBg from '../assets/login-bg.jpg';
import './Login.css';

/*
 * Sign-in for the super admin, admins and moderators: one form, one endpoint,
 * and every role lands on the dashboard (the super admin's System pages are in
 * the same sidebar).
 *
 * The left side is the app's sign-in artwork (bg.png) and nothing else, no
 * teal around it, no frame. The emblem, wordmark, console name and app slogan
 * sit on it in dark ink (Login.css); the right side is the cream panel with
 * the form in a dashboard-style card.
 */

const SLOGAN = ['Discover,', 'Explore,', 'Experience', 'Bulacan.'];

// Why the last session ended, as the server reported it (one session per
// account: signing in somewhere else ends this one).
const ENDED = {
  expired:           'Your session expired. Sign in again to continue.',
  signedInElsewhere: 'Your account signed in on another window or device, so this session ended. Sign in again to continue here.',
  signedOut:         'You signed out in another window.',
  passwordChanged:   'Your password was changed. Sign in with the new one.',
  passwordReset:     'Your password was reset. Sign in with the temporary password on your new slip.',
  deactivated:       'This account has been deactivated. Ask the super admin if you need it back.',
};

const lockLabel = (s) => {
  const m = Math.floor(s / 60), r = s % 60;
  return m > 0 ? `${m}m ${String(r).padStart(2, '0')}s` : `${r}s`;
};

export default function Login() {
  // Already signed in (this browser shares one session across its tabs): go
  // straight in rather than signing in again, which would end that session.
  if (hasValidSession()) return <Navigate to={mustChangePassword() ? '/set-password' : '/dashboard'} replace />;
  return <SignInForm />;
}

function SignInForm() {
  const navigate = useNavigate();
  const ids = { user: useId(), pass: useId(), userErr: useId(), passErr: useId(), caps: useId() };

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsOn, setCapsOn]     = useState(false);
  const [loading, setLoading]   = useState(false);
  // Field errors appear after a sign-in attempt and clear as the field is fixed.
  const [submitted, setSubmitted] = useState(false);
  // What the server said (wrong credentials, lockout, offline).
  const [error, setError]       = useState('');
  // Arriving from an expired or ended session (see auth/session.js) says why.
  // It's information, not a mistake, so it isn't styled as an error.
  const [notice, setNotice]     = useState(() => ENDED[new URLSearchParams(window.location.search).get('reason')] || '');
  // Seconds left on a server-side account lockout (HTTP 423). Purely a UX
  // affordance — the backend enforces the lock regardless of what this says.
  const [lockedFor, setLockedFor] = useState(0);
  // "Forgot your password?" swaps the form for the request to the super admin.
  const [forgot, setForgot] = useState(false);
  // Said before signing in, so nobody is surprised that saving is paused.
  const [maintenanceOn, setMaintenanceOn] = useState(false);
  useEffect(() => {
    let live = true;
    systemAPI.status().then((d) => { if (live) setMaintenanceOn(!!d.maintenance?.on); }).catch(() => {});
    return () => { live = false; };
  }, []);
  // A sign-in still waiting after a few seconds is almost always the API's
  // server waking up (it sleeps when idle, 30–60 s) — say so.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!loading) return undefined;
    const timer = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(timer);
  }, [loading]);

  const fieldErrors = {
    username: !username.trim() ? 'Enter your username.' : '',
    password: !password ? 'Enter your password.' : '',
  };
  const showErr = (f) => (submitted ? fieldErrors[f] : '');

  // Tick the lockout down once a second and clear the banner when it ends.
  useEffect(() => {
    if (lockedFor <= 0) return undefined;
    const timer = setInterval(() => {
      setLockedFor((s) => {
        if (s <= 1) { setError(''); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockedFor > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (lockedFor > 0 || loading) return;
    setSubmitted(true);
    setNotice('');
    if (fieldErrors.username) return document.getElementById(ids.user)?.focus();
    if (fieldErrors.password) return document.getElementById(ids.pass)?.focus();

    try {
      setError('');
      setLoading(true);
      const data = await authAPI.login(username.trim(), password);
      if (data.success && data.token) {
        saveSession({ token: data.token, role: data.role, city: data.city, mustChangePassword: data.mustChangePassword });
        // Every role starts on the dashboard: it shows what's waiting on them.
        // A temporary password from a slip is replaced first.
        navigate(data.mustChangePassword ? '/set-password' : '/dashboard', { replace: true });
      } else {
        setError(data.message || "Couldn't sign you in. Check your username and password.");
      }
    } catch (err) {
      const res = err?.response;
      // 423 Locked — the account hit the failed-attempt threshold. Count it
      // down so the button doesn't sit there rejecting every press.
      if (res?.status === 423 && res.data?.retryAfterSeconds) setLockedFor(res.data.retryAfterSeconds);
      setError(
        res?.data?.message
          || (res ? "Couldn't sign you in. Check your username and password."
                  : "Couldn't reach the server. Check your connection and try again.")
      );
    } finally {
      setLoading(false);
      setSlow(false);
    }
  };

  // Caps Lock is the usual reason a remembered password "stops working".
  const trackCaps = (e) => setCapsOn(!!e.getModifierState?.('CapsLock'));

  const locked = lockedFor > 0;

  return (
    <div className="signin">
      <aside className="signin-rail" aria-label="Libot Bulacan" style={{ backgroundImage: `url(${loginBg})` }}>
        {/* The sidebar's brand block, larger. */}
        <div className="signin-brand" style={s.brand}>
          <span className="signin-emblem" style={s.emblem}>
            <img src={logo} alt="" style={s.logo} />
          </span>
          <div className="signin-brand-text" style={s.brandText}>
            <div className="signin-wordmark" style={s.wordmark}>LibotBulacan</div>
            <div style={s.console}>Admin and moderator console</div>
          </div>
        </div>

        <p className="signin-slogan" style={s.slogan}>
          {SLOGAN.map((line, i) => <span key={line} style={s.sloganLine}>{line}{i < SLOGAN.length - 1 ? ' ' : ''}</span>)}
        </p>
      </aside>

      <main className="signin-panel">
        {forgot ? <ForgotPassword initialUsername={username} onBack={() => setForgot(false)} /> : (
        <form className="signin-card" style={s.card} onSubmit={handleSubmit} noValidate aria-labelledby="login-title">
          <h1 id="login-title" style={s.title}>Sign in</h1>
          <p style={s.subtitle}>For admins and moderators. Use the username and password you were given.</p>

          {maintenanceOn && (
            <div role="status" style={{ ...s.banner, ...s.bannerWarning }}>
              <Icon name="tool" size={15} />
              <span>The system is under maintenance. You can sign in and look around, but changes can’t be saved until it ends.</span>
            </div>
          )}

          {notice && (
            <div role="status" style={{ ...s.banner, ...s.bannerInfo }}>
              <Icon name="clock" size={15} />
              <span>{notice}</span>
            </div>
          )}

          {error && (
            <div role="alert" style={{ ...s.banner, ...s.bannerError }}>
              <Icon name={locked ? 'lock' : 'alert-circle'} size={15} />
              <span>
                {error}
                {locked && <> <strong>Try again in {lockLabel(lockedFor)}.</strong></>}
              </span>
            </div>
          )}

          <div style={s.field}>
            <label htmlFor={ids.user} style={s.label}>Username</label>
            <input
              id={ids.user}
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              aria-invalid={!!showErr('username')}
              aria-describedby={showErr('username') ? ids.userErr : undefined}
              className="modern-input"
              style={{ ...s.input, ...(showErr('username') ? s.inputInvalid : null) }}
            />
            {showErr('username') && (
              <p id={ids.userErr} style={s.fieldError}>
                <Icon name="alert-circle" size={13} /> {showErr('username')}
              </p>
            )}
          </div>

          <div style={s.field}>
            <label htmlFor={ids.pass} style={s.label}>Password</label>
            <div style={s.passwordWrap}>
              <input
                id={ids.pass}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={trackCaps}
                onKeyUp={trackCaps}
                onBlur={() => setCapsOn(false)}
                autoComplete="current-password"
                aria-invalid={!!showErr('password')}
                aria-describedby={[showErr('password') && ids.passErr, capsOn && ids.caps].filter(Boolean).join(' ') || undefined}
                className="modern-input"
                style={{ ...s.input, paddingRight: 46, ...(showErr('password') ? s.inputInvalid : null) }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                style={s.eyeBtn}
              >
                <Icon name={showPassword ? 'eye-off' : 'eye'} size={18} />
              </button>
            </div>
            {showErr('password') && (
              <p id={ids.passErr} style={s.fieldError}>
                <Icon name="alert-circle" size={13} /> {showErr('password')}
              </p>
            )}
            {capsOn && (
              <p id={ids.caps} style={s.capsHint} role="status">
                <Icon name="alert-triangle" size={13} /> Caps Lock is on.
              </p>
            )}
          </div>

          <Button
            type="submit"
            variant="primary"
            disabled={loading || locked}
            style={s.submit}
          >
            {locked ? `Try again in ${lockLabel(lockedFor)}` : loading ? 'Signing in…' : 'Sign in'}
          </Button>
          {slow && (
            <p style={s.help} role="status">Waking up the server. The first sign-in can take up to a minute.</p>
          )}

          <p style={s.help}>
            <button type="button" style={s.linkBtn} onClick={() => setForgot(true)}>Forgot your password?</button>
          </p>
        </form>
        )}
      </main>
    </div>
  );
}

/*
 * Staff have no email, so a forgotten password goes to the super admin as a
 * ticket, and they make a new slip. Since 2026-10-23 the request names an
 * email address for that slip and proves it with a 6-digit code before
 * anything is sent (POST /api/auth/forgot-password, then …/verify): the
 * confirmed request reaches the super admin and support@, and the slip is
 * emailed to that address. The answers are the same whether or not the
 * username exists.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OFFLINE = "Couldn't reach the server. Check your connection and try again.";

function ForgotPassword({ initialUsername, onBack }) {
  const ids = { user: useId(), email: useId(), note: useId(), code: useId(), userErr: useId(), emailErr: useId(), codeErr: useId() };
  const [username, setUsername] = useState(initialUsername || '');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [code, setCode] = useState('');
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  // The code step: { requestId, email, minutes } once a code is mailed.
  const [pending, setPending] = useState(null);
  const [resent, setResent] = useState(false);
  const [done, setDone] = useState('');
  const [error, setError] = useState('');
  // What the server said about one field.
  const [serverField, setServerField] = useState({});

  const problems = {
    username: !username.trim() ? 'Enter your username.' : '',
    email: !email.trim() ? 'Enter the email address for your new slip.'
      : !EMAIL_SHAPE.test(email.trim()) ? 'Enter a whole email address, like name@example.com.' : '',
  };
  const shown = (f) => serverField[f] || (tried ? problems[f] || '' : '');

  const fail = (err) => {
    const body = err?.response?.data;
    if (body?.field) setServerField({ [body.field]: body.message });
    else setError(body?.message || OFFLINE);
    return body;
  };

  const askCode = async (again = false) => {
    setTried(true);
    if (problems.username) return document.getElementById(ids.user)?.focus();
    if (problems.email) return document.getElementById(ids.email)?.focus();
    setSending(true);
    setError('');
    setServerField({});
    try {
      setPending(await authAPI.forgotPassword(username.trim(), email.trim(), note.trim()));
      setCode('');
      setResent(again);
    } catch (err) {
      // A bad address takes them back to fix it.
      if (fail(err)?.field) setPending(null);
    }
    setSending(false);
  };

  const confirm = async () => {
    if (code.length !== 6) {
      setServerField({ code: 'Enter the 6-digit code from the email.' });
      return document.getElementById(ids.code)?.focus();
    }
    setSending(true);
    setError('');
    setServerField({});
    try {
      setDone((await authAPI.verifyForgotPassword(pending.requestId, code)).message);
    } catch (err) {
      // Expired or used up: back to the first step, with everything still filled in.
      if (fail(err)?.code === 'expired') setPending(null);
    }
    setSending(false);
  };

  const submit = (e) => {
    e.preventDefault();
    if (pending) confirm(); else askCode();
  };

  const fieldError = (f, id) => shown(f) && (
    <p id={id} style={s.fieldError}><Icon name="alert-circle" size={13} /> {shown(f)}</p>
  );
  const errorBanner = error && (
    <div role="alert" style={{ ...s.banner, ...s.bannerError }}>
      <Icon name="alert-circle" size={15} /><span>{error}</span>
    </div>
  );
  const backLink = (
    <p style={s.help}>
      <button type="button" style={s.linkBtn} onClick={onBack}>Back to sign in</button>
    </p>
  );

  if (done) {
    return (
      <div className="signin-card" style={s.card} role="region" aria-labelledby="forgot-title">
        <h1 id="forgot-title" style={s.title}>Request sent</h1>
        <p style={s.subtitle}>The super admin checks it and makes your new slip. It comes to the address you confirmed.</p>
        <div role="status" style={{ ...s.banner, ...s.bannerInfo }}>
          <Icon name="check-circle" size={15} />
          <span>{done}</span>
        </div>
        <Button variant="primary" onClick={onBack} style={s.submit}>Back to sign in</Button>
      </div>
    );
  }

  if (pending) {
    return (
      <form className="signin-card" style={s.card} onSubmit={submit} noValidate aria-labelledby="forgot-title">
        <h1 id="forgot-title" style={s.title}>Check your email</h1>
        <p style={s.subtitle}>
          We sent a 6-digit code to <strong style={{ color: t.textPrimary, overflowWrap: 'anywhere' }}>{pending.email}</strong>.
          Enter it within {pending.minutes || 15} minutes to send your request to the super admin.
        </p>
        {resent && !error && (
          <div role="status" style={{ ...s.banner, ...s.bannerInfo }}>
            <Icon name="mail" size={15} /><span>We sent a new code. Use the newest email.</span>
          </div>
        )}
        {errorBanner}
        <div style={s.field}>
          <label htmlFor={ids.code} style={s.label}>Code</label>
          <input id={ids.code} type="text" value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setServerField({}); }}
            inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" autoFocus className="modern-input"
            aria-invalid={!!shown('code')} aria-describedby={shown('code') ? ids.codeErr : undefined}
            style={{ ...s.input, ...s.codeInput, ...(shown('code') ? s.inputInvalid : null) }} />
          {fieldError('code', ids.codeErr)}
        </div>
        <Button type="submit" variant="primary" disabled={sending} style={s.submit}>
          {sending ? 'Checking…' : 'Confirm and send request'}
        </Button>
        <p style={s.help}>
          No email? Check spam, or{' '}
          <button type="button" style={s.linkBtn} onClick={() => askCode(true)} disabled={sending}>send a new code</button>
          {' · '}
          <button type="button" style={s.linkBtn} onClick={() => { setPending(null); setError(''); setServerField({}); }}>change the address</button>
        </p>
      </form>
    );
  }

  return (
    <form className="signin-card" style={s.card} onSubmit={submit} noValidate aria-labelledby="forgot-title">
      <h1 id="forgot-title" style={s.title}>Forgot password</h1>
      <p style={s.subtitle}>
        Your account has no email, so tell us where to send your new slip. We’ll email a code there first to check it’s yours.
      </p>
      {errorBanner}
      <div style={s.field}>
        <label htmlFor={ids.user} style={s.label}>Username</label>
        <input id={ids.user} type="text" value={username} onChange={(e) => { setUsername(e.target.value); setServerField({}); }}
          autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus className="modern-input"
          aria-invalid={!!shown('username')} aria-describedby={shown('username') ? ids.userErr : undefined}
          style={{ ...s.input, ...(shown('username') ? s.inputInvalid : null) }} />
        {fieldError('username', ids.userErr)}
      </div>
      <div style={s.field}>
        <label htmlFor={ids.email} style={s.label}>Email for your new slip</label>
        <input id={ids.email} type="email" value={email} onChange={(e) => { setEmail(e.target.value); setServerField({}); }}
          autoComplete="email" autoCapitalize="none" spellCheck={false} className="modern-input"
          placeholder="name@example.com"
          aria-invalid={!!shown('email')} aria-describedby={shown('email') ? ids.emailErr : undefined}
          style={{ ...s.input, ...(shown('email') ? s.inputInvalid : null) }} />
        {fieldError('email', ids.emailErr)}
      </div>
      <div style={s.field}>
        <label htmlFor={ids.note} style={s.label}>Note for the super admin <span style={s.optional}>(optional)</span></label>
        <textarea id={ids.note} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3}
          placeholder="e.g. I'm at the Baliwag tourism office until 5 PM."
          style={{ ...s.input, height: 'auto', padding: '10px 14px', resize: 'vertical', fontSize: 14, lineHeight: 1.5 }} />
      </div>
      <Button type="submit" variant="primary" disabled={sending} style={s.submit}>
        {sending ? 'Sending…' : 'Email me a code'}
      </Button>
      {backLink}
    </form>
  );
}

const s = {
  // ── Brand on the picture (the sidebar's brand block, scaled up). Colour
  // comes from .signin-rail: one fixed ink, since the artwork doesn't theme.
  // Everything on the picture shares one left edge with the slogan. ──
  brand: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left', gap: 14,
  },
  emblem: { display: 'grid', placeItems: 'center', flexShrink: 0 },
  logo: { width: 64, height: 64, objectFit: 'contain', borderRadius: 18, display: 'block' },
  brandText: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start' },
  // The wordmark in Knewave, as the sidebar sets it.
  wordmark: {
    fontFamily: fonts.brand, fontWeight: 400, fontSize: 'clamp(24px, 2.4vw, 32px)',
    lineHeight: 1.1, whiteSpace: 'nowrap',
  },
  console: { marginTop: 6, fontSize: 13, fontWeight: 600 },
  // Upright: Dongle has no italic.
  slogan: {
    width: '100%', maxWidth: 400, margin: 0,
    fontFamily: fonts.display, fontWeight: 700,
    fontSize: 'clamp(22px, 2.1vw, 28px)', lineHeight: 1.12,
  },
  sloganLine: { display: 'block' },

  // ── Panel (a dashboard card) ──
  card: {
    width: '100%', maxWidth: 420, boxSizing: 'border-box',
    background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: radius.xl,
    padding: 'clamp(22px, 4vw, 36px)',
  },
  title:    { ...type.pageTitle, fontSize: 30, color: t.textPrimary, margin: 0 },
  subtitle: { ...type.body, fontSize: 14.5, color: t.textSecondary, marginTop: 6, marginBottom: 24 },

  banner: {
    display: 'flex', alignItems: 'flex-start', gap: 9,
    borderRadius: radius.md, padding: '11px 14px', fontSize: 13.5, lineHeight: 1.45,
    marginBottom: 18, borderWidth: 1, borderStyle: 'solid',
  },
  bannerInfo:  { background: t.infoBg,   color: t.info,   borderColor: 'transparent' },
  bannerWarning: { background: t.warningBg, color: t.textPrimary, borderColor: t.warning },
  linkBtn: {
    background: 'none', border: 'none', padding: 0, color: t.brand, fontFamily: 'inherit', fontSize: 'inherit',
    fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3,
  },
  optional: { fontWeight: 500, color: t.textMuted },
  bannerError: { background: t.dangerBg, color: t.danger, borderColor: t.dangerBorder },

  field: { marginBottom: 18 },
  label: { display: 'block', fontSize: 13.5, fontWeight: 600, color: t.textPrimary, marginBottom: 7 },
  input: {
    width: '100%', height: 46, padding: '0 14px', boxSizing: 'border-box',
    borderRadius: radius.md, borderWidth: 1, borderStyle: 'solid', borderColor: t.border,
    // Cream inside the white card, the same fill the spot form's inputs use.
    background: t.sidebarBg, color: t.textPrimary, fontFamily: 'inherit', fontSize: 15, outline: 'none',
  },
  // Same longhand as `input`, so React swaps it cleanly (see the SpotForm note
  // in the design-system docs about shorthand/longhand mixing).
  inputInvalid: { borderColor: t.danger },
  passwordWrap: { position: 'relative' },
  eyeBtn: {
    position: 'absolute', top: 0, right: 0, height: 46, width: 46,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: 'none', color: t.textMuted, cursor: 'pointer',
    borderRadius: radius.md,
  },
  fieldError: { display: 'flex', alignItems: 'center', gap: 6, margin: '7px 0 0', fontSize: 13, color: t.danger },
  // The emailed code, spaced like the slip's password.
  // textIndent balances the spacing after the last digit, so the code centres.
  codeInput: { fontFamily: fonts.mono, fontSize: 24, fontWeight: 700, letterSpacing: '0.35em', textIndent: '0.35em', textAlign: 'center' },
  capsHint:   { display: 'flex', alignItems: 'center', gap: 6, margin: '7px 0 0', fontSize: 13, color: t.warning },

  submit: { width: '100%', minHeight: 46, fontSize: 15, marginTop: 6 },
  help: { fontSize: 13, lineHeight: 1.5, color: t.textMuted, textAlign: 'center', marginTop: 18, marginBottom: 0 },
};
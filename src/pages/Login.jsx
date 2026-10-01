import { useEffect, useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../api/api';
import { saveSession } from '../auth/session';
import { theme as t, radius, fonts, type } from '../theme';
import { Button } from '../components/Layout';
import Icon from '../components/Icon';
import logo from '../assets/logo.png';
// The mobile app's sign-in background (LibotBulacan/assets/bg.png: Bulacan
// landmarks under the cyan→yellow wash), re-encoded as JPEG — 478 KB → 54 KB.
import loginBg from '../assets/login-bg.jpg';

/*
 * Sign-in for admins and moderators.
 *
 * Two halves: a brand panel carrying the app's own sign-in artwork (bg.png,
 * so the panel and the app's front door look like one product) and a plain
 * form on the page background. The form uses theme tokens throughout, so it
 * reads correctly in light AND dark.
 *
 * The artwork is light, and white text on it measures ~1.5:1. A dark gradient
 * (.login-scrim in App.css) sits behind the logo at the top and the headline
 * at the bottom and leaves the middle of the picture almost clear. Measured
 * on the real pixels at 900–1920 px widths: logo ≥ 5.0:1, headline ≥ 6.4:1,
 * small text ≥ 8.2:1. Re-measure if the image or the gradient changes.
 */

const lockLabel = (s) => {
  const m = Math.floor(s / 60), r = s % 60;
  return m > 0 ? `${m}m ${String(r).padStart(2, '0')}s` : `${r}s`;
};

export default function Login() {
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
  // Arriving from an expired or rejected session (see auth/session.js) says
  // why. It's information, not a mistake, so it isn't styled as an error.
  const [notice, setNotice]     = useState(() =>
    new URLSearchParams(window.location.search).get('reason') === 'expired'
      ? 'Your session expired. Sign in again to continue.'
      : ''
  );
  // Seconds left on a server-side account lockout (HTTP 423). Purely a UX
  // affordance — the backend enforces the lock regardless of what this says.
  const [lockedFor, setLockedFor] = useState(0);

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
        saveSession({ token: data.token, role: data.role, city: data.city });
        // Both roles start on the dashboard: it shows what's waiting on them.
        navigate('/dashboard', { replace: true });
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
    }
  };

  // Caps Lock is the usual reason a remembered password "stops working".
  const trackCaps = (e) => setCapsOn(!!e.getModifierState?.('CapsLock'));

  const locked = lockedFor > 0;

  return (
    <div className="login-shell" style={s.shell}>
      <aside className="login-brand" style={{ ...s.brand, backgroundImage: `url(${loginBg})` }}>
        <div className="login-scrim" aria-hidden="true" />
        <div className="login-veil" aria-hidden="true" />
        <div style={s.brandMark}>
          <img src={logo} alt="" style={s.logo} />
          <span style={s.brandName}>Libot <span style={s.brandNameSub}>Admin</span></span>
        </div>
        <div className="login-brand-body" style={s.brandBody}>
          <p style={s.brandHeadline} className="display-type">Spots, reviews and travelers, in one place.</p>
          <p style={s.brandText}>The admin and moderator panel for Libot Bulacan.</p>
        </div>
      </aside>

      <main className="login-main">
        <form className="login-form" style={s.form} onSubmit={handleSubmit} noValidate aria-labelledby="login-title">
          <h1 id="login-title" style={s.title}>Sign in</h1>
          <p style={s.subtitle}>Use the username and password you were given.</p>

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

          <p style={s.help}>Can't sign in? Ask your Libot administrator.</p>
        </form>
      </main>
    </div>
  );
}

const s = {
  shell: { minHeight: '100dvh', background: t.bg },

  // Text on the artwork is white in both themes: it sits on the scrim over a
  // picture, not on a page surface, so it doesn't follow the theme tokens.
  // The teal fill shows only while the image loads.
  brand: {
    position: 'relative', overflow: 'hidden',
    backgroundColor: t.brandSolid,
    backgroundSize: 'cover', backgroundPosition: 'center',
    color: '#FFFFFF',
    padding: 'clamp(22px, 4vw, 48px)',
    display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 32,
  },
  brandMark: { position: 'relative', display: 'flex', alignItems: 'center', gap: 12 },
  logo: { width: 40, height: 40, borderRadius: radius.md, objectFit: 'contain', background: 'transparent' },
  brandName: { fontFamily: fonts.display, fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em', color: '#FFFFFF' },
  brandNameSub: { fontFamily: fonts.sans, fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.86)', marginLeft: 4 },
  brandBody: { position: 'relative', maxWidth: 420 },
  brandHeadline: {
    fontFamily: fonts.display, fontSize: 'clamp(28px, 3.2vw, 40px)', fontWeight: 600,
    lineHeight: 1.15, letterSpacing: '-0.02em', color: '#FFFFFF', margin: 0,
  },
  brandText: { fontSize: 15, lineHeight: 1.5, color: 'rgba(255,255,255,0.86)', marginTop: 14, marginBottom: 0 },

  form: { width: '100%', maxWidth: 380 },

  title:    { ...type.pageTitle, fontSize: 30, color: t.textPrimary, margin: 0 },
  subtitle: { ...type.body, fontSize: 14.5, color: t.textSecondary, marginTop: 6, marginBottom: 26 },

  banner: {
    display: 'flex', alignItems: 'flex-start', gap: 9,
    borderRadius: radius.md, padding: '11px 14px', fontSize: 13.5, lineHeight: 1.45,
    marginBottom: 18, borderWidth: 1, borderStyle: 'solid',
  },
  bannerInfo:  { background: t.infoBg,   color: t.info,   borderColor: 'transparent' },
  bannerError: { background: t.dangerBg, color: t.danger, borderColor: t.dangerBorder },

  field: { marginBottom: 18 },
  label: { display: 'block', fontSize: 13.5, fontWeight: 600, color: t.textPrimary, marginBottom: 7 },
  input: {
    width: '100%', height: 46, padding: '0 14px', boxSizing: 'border-box',
    borderRadius: radius.md, borderWidth: 1, borderStyle: 'solid', borderColor: t.border,
    background: t.cardBg, color: t.textPrimary, fontFamily: 'inherit', fontSize: 15, outline: 'none',
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
  capsHint:   { display: 'flex', alignItems: 'center', gap: 6, margin: '7px 0 0', fontSize: 13, color: t.warning },

  submit: { width: '100%', minHeight: 46, fontSize: 15, marginTop: 6 },
  help: { fontSize: 13, lineHeight: 1.5, color: t.textMuted, textAlign: 'center', marginTop: 18, marginBottom: 0 },
};

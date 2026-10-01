import { useEffect, useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../api/api';
import { saveSession } from '../auth/session';
import { theme as t, radius, fonts, type, shadow } from '../theme';
import { Button } from '../components/Layout';
import Icon from '../components/Icon';
import logo from '../assets/logo.png';
// The mobile app's sign-in background (LibotBulacan/assets/bg.png: Bulacan
// landmarks under the cyan→yellow wash), re-encoded as JPEG — 478 KB → 54 KB.
import loginBg from '../assets/login-bg.jpg';
import './Login.css';

/*
 * Sign-in for admins and moderators.
 *
 * Built from the console's own frame, so signing in already looks like the
 * panel you land in: the teal rail with the emblem in its dark well, LIBOT in
 * tracked capitals and the console name; the app's sign-in artwork (bg.png)
 * framed on the rail the way the church print sits at the foot of the
 * sidebar; the app slogan in the sidebar tagline's italic with its yellow
 * misregistration; and a cream panel with the rail's one oversized top-left
 * corner, holding the form in a dashboard-style card.
 *
 * No text sits on the picture: the slogan is on solid teal (white, ≥ 5:1 in
 * both themes), so the artwork needs no scrim.
 */

const SLOGAN = ['Discover,', 'Explore,', 'Experience', 'Bulacan.'];

// Same dark wash the sidebar uses for its emblem well and chips.
const ON_FRAME_WELL = 'rgba(0,0,0,0.18)';

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
    <div className="signin">
      <aside className="signin-rail" aria-label="Libot">
        {/* The sidebar's brand block, larger. */}
        <div className="signin-brand" style={s.brand}>
          <span className="signin-emblem" style={s.emblem}>
            <img src={logo} alt="" style={s.logo} />
          </span>
          <div className="signin-brand-text" style={s.brandText}>
            <div className="signin-wordmark" style={s.wordmark}>Libot</div>
            <div style={s.console}>Admin &amp; Moderator Console</div>
          </div>
        </div>

        {/* The app's sign-in artwork, framed like the church print at the foot
            of the sidebar. Decorative: the slogan below carries the words. */}
        <div className="signin-art" style={{ backgroundImage: `url(${loginBg})` }} aria-hidden="true" />

        <p className="signin-slogan" style={s.slogan}>
          {SLOGAN.map((line, i) => <span key={line} style={s.sloganLine}>{line}{i < SLOGAN.length - 1 ? ' ' : ''}</span>)}
        </p>
      </aside>

      <main className="signin-panel">
        <form className="signin-card" style={s.card} onSubmit={handleSubmit} noValidate aria-labelledby="login-title">
          <p style={s.eyebrow}>Admins and moderators</p>
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
  // ── Rail (the sidebar's brand block, scaled up) ──
  brand: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 14,
  },
  emblem: {
    display: 'grid', placeItems: 'center', width: 88, height: 88, borderRadius: 28,
    background: ON_FRAME_WELL, boxShadow: 'inset 0 0 0 1px var(--on-brand-solid-soft)', flexShrink: 0,
  },
  logo: { width: 62, height: 62, objectFit: 'contain', borderRadius: 17, display: 'block' },
  brandText: { display: 'flex', flexDirection: 'column', alignItems: 'center' },
  wordmark: {
    fontFamily: fonts.display, color: t.onBrandSolid, fontWeight: 700, fontSize: 32,
    lineHeight: 1, letterSpacing: '0.18em', textTransform: 'uppercase',
    // Tracking also pads the last letter; this re-centres the word.
    paddingLeft: '0.18em',
  },
  // Full white, not onBrandSolidMuted: at 10.5px this needs 4.5:1, and 86%
  // white is 4.2:1 on the dark theme's teal (white: 5.1, light theme 5.9).
  console: {
    marginTop: 8, color: t.onBrandSolid, fontSize: 10.5, fontWeight: 700,
    letterSpacing: '0.24em', textTransform: 'uppercase',
  },
  // The sidebar tagline's type, on teal instead of cream: white carries the
  // contrast (≥ 5:1 on the rail teal in both themes); the yellow pass slips
  // out from under it the way the print's inks are off-register.
  slogan: {
    width: '100%', maxWidth: 400, margin: 0,
    fontFamily: fonts.display, fontStyle: 'italic', fontWeight: 700,
    fontSize: 'clamp(24px, 2.4vw, 32px)', lineHeight: 1.04, letterSpacing: '-0.01em',
    color: t.onBrandSolid, textShadow: `2px 1.6px 0 ${t.accent}`,
  },
  sloganLine: { display: 'block' },

  // ── Panel (a dashboard card) ──
  card: {
    width: '100%', maxWidth: 420, boxSizing: 'border-box',
    background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: radius.xl,
    boxShadow: shadow.sm, padding: 'clamp(22px, 4vw, 36px)',
  },
  eyebrow:  { ...type.label, color: t.textMuted, margin: '0 0 6px' },
  title:    { ...type.pageTitle, fontSize: 30, color: t.textPrimary, margin: 0 },
  subtitle: { ...type.body, fontSize: 14.5, color: t.textSecondary, marginTop: 6, marginBottom: 24 },

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
  capsHint:   { display: 'flex', alignItems: 'center', gap: 6, margin: '7px 0 0', fontSize: 13, color: t.warning },

  submit: { width: '100%', minHeight: 46, fontSize: 15, marginTop: 6 },
  help: { fontSize: 13, lineHeight: 1.5, color: t.textMuted, textAlign: 'center', marginTop: 18, marginBottom: 0 },
};

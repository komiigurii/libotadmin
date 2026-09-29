import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI, spotAPI } from '../api/api';
import { saveSession } from '../auth/session';
import { theme as t, radius, shadow } from '../theme';
import Icon from '../components/Icon';
import logo from '../assets/logo.png';

/*
 * Sign-in for admins and moderators.
 *
 * The background cycles through photographs of the actual spots in the
 * database, heavily blurred. `GET /api/spots` is a public endpoint, so this
 * needs no token — which is just as well, since nobody is signed in yet.
 *
 * Blur is doing real work here, not decoration: these are arbitrary
 * user-supplied photos of wildly varying brightness and busyness, and a sharp
 * one behind a form makes the form unreadable. Blurring plus a fixed scrim
 * flattens all of them to roughly the same tone, so contrast on the card is
 * predictable whichever image is showing.
 */

const SLIDE_MS = 6500;   // how long each photo holds
const FADE_MS  = 1400;   // cross-fade duration

/*
 * Spot photos are uploaded as full-size PNGs — eight of them is ~1.7 MB, which
 * is a lot to spend on a backdrop nobody is meant to look at, on the one page
 * that loads before anything is cached. They're Cloudinary-hosted, so ask for a
 * capped, auto-format copy instead: same eight photos come down as ~0.36 MB,
 * and at 22px of blur the lost detail is invisible.
 *
 * Any URL that isn't a Cloudinary upload is returned untouched.
 */
function backdropUrl(url) {
  return url.includes('/image/upload/')
    ? url.replace('/image/upload/', '/image/upload/f_auto,q_auto:eco,c_limit,w_960/')
    : url;
}

export default function Login() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  // Arriving from an expired or rejected session (see auth/session.js) shows
  // why, instead of an unexplained sign-in screen.
  const [error, setError]       = useState(() =>
    new URLSearchParams(window.location.search).get('reason') === 'expired'
      ? 'Your session expired. Please sign in again.'
      : ''
  );
  const [loading, setLoading]   = useState(false);
  // Seconds left on a server-side account lockout (HTTP 423). Purely a UX
  // affordance — the backend enforces the lock regardless of what this says.
  const [lockedFor, setLockedFor] = useState(0);
  const navigate = useNavigate();

  // ── Background carousel ────────────────────────────────────────────────
  const [slides, setSlides] = useState([]);   // [{ image, name, city }]
  const [index, setIndex]   = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    spotAPI.getAll()
      .then((spots) => {
        if (cancelled) return;
        const candidates = (spots || [])
          .filter((s) => s?.image)
          // Several spot names carry a trailing space from data entry, which
          // would render as "Plaridel Horse Festival , Plaridel".
          .map((s) => ({
            image: backdropUrl(s.image),
            name: (s.name || '').trim(),
            city: (s.city || '').trim(),
          }));

        // Shuffle so the same photo isn't the face of the panel every morning.
        for (let i = candidates.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }

        // Preload rather than trusting the URLs. Spot photos are uploaded by
        // moderators and a dead Cloudinary link would otherwise show up as a
        // blank slide mid-rotation, with no error event to catch (CSS
        // background-image fails silently). Each one appears only once it has
        // actually decoded, so the first good photo shows straight away
        // instead of waiting on the slowest.
        candidates.slice(0, 8).forEach((slide) => {
          const img = new Image();
          img.onload = () => { if (!cancelled) setSlides((prev) => [...prev, slide]); };
          img.src = slide.image;
        });
      })
      .catch(() => { /* no background — the gradient below stands on its own */ });

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (slides.length < 2) return;
    // Someone who has asked the OS to reduce motion should get one still image
    // rather than a slideshow.
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (still) return;

    timerRef.current = setInterval(
      () => setIndex((i) => (i + 1) % slides.length),
      SLIDE_MS
    );
    return () => clearInterval(timerRef.current);
  }, [slides.length]);

  // Tick the lockout down once a second and clear the banner when it expires.
  useEffect(() => {
    if (lockedFor <= 0) return;
    const t = setInterval(() => {
      setLockedFor((s) => {
        if (s <= 1) { setError(''); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [lockedFor > 0]);

  const current = slides[index];

  const lockLabel = (s) => {
    const m = Math.floor(s / 60), r = s % 60;
    return m > 0 ? `${m}m ${String(r).padStart(2, '0')}s` : `${r}s`;
  };

  const handleLogin = async () => {
    if (lockedFor > 0) return;
    if (!email || !password) { setError('Please fill in all fields'); return; }
    try {
      setError('');
      setLoading(true);
      const data = await authAPI.login(email, password);
      if (data.success && data.token) {
        saveSession({ token: data.token, role: data.role, city: data.city });
        navigate(data.role === 'moderator' ? '/spots' : '/mod-requests', { replace: true });
      } else {
        setError(data.message || 'Login failed');
      }
    } catch (err) {
      const body = err?.response?.data;
      // 423 Locked — the account hit the failed-attempt threshold. Start a
      // countdown so the button doesn't just sit there rejecting every press
      // with the same message.
      if (err?.response?.status === 423 && body?.retryAfterSeconds) {
        setLockedFor(body.retryAfterSeconds);
      }
      setError(body?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* Photo layers. All of them stay mounted and cross-fade via opacity —
          swapping a single <img> src would flash white while the next one
          decodes. */}
      <div style={styles.bg} aria-hidden="true">
        {slides.map((s, i) => (
          <div
            key={s.image + i}
            style={{
              ...styles.slide,
              backgroundImage: `url(${s.image})`,
              opacity: i === index ? 1 : 0,
            }}
          />
        ))}
        <div style={styles.scrim} />
      </div>

      <div style={styles.card} className="login-card">
        <div style={styles.logoWrap}>
          <img src={logo} alt="Libot" style={styles.logo} />
        </div>

        <h1 style={styles.title}>Libot Admin</h1>
        <p style={styles.subtitle}>Sign in to manage spots, reviews and travellers</p>

        {error && (
          <div style={styles.error} role="alert">
            <Icon name={lockedFor > 0 ? 'slash' : 'alert-triangle'} size={13} />
            <span>
              {error}
              {lockedFor > 0 && (
                <> {' '}<strong>Try again in {lockLabel(lockedFor)}.</strong></>
              )}
            </span>
          </div>
        )}

        <div style={styles.field}>
          <label style={styles.label}>Username</label>
          <input
            type="email"
            placeholder="admin"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            style={styles.input}
            className="modern-input"
            autoComplete="username"
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Password</label>
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            style={styles.input}
            className="modern-input"
            autoComplete="current-password"
          />
        </div>

        <button
          onClick={handleLogin}
          disabled={loading || lockedFor > 0}
          style={{
            ...styles.btn,
            opacity: loading || lockedFor > 0 ? 0.55 : 1,
            cursor: lockedFor > 0 ? 'not-allowed' : 'pointer',
          }}
          className="modern-btn"
        >
          {lockedFor > 0
            ? `Locked — ${lockLabel(lockedFor)}`
            : loading ? 'Signing in…' : 'Sign In'}
        </button>
      </div>

      {/* Quiet credit for whichever photo is showing. Doubles as a sign the
          background is live data rather than stock imagery. */}
      {current && (
        // Keyed on the photo so the caption re-runs its fade each time the
        // background changes, instead of the text swapping abruptly.
        <div key={current.image} style={styles.caption} className="login-caption">
          <Icon name="map-pin" size={11} />
          <span>{current.name}{current.city ? `, ${current.city}` : ''}</span>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    position: 'relative',
    minHeight: '100vh',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    // Room for the photo caption at the bottom, and enough top/bottom padding
    // that the card never touches the edge on a short window.
    padding: '40px 20px 64px',
    // Shows through before any photo loads, and stays the whole background if
    // the request fails.
    background: `radial-gradient(1200px 700px at 70% 10%, ${t.brandSoft}, transparent 60%), ${t.bg}`,
  },

  // Fixed, not absolute: on a short window the card pushes the page into
  // scrolling, and the backdrop should stay put rather than scroll away.
  // `overflow: hidden` lives here so the scaled-up photo layers are clipped
  // without also clipping the card.
  bg: { position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden' },
  slide: {
    position: 'absolute', inset: 0,
    backgroundSize: 'cover', backgroundPosition: 'center',
    filter: 'blur(22px) saturate(1.15)',
    // Overscan by more than the blur radius, otherwise the soft transparent
    // edge blur leaves at the element bounds shows as a light rim.
    transform: 'scale(1.12)',
    transition: `opacity ${FADE_MS}ms ease-in-out`,
    willChange: 'opacity',
  },
  // Dark wash over the photos so the card's contrast is the same no matter
  // which one is showing. Tinted toward the brand rather than neutral black.
  scrim: {
    position: 'absolute', inset: 0,
    background:
      `linear-gradient(180deg, rgba(14,28,30,0.82) 0%, rgba(14,28,30,0.70) 45%, rgba(12,52,56,0.86) 100%)`,
  },

  card: {
    position: 'relative', zIndex: 1,
    background: 'rgba(23,44,47,0.82)',
    // Frosted panel: the photo behind stays legible as colour and movement
    // without competing with the form.
    backdropFilter: 'blur(18px) saturate(1.2)',
    WebkitBackdropFilter: 'blur(18px) saturate(1.2)',
    borderRadius: radius.xl + 6,
    // Tightens on a phone so the fields aren't squeezed by the padding.
    padding: 'clamp(28px, 7vw, 42px) clamp(22px, 7vw, 44px)',
    width: '100%', maxWidth: 410,
    boxShadow: shadow.lg,
    // Lighter than `t.border`: a flat opaque hairline reads as a seam against
    // a moving photo, where a translucent one catches the light behind it.
    border: '1px solid rgba(234,246,247,0.13)',
  },

  logoWrap:  { display: 'flex', justifyContent: 'center', marginBottom: 18 },
  logo:      { width: 60, height: 60, borderRadius: radius.lg, objectFit: 'contain', boxShadow: shadow.sm },
  title:     { fontSize: 23, fontWeight: 800, color: t.textPrimary, textAlign: 'center', marginBottom: 6, letterSpacing: '-0.02em' },
  subtitle:  { fontSize: 13.5, color: t.textSecondary, textAlign: 'center', marginBottom: 26, lineHeight: 1.45 },

  error: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: radius.md,
    padding: '10px 14px', color: t.danger, fontSize: 13, marginBottom: 16,
  },

  field: { marginBottom: 16 },
  label: { display: 'block', fontSize: 11.5, fontWeight: 700, color: t.textSecondary, marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.06em' },
  input: {
    width: '100%', padding: '12px 14px', borderRadius: radius.md,
    border: `1px solid ${t.border}`, fontSize: 14, color: t.textPrimary,
    outline: 'none', background: 'rgba(12,52,56,0.6)', boxSizing: 'border-box',
  },
  btn: {
    width: '100%', padding: 13, borderRadius: radius.md, border: 'none',
    background: t.accent, color: t.onAccent, fontWeight: 800, fontSize: 15,
    cursor: 'pointer', marginTop: 10, boxShadow: shadow.sm,
  },

  caption: {
    position: 'fixed', zIndex: 1, bottom: 20, left: 0, right: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    color: 'rgba(234,246,247,0.55)', fontSize: 12, fontWeight: 500,
    pointerEvents: 'none',
  },
};

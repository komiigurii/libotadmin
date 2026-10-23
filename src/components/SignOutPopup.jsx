import { useCallback, useEffect, useId, useState } from 'react';
import { theme as t, radius, type } from '../theme';
import { fmtDateTime } from '../utils/format';
import { clockText, useCountdown, SIGN_OUT_TEXT } from '../utils/signOut';
import Icon from './Icon';

/*
 * The pop-up an admin or moderator gets when the super admin starts
 * maintenance or pauses their role (System page). User, 2026-10-23: "it
 * shouldn't go to notification, it should be a popup message, and the logout
 * should have a delay so that the users get notified first."
 *
 * It shows the super admin's message and counts down to the sign-out
 * (components/SessionWatcher.jsx keeps `signOut.at` on this computer's clock
 * and signs the window out when it runs out). "Got it" puts it away; the strip
 * above the page (MaintenanceBanner) keeps counting. It comes back only for a
 * new one, not after a reload.
 */

const SEEN_KEY = 'libot_signout_seen';
const readSeen = () => { try { return sessionStorage.getItem(SEEN_KEY) || ''; } catch { return ''; } };

export default function SignOutPopup({ signOut }) {
  const key = signOut ? `${signOut.code}:${signOut.since || ''}` : '';
  const [seen, setSeen] = useState(readSeen);
  const left = useCountdown(signOut?.at);
  const ids = { title: useId(), body: useId() };
  const open = !!signOut && key !== seen;

  const close = useCallback(() => {
    try { sessionStorage.setItem(SEEN_KEY, key); } catch { /* private window */ }
    setSeen(key);
  }, [key]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;
  const text = SIGN_OUT_TEXT[signOut.code] || SIGN_OUT_TEXT.maintenance;
  // The bar runs from the moment it started down to the sign-out.
  const total = signOut.since ? signOut.at - new Date(signOut.since).getTime() : 0;
  const share = total > 0 && left != null ? Math.min(1, left / total) : 1;
  const done = left === 0;

  return (
    <div className="sa-dialog-backdrop" style={p.backdrop}>
      <div
        className="sa-dialog"
        style={p.card}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={ids.title}
        aria-describedby={ids.body}
      >
        <div style={p.head}>
          <span style={p.icon}><Icon name={text.icon} size={20} weight="bold" /></span>
          <h2 id={ids.title} style={p.title}>{text.title}</h2>
        </div>

        <div id={ids.body} style={p.body}>
          <p style={p.lead}>{text.lead}</p>
          {signOut.message && (
            <blockquote style={p.quote}>
              <span style={p.quoteLabel}>From the super admin</span>
              {signOut.message}
            </blockquote>
          )}

          <div style={p.clock}>
            {/* The ticking number is hidden from screen readers (it would be
                read every second); the sentence under it says when. */}
            <span style={p.digits} aria-hidden="true">{done ? '0:00' : clockText(left)}</span>
            <span style={p.clockLabel}>{done ? 'Signing you out…' : 'until you’re signed out'}</span>
            <div style={p.track} aria-hidden="true">
              <div style={{ ...p.fill, width: `${share * 100}%` }} />
            </div>
          </div>

          <p style={p.note}>
            <span className="visually-hidden">You’ll be signed out at {fmtDateTime(signOut.at)}. </span>
            Save what you’re working on now. You can’t sign in again until
            {signOut.code === 'maintenance' ? ' maintenance is over' : ' the super admin lets your role back in'}.
            {signOut.expectedEndAt && <> Expected back <span className="sa-mono">{fmtDateTime(signOut.expectedEndAt)}</span>.</>}
          </p>
        </div>

        <div style={p.actions}>
          <button type="button" className="modern-btn" style={p.button} onClick={close} autoFocus>Got it</button>
        </div>
      </div>
    </div>
  );
}

const p = {
  // Above the console's own dialogs and menus: this one can't wait.
  backdrop: { zIndex: 2100, alignItems: 'center', padding: 16 },
  card:     { maxWidth: 440, borderTop: `4px solid ${t.warning}` },
  head:     { display: 'flex', alignItems: 'center', gap: 12, padding: '20px 22px 0' },
  icon:     { width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0, background: t.warningBg, color: t.warning },
  title:    { ...type.dialogTitle, fontSize: 26, color: t.textPrimary, margin: 0 },
  body:     { padding: '10px 22px 0' },
  lead:     { fontSize: 15, color: t.textSecondary, lineHeight: 1.45, margin: 0 },
  quote:    {
    margin: '14px 0 0', padding: '10px 14px', borderLeft: `3px solid ${t.warning}`, borderRadius: radius.sm,
    background: t.warningBg, color: t.textPrimary, fontSize: 16, lineHeight: 1.4, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
  },
  quoteLabel: { display: 'block', fontSize: 13, fontWeight: 700, color: t.textSecondary, marginBottom: 2 },
  clock:    { display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '18px 0 4px' },
  digits:   { ...type.dialogTitle, fontSize: 64, lineHeight: 0.9, color: t.textPrimary, fontVariantNumeric: 'tabular-nums', minWidth: '3ch', textAlign: 'center' },
  clockLabel: { fontSize: 14, color: t.textMuted, marginTop: 4 },
  track:    { width: '100%', height: 6, borderRadius: 999, background: t.divider, marginTop: 12, overflow: 'hidden' },
  fill:     { height: '100%', borderRadius: 999, background: t.warning, transition: 'width 1s linear' },
  note:     { fontSize: 14, color: t.textSecondary, lineHeight: 1.45, margin: '14px 0 0' },
  actions:  { display: 'flex', justifyContent: 'flex-end', padding: '18px 22px 20px' },
  button:   {
    minWidth: 120, padding: '10px 18px', borderRadius: radius.md, border: 'none', cursor: 'pointer',
    background: t.accent, color: t.onAccent, fontWeight: 700, fontSize: 15,
  },
};

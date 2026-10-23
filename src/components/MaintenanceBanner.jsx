import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useHeartbeat } from '../auth/heartbeat';
import { isSuperAdmin } from '../auth/roles';
import { theme as t, radius } from '../theme';
import { fmtDateTime } from '../utils/format';
import Icon from './Icon';
import SignOutPopup from './SignOutPopup';
import { clockText, useCountdown, SIGN_OUT_TEXT } from '../utils/signOut';

/*
 * The strip above every page that says what the system is doing (mock defense
 * 2026-10-21: "magkakaroon dapat ng notif ang admin kapag under maintenance"):
 *   - an admin or moderator about to be signed out by maintenance or a pause:
 *     the countdown, under the pop-up that first tells them (SignOutPopup);
 *   - maintenance on, for the super admin: when staff are signed out, and a
 *     reminder to end it (travelers are never affected);
 *   - the newest update notice, which each person can put away.
 * It reads the heartbeat (auth/heartbeat.js), so it appears and disappears on
 * its own: at once with the live connection, or within a minute without it.
 */

const DISMISSED_KEY = 'dismissedNotice';
const readDismissed = () => { try { return localStorage.getItem(DISMISSED_KEY) || ''; } catch { return ''; } };

export default function MaintenanceBanner() {
  const beat = useHeartbeat();
  const [dismissed, setDismissed] = useState(readDismissed);
  const sys = beat?.system;
  const superAdmin = isSuperAdmin();
  const m = sys?.maintenance || {};
  const signOut = sys?.signOut || null;
  // Staff: their own countdown. The super admin: when maintenance signs staff out.
  const left = useCountdown(signOut?.at || (superAdmin && m.on && m.signOutAt ? new Date(m.signOutAt).getTime() : null));
  if (!sys) return null;
  const notice = sys.notice;
  const back = m.expectedEndAt ? ` Expected back ${fmtDateTime(m.expectedEndAt)}.` : '';

  const strips = [];
  if (signOut) {
    const text = SIGN_OUT_TEXT[signOut.code] || SIGN_OUT_TEXT.maintenance;
    strips.push(
      // No live region: the clock would be read out every second. The pop-up
      // is the announcement.
      <div key="signout" style={{ ...b.strip, ...b.warning }}>
        <Icon name={text.icon} size={15} weight="bold" />
        <span>
          <strong>{text.title}.</strong>{' '}
          {left ? <>You’ll be signed out in <span className="sa-mono" style={b.clock}>{clockText(left)}</span>. Save what you’re working on.</> : 'Signing you out…'}
          {signOut.message ? ` “${signOut.message}”` : ''}
        </span>
      </div>,
    );
  }
  if (superAdmin && m.on) {
    strips.push(
      <div key="maintenance" style={{ ...b.strip, ...b.warning }}>
        <Icon name="tool" size={15} weight="bold" />
        <span>
          <strong>Maintenance is on.</strong>{' '}
          {left
            ? <>Admins and moderators are signed out in <span className="sa-mono" style={b.clock}>{clockText(left)}</span>; travelers aren’t affected.</>
            : 'Admins and moderators are signed out until you end it; travelers aren’t affected.'}
          {back}{' '}
          <Link to="/system" style={b.link}>End it on the System page</Link>
        </span>
      </div>,
    );
  }
  if (notice && notice.id !== dismissed) {
    strips.push(
      <div key="notice" role="status" style={{ ...b.strip, ...b.info }}>
        <Icon name={notice.kind === 'scheduled' ? 'clock' : 'check-circle'} size={15} weight="bold" />
        <span style={{ flex: 1 }}>
          <strong>{notice.kind === 'scheduled' ? `Update coming ${fmtDateTime(notice.at)}: ` : 'Update done: '}{notice.title}.</strong>
          {notice.message ? ` ${notice.message}` : ''}
        </span>
        <button
          type="button"
          style={b.close}
          aria-label="Put this notice away"
          onClick={() => { try { localStorage.setItem(DISMISSED_KEY, notice.id); } catch { /* private window */ } setDismissed(notice.id); }}
        >
          <Icon name="x" size={14} />
        </button>
      </div>,
    );
  }
  const popup = signOut && <SignOutPopup signOut={signOut} />;
  if (!strips.length) return popup || null;
  // `admin-banner`: App.css narrows the gutter with the page's.
  return <>{popup}<div className="admin-banner" style={b.wrap}>{strips}</div></>;
}

const b = {
  wrap:    { display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 32px 0', maxWidth: 1400, margin: '0 auto', boxSizing: 'border-box', width: '100%' },
  strip:   { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderRadius: radius.md, fontSize: 13.5, lineHeight: 1.45, borderWidth: 1, borderStyle: 'solid' },
  warning: { background: t.warningBg, color: t.textPrimary, borderColor: t.warning },
  info:    { background: t.infoBg, color: t.textPrimary, borderColor: 'transparent' },
  link:    { color: t.brand, fontWeight: 700 },
  clock:   { fontWeight: 700, color: t.textPrimary },
  close:   { marginLeft: 'auto', background: 'none', border: 'none', color: t.textSecondary, cursor: 'pointer', padding: 2, display: 'flex' },
};

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useHeartbeat } from '../auth/heartbeat';
import { isSuperAdmin } from '../auth/roles';
import { theme as t, radius } from '../theme';
import { fmtDateTime } from '../utils/format';
import Icon from './Icon';

/*
 * The strip above every page that says what the system is doing (mock defense
 * 2026-10-21: "magkakaroon dapat ng notif ang admin kapag under maintenance"):
 *   - maintenance on: staff can look but not save; the super admin is reminded
 *     that travelers are locked out until it's ended;
 *   - this role paused by the super admin;
 *   - the newest update notice, which each person can put away.
 * It reads the heartbeat (auth/heartbeat.js), so it appears and disappears on
 * its own within a minute, or at once when the window comes back into view.
 */

const DISMISSED_KEY = 'dismissedNotice';
const readDismissed = () => { try { return localStorage.getItem(DISMISSED_KEY) || ''; } catch { return ''; } };

export default function MaintenanceBanner() {
  const beat = useHeartbeat();
  const [dismissed, setDismissed] = useState(readDismissed);
  const sys = beat?.system;
  if (!sys) return null;
  const superAdmin = isSuperAdmin();
  const m = sys.maintenance || {};
  const notice = sys.notice;
  const back = m.expectedEndAt ? ` Expected back ${fmtDateTime(m.expectedEndAt)}.` : '';

  const strips = [];
  if (sys.restricted) {
    strips.push(
      <div key="restricted" role="alert" style={{ ...b.strip, ...b.warning }}>
        <Icon name="pause" size={15} weight="bold" />
        <span><strong>Your access is paused.</strong> The super admin paused the console for your role for now. You’ll be told in the bell when it’s back.</span>
      </div>,
    );
  }
  if (m.on) {
    strips.push(
      <div key="maintenance" role="status" style={{ ...b.strip, ...b.warning }}>
        <Icon name="tool" size={15} weight="bold" />
        {superAdmin ? (
          <span>
            <strong>Maintenance is on.</strong> Travelers can’t use the app and staff can’t save.{back}{' '}
            <Link to="/system" style={b.link}>End it on the System page</Link>
          </span>
        ) : (
          <span>
            <strong>The system is under maintenance.</strong> You can look around, but changes can’t be saved until it ends.{back}
            {m.message ? ` “${m.message}”` : ''}
          </span>
        )}
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
  if (!strips.length) return null;
  // `admin-banner`: App.css narrows the gutter with the page's.
  return <div className="admin-banner" style={b.wrap}>{strips}</div>;
}

const b = {
  wrap:    { display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 32px 0', maxWidth: 1400, margin: '0 auto', boxSizing: 'border-box', width: '100%' },
  strip:   { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderRadius: radius.md, fontSize: 13.5, lineHeight: 1.45, borderWidth: 1, borderStyle: 'solid' },
  warning: { background: t.warningBg, color: t.textPrimary, borderColor: t.warning },
  info:    { background: t.infoBg, color: t.textPrimary, borderColor: 'transparent' },
  link:    { color: t.brand, fontWeight: 700 },
  close:   { marginLeft: 'auto', background: 'none', border: 'none', color: t.textSecondary, cursor: 'pointer', padding: 2, display: 'flex' },
};

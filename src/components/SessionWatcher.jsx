import { useEffect } from 'react';
import { authAPI } from '../api/api';
import { classifyTokenChange, getToken, saveSession, SESSION_CHECK_EVENT } from '../auth/session';
import { publishHeartbeat } from '../auth/heartbeat';
import { connectLive, disconnectLive, subscribeLive } from '../api/live';

/*
 * Keeps an open window honest about its session (mock defense 2026-10-21:
 * "signing in somewhere else should sign the old session out").
 *
 * The server ends every other session of an account when it signs in again,
 * when its password changes or is reset, and when it's deactivated — but a
 * window only hears about it on its next request. So:
 *   - every 45 s while the window is visible, and whenever it comes back into
 *     view, it asks /api/auth/admin-session. A 401 there goes through the API's
 *     interceptor, which signs out with the server's reason (signedInElsewhere,
 *     passwordReset, …) for the sign-in page to show. The same answer brings
 *     the role and town up to date when the super admin changes them, and
 *     carries the bell's count (auth/heartbeat.js);
 *   - tabs of the same browser share one stored session. When another tab
 *     signs out, this one goes to sign-in too; when another tab signs in
 *     (perhaps as a different account), this one reloads to follow it, so it
 *     never shows one account's pages with another's token;
 *   - it holds the live connection (api/live.js) while signed in, and asks at
 *     once when the server says the session ended or the bell, tickets, the
 *     approval queue or the system's state changed. The 45 s check stays, for
 *     a network that blocks the live connection.
 */
const EVERY_MS = 45_000;

export default function SessionWatcher() {
  useEffect(() => {
    let stopped = false;

    const check = async () => {
      if (stopped || document.visibilityState !== 'visible' || !getToken()) return;
      try {
        const s = await authAPI.session();
        publishHeartbeat(s);
        const role = localStorage.getItem('role');
        const city = localStorage.getItem('city') || '';
        if (s.mustChangePassword && window.location.pathname !== '/set-password') {
          localStorage.setItem('mustChangePassword', '1');
          window.location.assign('/set-password');
          return;
        }
        if (s.role !== role || (s.city || '') !== city) {
          saveSession({ token: getToken(), role: s.role, city: s.city, mustChangePassword: s.mustChangePassword });
          window.location.reload();
        }
      } catch {
        // A 401 is handled by the interceptor; offline or a sleeping server
        // just waits for the next check.
      }
    };

    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    const onStorage = (e) => {
      if (e.key !== 'token') return;
      const change = classifyTokenChange(e.oldValue, e.newValue);
      if (change === 'signedOut') window.location.assign('/login?reason=signedOut');
      if (change === 'replaced') window.location.reload();
    };

    // Once now as well, so the bell's count is there when the page opens.
    check();
    const timer = setInterval(check, EVERY_MS);
    connectLive();
    const unsubscribe = subscribeLive(['session', 'notifications', 'tickets', 'approvals', 'system'], check);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('storage', onStorage);
    window.addEventListener(SESSION_CHECK_EVENT, check);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(SESSION_CHECK_EVENT, check);
      unsubscribe();
      disconnectLive();
    };
  }, []);

  return null;
}

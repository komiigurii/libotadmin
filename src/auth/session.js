/*
 * The admin session: the token from /api/auth/admin-login plus the role and
 * city that come with it.
 *
 * Tokens now expire after 12 hours (they used to last a week). Before this,
 * nothing noticed an expired token: the route guard only checked that one was
 * stored, so an expired session left the panel open with every request failing.
 * Now an expired or rejected token ends the session and sends the admin to the
 * sign-in page with an explanation.
 *
 * One session per account (mock defense 2026-10-21): every sign-in ends the
 * account's other sessions on the server, and the server says why
 * (signedInElsewhere, passwordReset, …); that reason goes to the sign-in page.
 * Tabs of the same browser share this storage, so they share one session —
 * components/SessionWatcher.jsx keeps them in step.
 */

const KEYS = ['token', 'role', 'city', 'mustChangePassword'];

export const getToken = () => localStorage.getItem('token');

export function saveSession({ token, role, city, mustChangePassword }) {
  localStorage.setItem('token', token);
  // 'superadmin', 'admin' or 'moderator', as the server sent it.
  localStorage.setItem('role', role || 'admin');
  localStorage.setItem('city', city || '');
  if (mustChangePassword) localStorage.setItem('mustChangePassword', '1');
  else localStorage.removeItem('mustChangePassword');
}

/** True while the account still has to replace its temporary password. */
export const mustChangePassword = () => localStorage.getItem('mustChangePassword') === '1';

export function clearSession() {
  KEYS.forEach((k) => localStorage.removeItem(k));
}

/** When the token expires, in ms since epoch — or null if it can't be read. */
export function tokenExpiry(token) {
  if (typeof token !== 'string') return null;
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='));
    const { exp } = JSON.parse(json);
    return Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * True when the token is missing, unreadable, or past its expiry (with a
 * 30-second margin so a request doesn't leave just before the token lapses).
 * The server still decides; this only avoids sending requests that will fail.
 */
export function isExpired(token, now = Date.now()) {
  const exp = tokenExpiry(token);
  return exp === null || exp - 30_000 <= now;
}

export const hasValidSession = () => {
  const token = getToken();
  return Boolean(token) && !isExpired(token);
};

// Fired to make components/SessionWatcher.jsx ask the server now.
export const SESSION_CHECK_EVENT = 'libot:session-check';

// The reasons the server gives for a session that ended; anything else reads
// as "expired".
export const END_REASONS = ['expired', 'signedInElsewhere', 'signedOut', 'passwordChanged', 'passwordReset', 'deactivated'];

let ending = false;

/** Clears the session and goes to sign-in, saying why. Safe to call repeatedly. */
export function endSession(reason = 'expired') {
  clearSession();
  if (ending) return;
  ending = true;
  const why = END_REASONS.includes(reason) ? reason : 'expired';
  window.location.assign(`/login?reason=${encodeURIComponent(why)}`);
}

/*
 * What another tab's change to the stored token means for this one:
 *   'signedOut' — the token is gone (Sign out, or a session that ended there);
 *   'replaced'  — a different token (someone signed in there, maybe as another
 *                 account): this tab must reload to follow it;
 *   null        — nothing to do.
 */
export function classifyTokenChange(oldToken, newToken) {
  if (oldToken === newToken) return null;
  if (!newToken) return oldToken ? 'signedOut' : null;
  return oldToken ? 'replaced' : null;
}

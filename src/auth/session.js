/*
 * The admin session: the token from /api/auth/admin-login plus the role and
 * city that come with it.
 *
 * Tokens now expire after 12 hours (they used to last a week). Before this,
 * nothing noticed an expired token: the route guard only checked that one was
 * stored, so an expired session left the panel open with every request failing.
 * Now an expired or rejected token ends the session and sends the admin to the
 * sign-in page with an explanation.
 */

const KEYS = ['token', 'role', 'city'];

export const getToken = () => localStorage.getItem('token');

export function saveSession({ token, role, city }) {
  localStorage.setItem('token', token);
  localStorage.setItem('role', role || 'admin');
  localStorage.setItem('city', city || '');
}

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

let ending = false;

/** Clears the session and goes to sign-in, saying why. Safe to call repeatedly. */
export function endSession(reason = 'expired') {
  clearSession();
  if (ending) return;
  ending = true;
  window.location.assign(`/login?reason=${encodeURIComponent(reason)}`);
}

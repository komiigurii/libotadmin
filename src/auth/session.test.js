import { describe, it, expect, beforeEach, vi } from 'vitest';
import { tokenExpiry, isExpired, hasValidSession, saveSession, clearSession, endSession } from './session';

// A JWT-shaped token with the given payload (the signature is irrelevant here:
// the panel only reads the expiry; the server verifies).
const b64url = (obj) => btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const token = (payload) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.sig`;
const inSeconds = (s) => Math.floor(Date.now() / 1000) + s;

beforeEach(() => {
  const store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  });
  vi.stubGlobal('window', { location: { assign: vi.fn() } });
});

describe('tokenExpiry', () => {
  it('reads exp from the payload', () => {
    expect(tokenExpiry(token({ exp: 1_800_000_000 }))).toBe(1_800_000_000_000);
  });

  it('handles base64url characters and missing padding', () => {
    // Long enough payloads produce "-" / "_" and need re-padding to decode.
    const t = token({ exp: 1_800_000_000, email: 'moderator+ops@test.local', name: '???>>>' });
    expect(tokenExpiry(t)).toBe(1_800_000_000_000);
  });

  it('returns null for anything that is not a readable token', () => {
    expect(tokenExpiry(null)).toBeNull();
    expect(tokenExpiry('not-a-jwt')).toBeNull();
    expect(tokenExpiry('a.%%%.c')).toBeNull();
    expect(tokenExpiry(token({ sub: 'no-exp' }))).toBeNull();
  });
});

describe('isExpired', () => {
  it('is false for a token with hours left', () => {
    expect(isExpired(token({ exp: inSeconds(12 * 3600) }))).toBe(false);
  });

  it('is true once the token has lapsed, or within 30 s of lapsing', () => {
    expect(isExpired(token({ exp: inSeconds(-1) }))).toBe(true);
    expect(isExpired(token({ exp: inSeconds(20) }))).toBe(true);
  });

  it('treats an unreadable token as expired', () => {
    expect(isExpired('garbage')).toBe(true);
  });
});

describe('session storage', () => {
  it('a saved, unexpired session is valid; clearing removes all of it', () => {
    saveSession({ token: token({ exp: inSeconds(3600) }), role: 'moderator', city: 'Malolos' });
    expect(hasValidSession()).toBe(true);
    expect(localStorage.getItem('city')).toBe('Malolos');

    clearSession();
    expect(hasValidSession()).toBe(false);
    expect(localStorage.getItem('role')).toBeNull();
    expect(localStorage.getItem('city')).toBeNull();
  });

  it('an expired session is not valid', () => {
    saveSession({ token: token({ exp: inSeconds(-60) }), role: 'admin' });
    expect(hasValidSession()).toBe(false);
  });

  it('endSession clears storage and sends the admin to sign-in with a reason', () => {
    saveSession({ token: token({ exp: inSeconds(3600) }), role: 'admin' });
    endSession('expired');
    expect(localStorage.getItem('token')).toBeNull();
    expect(window.location.assign).toHaveBeenCalledWith('/login?reason=expired');
  });
});

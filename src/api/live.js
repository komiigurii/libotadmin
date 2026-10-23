import { useEffect, useRef, useState } from 'react';
import api from './api';
import { getToken, SESSION_CHECK_EVENT } from '../auth/session';

/*
 * Live updates (2026-10-23: "superadmin, admin, moderator, mobile app should
 * be realtime").
 *
 * One Socket.IO connection to the backend (its utils/live.js) while signed in.
 * It carries no data, only which kind of thing changed — "spots", "tickets",
 * "notifications"… — and every page showing that kind loads it again through
 * the API, quietly: no spinner, and a failed reload keeps what's on screen.
 * So what a role may see is still decided by the API, as before.
 *
 *   useLive(['spots', 'approvals'], () => load({ quiet: true }));
 *   const tick = useLiveTick(['activity']); // for an effect's dependencies
 *
 * A burst of changes loads once, and a page that asks for a lot at a time
 * (the dashboards) can ask for a gap between loads: { gap: 5000 }. A window
 * in the background loads when it comes back into view, not before. After
 * the connection drops and returns, every page on screen loads once, for
 * whatever it missed.
 *
 * components/SessionWatcher.jsx opens and closes the connection, and listens
 * for the session ending, the bell, tickets, the approval queue and the
 * system's state (the heartbeat's figures).
 */

const DELAY_MS = 300;
// After the server turned the session away, the session check says why (and
// signs out); if the session is fine after all, try again this much later.
const RETRY_MS = 15_000;

const listeners = new Set();
let socket = null;
let wanted = false;
let retryTimer = null;

function poke(l) {
  if (document.visibilityState !== 'visible') { l.stale = true; return; }
  if (l.timer) return;
  const wait = Math.max(DELAY_MS, l.gap - (Date.now() - l.ranAt));
  l.timer = setTimeout(() => {
    l.timer = null;
    l.stale = false;
    l.ranAt = Date.now();
    l.run();
  }, wait);
}

// `topics` null: everything.
function deliver(topics) {
  listeners.forEach((l) => { if (!topics || topics.some((topic) => l.topics.includes(topic))) poke(l); });
}

function onVisible() {
  if (document.visibilityState === 'visible') listeners.forEach((l) => { if (l.stale) poke(l); });
}

/** Calls `run` when any of `topics` changes, `gap` ms apart at most. Returns the unsubscribe. */
export function subscribeLive(topics, run, { gap = 0 } = {}) {
  const l = { topics, run, gap, ranAt: 0, timer: null, stale: false };
  listeners.add(l);
  return () => { listeners.delete(l); clearTimeout(l.timer); };
}

// Socket.IO is loaded on the first connect, so the sign-in page doesn't carry it.
export async function connectLive() {
  if (wanted) return;
  wanted = true;
  const { io } = await import('socket.io-client');
  if (!wanted || socket) return; // signed out while it loaded
  let opened = false;
  socket = io(api.defaults.baseURL, {
    transports: ['websocket'],
    // A function, so a reconnect sends the token held then (a password change
    // replaces it).
    auth: (send) => send({ client: 'panel', token: getToken() }),
    reconnectionDelayMax: 30_000,
  });
  socket.on('connect', () => {
    if (opened) deliver(null);
    opened = true;
  });
  socket.on('changed', (msg) => deliver(Array.isArray(msg?.topics) ? msg.topics : []));
  // Not active = the server refused the session (signed in elsewhere,
  // deactivated…). A dropped line stays active and Socket.IO retries by itself.
  socket.on('connect_error', () => {
    if (!socket || socket.active) return;
    window.dispatchEvent(new Event(SESSION_CHECK_EVENT));
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => socket?.connect(), RETRY_MS);
  });
  document.addEventListener('visibilitychange', onVisible);
}

export function disconnectLive() {
  wanted = false;
  clearTimeout(retryTimer);
  socket?.disconnect();
  socket = null;
  document.removeEventListener('visibilitychange', onVisible);
}

/** Runs `onChange` (this render's) when any of `topics` changes. */
export function useLive(topics, onChange, { gap = 0 } = {}) {
  const latest = useRef(onChange);
  useEffect(() => { latest.current = onChange; });
  const key = topics.join(' ');
  useEffect(() => subscribeLive(key.split(' '), () => latest.current(), { gap }), [key, gap]);
}

/** A number that goes up when any of `topics` changes. */
export function useLiveTick(topics) {
  const [tick, setTick] = useState(0);
  useLive(topics, () => setTick((n) => n + 1));
  return tick;
}

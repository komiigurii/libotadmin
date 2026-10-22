import { useEffect, useState } from 'react';
import { systemAPI } from '../api/api';

/*
 * The server's health, asked every 30 s while the super admin's dashboard is
 * open and the window is in view (GET /api/system/tools/health). Each answer
 * is kept for this browser session, so the database ping chart keeps its
 * history when you leave the dashboard and come back. Nothing is stored or
 * sent anywhere: these are the answers this tab got.
 */
export const EVERY_MS = 30_000;
const KEEP = 60; // half an hour of answers

let samples = [];     // { at, pingMs, ok }
let latest = null;    // the last full answer
let error = '';
const subscribers = new Set();
const publish = () => subscribers.forEach((fn) => fn({ samples, latest, error }));

async function ask() {
  try {
    const { health } = await systemAPI.health();
    latest = { ...health, at: Date.now() };
    error = '';
    samples = [...samples, { at: latest.at, pingMs: health.db?.pingMs ?? null, ok: !!health.db?.connected }].slice(-KEEP);
  } catch {
    error = 'Couldn’t reach the server.';
    samples = [...samples, { at: Date.now(), pingMs: null, ok: false }].slice(-KEEP);
  }
  publish();
}

export function useHealthSamples() {
  const [state, setState] = useState({ samples, latest, error });
  useEffect(() => {
    subscribers.add(setState);
    // Ask now unless the last answer is fresh.
    if (!latest || Date.now() - latest.at > EVERY_MS / 2) ask();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') ask(); }, EVERY_MS);
    return () => { subscribers.delete(setState); clearInterval(timer); };
  }, []);
  return { ...state, refresh: ask };
}

/** How a database ping reads: a word and a status tone, never colour alone. */
export function pingVerdict(sample) {
  if (!sample) return { word: 'Checking', tone: 'neutral', icon: 'clock' };
  if (!sample.ok || sample.pingMs == null) return { word: 'Not answering', tone: 'danger', icon: 'alert-circle' };
  if (sample.pingMs < 200) return { word: 'Quick', tone: 'success', icon: 'check' };
  if (sample.pingMs < 500) return { word: 'Slow', tone: 'warning', icon: 'clock' };
  return { word: 'Very slow', tone: 'danger', icon: 'alert-triangle' };
}

export function uptimeText(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d ? `${d}d ${h}h ${m}m` : h ? `${h}h ${m}m` : `${m}m`;
}

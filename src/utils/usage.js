import { statsAPI } from '../api/api';

/*
 * GET /api/admin/stats/usage, shared for a few seconds: the super admin's
 * dashboard reads the same 30 days for its stat strip as the usage charts
 * under it, so the two ask once between them.
 */
const FRESH_MS = 20_000;
const cache = new Map(); // days -> { at, promise }

/**
 * A live update says the figures changed: drops the copies older than a
 * second. The dashboard and its charts both hear the same update; whichever
 * asks first, the other shares its answer.
 */
export function forgetUsage(now = Date.now()) {
  for (const [days, hit] of cache) if (now - hit.at > 1000) cache.delete(days);
}

export function loadUsage(days = 30) {
  const hit = cache.get(days);
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.promise;
  const promise = statsAPI.usage(days);
  promise.catch(() => cache.delete(days));
  cache.set(days, { at: Date.now(), promise });
  return promise;
}

import { statsAPI } from '../api/api';

/*
 * GET /api/admin/stats/usage, shared for a few seconds: the super admin's
 * dashboard reads the same 30 days for its stat strip as the usage charts
 * under it, so the two ask once between them.
 */
const FRESH_MS = 20_000;
const cache = new Map(); // days -> { at, promise }

export function loadUsage(days = 30) {
  const hit = cache.get(days);
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.promise;
  const promise = statsAPI.usage(days);
  promise.catch(() => cache.delete(days));
  cache.set(days, { at: Date.now(), promise });
  return promise;
}

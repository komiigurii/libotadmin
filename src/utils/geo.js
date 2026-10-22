/*
 * The panel's copy of LibotBackend utils/geo.js and the edge rule of
 * utils/municipalBoundaries.js: whether a pin is in a town's outline (or within
 * 50 m of its edge, the outlines being simplified to about 25 m). The server
 * checks the same way, so the map and the server agree.
 * Rings are arrays of [lng, lat].
 */

export const EDGE_BUFFER_M = 50;

export function inRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function inShape(lng, lat, { outer = [], inner = [] }) {
  return outer.some((r) => inRing(lng, lat, r)) && !inner.some((r) => inRing(lng, lat, r));
}

export function distanceToEdgeM(lng, lat, rings) {
  const kx = 111_320 * Math.cos((lat * Math.PI) / 180);
  const ky = 110_540;
  let best = Infinity;
  for (const ring of rings) {
    for (let i = 0; i + 1 < ring.length; i++) {
      const ax = (ring[i][0] - lng) * kx;
      const ay = (ring[i][1] - lat) * ky;
      const bx = (ring[i + 1][0] - lng) * kx;
      const by = (ring[i + 1][1] - lat) * ky;
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
  }
  return best;
}

/** True when there's no outline (nothing to hold to) or the point is in it. */
export function insideBoundary(boundary, lat, lng) {
  if (!boundary?.outer?.length) return true;
  // An empty field is no pin, not 0.
  const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
  const la = num(lat);
  const ln = num(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return true;
  if (inShape(ln, la, boundary)) return true;
  return distanceToEdgeM(ln, la, [...boundary.outer, ...(boundary.inner || [])]) <= EDGE_BUFFER_M;
}

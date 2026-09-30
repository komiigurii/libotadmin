/*
 * Data and pure helpers behind components/ChangeDiff.jsx, kept out of the
 * component file so it only exports components (React Fast Refresh needs
 * that). Used by the Approval Queue and My Submissions.
 */

export const FIELD_LABELS = {
  name: 'Name', location: 'Location', category: 'Category', description: 'Description',
  history: 'History', recommendations: 'Recommendations', visitingHours: 'Visiting hours',
  entranceFee: 'Entrance fee', image: 'Image', modelUrl: '3D display model', AR3DModelURL: 'AR model',
  Badge: 'Badge', City: 'City', city: 'City', coordinates: 'Coordinates', modelsCoordinates: 'AR positions',
  trivia: 'AR trivia',
};

export const MISSION_FIELD_LABELS = {
  locationName: 'Restaurant name',
  image:        'Restaurant photo',
  locationInfo: 'Restaurant info',
  coordinates:  'Coordinates',
  radiusMeters: 'Radius (m)',
};

// Bookkeeping keys on a pendingChange that aren't spot fields.
export const META_KEYS = new Set(['submittedBy', 'submittedByName', 'submittedAt', 'status']);

export const LONG_FIELDS = new Set(['description', 'history', 'recommendations', 'trivia', 'locationInfo']);
export const THUMB_FIELDS = new Set(['image', 'Badge']);
export const FILE_LINK_FIELDS = new Set(['modelUrl', 'AR3DModelURL']);

function fmtCoord(c) {
  if (!c || c.lat == null || c.lng == null) return '—';
  return `${Number(c.lat).toFixed(6)}, ${Number(c.lng).toFixed(6)}`;
}

export function fmtVal(key, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (key === 'coordinates') return fmtCoord(v);
  if (key === 'modelsCoordinates') {
    if (!Array.isArray(v) || !v.length) return '—';
    return v.map((m, i) => `#${i + 1}  ${fmtCoord(m)}`).join('\n');
  }
  // Trivia entries are full sentences with their own commas — comma-joining
  // them would blur where one fact ends and the next begins.
  if (key === 'trivia' && Array.isArray(v)) {
    return v.length ? v.map((line, i) => `${i + 1}. ${line}`).join('\n') : '—';
  }
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Labels of the fields a spot's pendingChange actually changes. */
export function changedFieldLabels(spot) {
  if (!spot?.pendingChange) return [];
  return Object.entries(spot.pendingChange)
    .filter(([k]) => !META_KEYS.has(k))
    .filter(([k, newVal]) => fmtVal(k, spot[k]) !== fmtVal(k, newVal))
    .map(([k]) => (FIELD_LABELS[k] || k).toLowerCase());
}

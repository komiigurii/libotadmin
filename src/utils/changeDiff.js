/*
 * Data and pure helpers behind components/ChangeDiff.jsx, kept out of the
 * component file so it only exports components (React Fast Refresh needs
 * that). Used by the Approval Queue and My Submissions.
 */
import { formatRun } from './festivalDates';

// A spot has no `location`, `history` or `recommendations` any more (removed
// 2026-10-04; food recommendations are the spot's Food mission).
export const FIELD_LABELS = {
  name: 'Name', category: 'Category', description: 'Description', visitingHours: 'Visiting hours',
  entranceFee: 'Entrance fee', image: 'Image', modelUrl: '3D display model', AR3DModelURL: 'AR model',
  Badge: 'Badge', city: 'City', coordinates: 'Coordinates', modelsCoordinates: 'AR positions',
  trivia: 'AR trivia', arrivalRadiusMeters: 'Arrival radius', nearbyRadiusMeters: 'Nearby alert radius',
  festivalDates: 'Festival dates',
};

// A spot that never set its radii uses these (components/SpotForm.jsx,
// LibotBackend utils/spotRadii.js), so "not set" reads as the real number.
const RADIUS_DEFAULTS = { arrivalRadiusMeters: 50, nearbyRadiusMeters: 500 };

export const MISSION_FIELD_LABELS = {
  locationName: 'Restaurant name',
  image:        'Restaurant photo',
  locationInfo: 'Restaurant info',
  coordinates:  'Coordinates',
  radiusMeters: 'Radius (m)',
};

// Bookkeeping keys on a pendingChange that aren't spot fields.
export const META_KEYS = new Set(['submittedBy', 'submittedByName', 'submittedAt', 'status']);

export const LONG_FIELDS = new Set(['description', 'trivia', 'locationInfo', 'modelsCoordinates', 'festivalDates']);
export const THUMB_FIELDS = new Set(['image', 'Badge']);
export const FILE_LINK_FIELDS = new Set(['modelUrl', 'AR3DModelURL']);

function fmtCoord(c) {
  if (!c || c.lat == null || c.lng == null) return '—';
  return `${Number(c.lat).toFixed(6)}, ${Number(c.lng).toFixed(6)}`;
}

export function fmtVal(key, v) {
  if (key in RADIUS_DEFAULTS) {
    return v === null || v === undefined || v === '' ? `${RADIUS_DEFAULTS[key]} m (default)` : `${v} m`;
  }
  if (v === null || v === undefined || v === '') return '—';
  if (key === 'coordinates') return fmtCoord(v);
  if (key === 'modelsCoordinates') {
    if (!Array.isArray(v) || !v.length) return '—';
    // Each position's name and fact too (since 2026-10-21), so a changed fact
    // reads as a change.
    return v.map((m, i) => {
      const name = m.label && m.label !== 'Model' ? `  ${m.label}` : '';
      const fact = m.trivia ? `\n    “${m.trivia}”` : '';
      return `#${i + 1}${name}  ${fmtCoord(m)}${fact}`;
    }).join('\n');
  }
  // Trivia entries are full sentences with their own commas — comma-joining
  // them would blur where one fact ends and the next begins.
  if (key === 'trivia' && Array.isArray(v)) {
    return v.length ? v.map((line, i) => `${i + 1}. ${line}`).join('\n') : '—';
  }
  if (key === 'festivalDates' && Array.isArray(v)) {
    return v.length
      ? v.map((r) => `${formatRun({ start: r.start, end: r.end }, { year: !r.everyYear })}${r.everyYear ? ', every year' : ''}`).join('\n')
      : '—';
  }
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Labels of the fields a spot's pendingChange actually changes. */
export function changedFieldLabels(record, labelMap = FIELD_LABELS) {
  if (!record?.pendingChange) return [];
  return Object.entries(record.pendingChange)
    .filter(([k]) => !META_KEYS.has(k))
    .filter(([k, newVal]) => fmtVal(k, record[k]) !== fmtVal(k, newVal))
    .map(([k]) => (labelMap[k] || k).toLowerCase());
}

/**
 * A change-request history row (backend models/ChangeRequest) in the shape
 * ChangeList expects: the old values on the record, the new ones under
 * pendingChange.
 */
export const recordFromRequest = (req) => ({ ...(req.previous || {}), pendingChange: req.changes || {} });

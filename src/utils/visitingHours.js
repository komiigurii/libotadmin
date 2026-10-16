/*
 * Visiting hours, built from pickers instead of typed (QA 2026-10-16: start
 * and end time dropdowns, with the recurring part kept separate).
 *
 * A spot's `visitingHours` stays ONE line of text, which is what the app shows
 * and what the backend stores, e.g. "8:00 a.m. to 4:00 p.m., Tuesday to
 * Sunday". This file turns the form's choices into that line (formatHours) and
 * reads an existing line back into choices (parseHours), so editing a spot
 * opens on its current hours. Three kinds:
 *
 *   weekly   repeats every week: which days, and one or two time ranges
 *   anytime  open any time, any day
 *   dates    anything else, typed: festivals ("Celebrated on June 23"),
 *            seasons, and any old line the parser can't read
 */

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const ANYTIME_TEXT = 'Open anytime, any day';

/** Every half hour of the day as minutes after midnight: 0, 30 … 1410. */
export const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => i * 30);

/** 480 → "8:00 a.m.", 750 → "12:30 p.m.", 0 → "12:00 a.m." */
export function formatTime(minutes) {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'a.m.' : 'p.m.'}`;
}

/** The chosen days as words: "Everyday", "Tuesday to Sunday", "Every Sunday", "Monday, Wednesday and Friday". */
export function formatDays(days) {
  const idx = DAYS.map((d, i) => (days.includes(d) ? i : -1)).filter((i) => i >= 0);
  if (idx.length === 0) return '';
  if (idx.length === 7) return 'Everyday';
  if (idx.length === 1) return `Every ${DAYS[idx[0]]}`;
  const consecutive = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  if (consecutive) return `${DAYS[idx[0]]} to ${DAYS[idx[idx.length - 1]]}`;
  const names = idx.map((i) => DAYS[i]);
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * The form's choices as the line the app shows, or '' while incomplete (no
 * day picked, a range that ends before it starts, an empty dates line), so the
 * form's "visiting hours is required" check catches it.
 */
export function formatHours({ kind, days = [], ranges = [], text = '' }) {
  if (kind === 'anytime') return ANYTIME_TEXT;
  if (kind === 'dates') return text.trim();
  const dayText = formatDays(days);
  if (!dayText || ranges.length === 0) return '';
  if (ranges.some((r) => !(r.end > r.start))) return '';
  const times = ranges.map((r) => `${formatTime(r.start)} to ${formatTime(r.end)}`).join(' and ');
  return `${times}, ${dayText}`;
}

// "8:00 a.m." / "8 am" / "5:00 p.m" → minutes after midnight.
const TIME_RE = /(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?/gi;
const toMinutes = (h, m, ap) => ((Number(h) % 12) + (ap.toLowerCase() === 'p' ? 12 : 0)) * 60 + Number(m || 0);

function parseDays(part) {
  const p = part.toLowerCase().replace(/\./g, '').trim();
  if (!p) return null;
  if (/every\s*day|everyday|daily|all week/.test(p)) return [...DAYS];
  if (/week\s*days?/.test(p)) return DAYS.slice(0, 5);
  if (/week\s*ends?/.test(p)) return DAYS.slice(5);
  const found = DAYS.filter((d) => p.includes(d.toLowerCase()));
  if (found.length === 0) return null;
  const range = p.match(new RegExp(`(${DAYS.join('|')})\\s*(?:to|-|–|until)\\s*(${DAYS.join('|')})`, 'i'));
  if (range) {
    const a = DAYS.findIndex((d) => d.toLowerCase() === range[1].toLowerCase());
    const b = DAYS.findIndex((d) => d.toLowerCase() === range[2].toLowerCase());
    const out = [];
    for (let i = a; ; i = (i + 1) % 7) { out.push(DAYS[i]); if (i === b) break; }
    return out;
  }
  return found;
}

/** An existing line read back into the form's choices. Unreadable text becomes kind "dates", kept word for word. */
export function parseHours(value) {
  const text = String(value || '').trim();
  // No day picked to start with: a new spot's hours must be chosen, not
  // saved as a default nobody looked at.
  const empty = { kind: 'weekly', days: [], ranges: [{ start: 480, end: 1020 }], text: '' };
  if (!text) return empty;
  if (/^(open\s+)?any\s*time|free to visit any\s*time/i.test(text)) return { ...empty, kind: 'anytime' };

  const times = [...text.matchAll(TIME_RE)].map((m) => toMinutes(m[1], m[2], m[3]));
  const comma = text.lastIndexOf(',');
  const days = comma >= 0 ? parseDays(text.slice(comma + 1)) : null;
  if (times.length >= 2 && times.length % 2 === 0 && days) {
    const ranges = [];
    for (let i = 0; i < times.length; i += 2) ranges.push({ start: times[i], end: times[i + 1] });
    const parsed = { kind: 'weekly', days, ranges, text: '' };
    // Only when it writes back the way it was read, near enough; otherwise
    // the line is kept as typed rather than quietly changed.
    if (ranges.every((r) => r.end > r.start && r.start % 30 === 0 && r.end % 30 === 0)) return parsed;
  }
  return { ...empty, kind: 'dates', text };
}

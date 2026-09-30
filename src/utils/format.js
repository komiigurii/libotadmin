/*
 * Dates and numbers, formatted one way across the panel.
 *
 * Pages had four date formats between them — "10/01/2026, 04:22 AM",
 * "Oct 1, 04:22 AM", "2026-10-01" and "3d ago" — for the same kind of fact.
 * Now: a timestamp is "Oct 1, 4:22 AM" (with the year only when it isn't this
 * year), a day is "Oct 1, 2026", and "how long ago" is "5 h ago".
 */

const parse = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const thisYear = (d) => d.getFullYear() === new Date().getFullYear();

/** "Oct 1, 4:22 AM" — or "Oct 1, 2025, 4:22 AM" for another year. */
export function fmtDateTime(value) {
  const d = parse(value);
  if (!d) return '—';
  return d.toLocaleString('en-PH', {
    month: 'short', day: 'numeric', ...(thisYear(d) ? {} : { year: 'numeric' }),
    hour: 'numeric', minute: '2-digit',
  });
}

/** "Oct 1, 2026" */
export function fmtDay(value) {
  const d = parse(value);
  if (!d) return '—';
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "just now" · "12 min ago" · "5 h ago" · "3 days ago" · then a date. */
export function timeAgo(value) {
  const d = parse(value);
  if (!d) return '—';
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return fmtDay(d);
}

/** 1284 → "1,284"; null → "—". */
export const fmtNum = (n) => (n == null ? '—' : Number(n).toLocaleString('en-PH'));

/** plural(3, 'spot') → "3 spots"; plural(1, 'city', 'cities') → "1 city". */
export const plural = (n, one, many = `${one}s`) => `${fmtNum(n)} ${n === 1 ? one : many}`;

// A festival spot can only be visited on its own dates (2026-10-31). The
// same rule as LibotBackend utils/festivalDates.js (which enforces it) and the
// app's utils/festivalDates.js; keep the three equal. Each range is
//
//   { start: '2027-05-14', end: '2027-05-15', everyYear: true }
//
// in Philippine calendar days. `everyYear` repeats the same days every year; a
// festival whose date moves gets that year's days, and next year's are added
// when they're known. A festival with no dates is never open.

/** Whether a spot with these categories is a festival, in any letter case. */
export function isFestival(categories) {
  const cats = Array.isArray(categories) ? categories : [categories];
  return cats.some((c) => String(c ?? '').trim().toLowerCase() === 'festivals');
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// The day `years` years after '2027-05-14' (Feb 29 rolls over to Mar 1).
const addYears = (d, years = 0) => {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(Date.UTC(y + years, m - 1, dd)).toISOString().slice(0, 10);
};

const day = (v) => (typeof v === 'string' && DAY_RE.test(v) && addYears(v) === v ? v : null);

/** The day `at` falls on in the Philippines (UTC+8, no daylight saving). */
export const manilaDay = (at = Date.now()) =>
  new Date(new Date(at).getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);

function occurrences(ranges, today) {
  const year = Number(today.slice(0, 4));
  const out = [];
  for (const r of ranges || []) {
    const start = day(r?.start);
    const end = day(r?.end);
    if (!start || !end || end < start) continue;
    if (!r.everyYear) { out.push({ start, end }); continue; }
    const from = Number(start.slice(0, 4));
    for (const y of [year - 1, year, year + 1]) {
      out.push({ start: addYears(start, y - from), end: addYears(end, y - from) });
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

/** Whether the dates cover today (Philippine day). */
export function isOnNow(ranges, at = Date.now()) {
  const today = manilaDay(at);
  return occurrences(ranges, today).some((o) => o.start <= today && today <= o.end);
}

/** The next run still to come or running, { start, end }, or null. */
export function nextRun(ranges, at = Date.now()) {
  const today = manilaDay(at);
  return occurrences(ranges, today).find((o) => o.end >= today) || null;
}

/** What's wrong with the dates, or ''. */
export function festivalDatesProblem(ranges) {
  if (!Array.isArray(ranges) || ranges.length === 0) return 'Add the festival’s dates — travelers can only visit it on them.';
  for (const [i, r] of ranges.entries()) {
    const start = day(r?.start);
    const end = day(r?.end);
    const n = ranges.length > 1 ? ` (dates ${i + 1})` : '';
    if (!start || !end) return `Pick the first and last day of the festival${n}.`;
    if (end < start) return `The last day comes before the first${n}.`;
    if (r.everyYear && addYears(start, 1) <= end) return `A festival that repeats every year can't last a year or more${n}.`;
  }
  return '';
}

/** '2027-05-14' → "May 14, 2027"; a range in one line, "May 14–15, 2027". */
export function formatRun(run, { year = true } = {}) {
  if (!run) return '';
  const parts = (d) => {
    const [y, m, dd] = d.split('-').map(Number);
    return { y, m, d: dd, month: new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }) };
  };
  const a = parts(run.start);
  const b = parts(run.end);
  const yr = (p) => (year ? `, ${p.y}` : '');
  if (run.start === run.end) return `${a.month} ${a.d}${yr(a)}`;
  if (a.y === b.y && a.m === b.m) return `${a.month} ${a.d}–${b.d}${yr(a)}`;
  if (a.y === b.y) return `${a.month} ${a.d} – ${b.month} ${b.d}${yr(a)}`;
  return `${a.month} ${a.d}, ${a.y} – ${b.month} ${b.d}, ${b.y}`;
}

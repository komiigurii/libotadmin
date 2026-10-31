// A festival spot can only be visited on its own dates (2026-10-31), and those
// dates are its visiting hours (2026-11-01). The "Specific dates" kind of
// VisitingHoursField picks them and writes the line (formatDatesLine); the
// backend reads the same line to decide (LibotBackend utils/festivalDates.js,
// which enforces it; the app keeps a copy too — keep the three equal):
//
//   "Celebrated on May 14–15"                     every year (no year given)
//   "Celebrated on January 31, 2027"              that year only
//   "Celebrated on March 24, 2027 and March 26, 2027"
//
// A run is { start: 'YYYY-MM-DD', end, everyYear }; every-year runs are kept
// in 2000 (a leap year, so Feb 29 is a real day).

/** Whether a spot with these categories is a festival, in any letter case. */
export function isFestival(categories) {
  const cats = Array.isArray(categories) ? categories : [categories];
  return cats.some((c) => String(c ?? '').trim().toLowerCase() === 'festivals');
}

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const monthIndex = (m) => MONTHS.findIndex((name) => name.toLowerCase().startsWith(m.toLowerCase().slice(0, 3)));
const DAY = '(\\d{1,2})(?:st|nd|rd|th)?';
const RUN_RE = new RegExp(`^${MONTH}\\.?\\s+${DAY}(?:,?\\s*(\\d{4}))?(?:\\s*-\\s*(?:${MONTH}\\.?\\s+)?${DAY}(?:,?\\s*(\\d{4}))?)?$`, 'i');
// Without a capture group: split() would put what it captured into the list.
const ANY_MONTH = MONTH.replace('(', '(?:');
const SPLIT_RE = new RegExp(`\\s*(?:;|,|\\band\\b)\\s*(?=${ANY_MONTH}\\b)`, 'i');
const FIRST_MONTH_RE = new RegExp(`\\b${ANY_MONTH}\\b`, 'i');
export const ANY_YEAR = 2000;

// The day `years` years after '2027-05-14' (Feb 29 rolls over to Mar 1).
const addYears = (d, years = 0) => {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(Date.UTC(y + years, m - 1, dd)).toISOString().slice(0, 10);
};
const ymd = (y, m, d) => `${String(y).padStart(4, '0')}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const real = (d) => addYears(d) === d;

/** The runs a visiting-hours line names, or [] when it names none or any part can't be read. */
export function datesFromHours(text) {
  const line = String(text ?? '').replace(/[–—]/g, '-').replace(/\s+(?:to|until|through)\s+/gi, ' - ');
  const from = line.search(FIRST_MONTH_RE);
  if (from < 0) return [];
  const body = line.slice(from).trim().replace(/\.$/, '');
  const runs = [];
  for (const part of body.split(SPLIT_RE).filter(Boolean)) {
    const m = part.trim().match(RUN_RE);
    if (!m) return [];
    const [, m1, d1, y1, m2, d2, y2] = m;
    const sm = monthIndex(m1);
    const em = m2 ? monthIndex(m2) : sm;
    const sd = Number(d1);
    const ed = d2 ? Number(d2) : sd;
    if (em === sm && ed < sd) return [];
    const wraps = em < sm;
    const sy = Number(y1 || y2 || ANY_YEAR);
    const ey = y2 ? Number(y2) : sy + (wraps ? 1 : 0);
    const start = ymd(!y1 && y2 && wraps ? sy - 1 : sy, sm, sd);
    const end = ymd(ey, em, ed);
    if (!real(start) || !real(end) || end < start) return [];
    runs.push({ start, end, everyYear: !(y1 || y2) });
  }
  return runs;
}

/** The day `at` falls on in the Philippines (UTC+8, no daylight saving). */
export const manilaDay = (at = Date.now()) =>
  new Date(new Date(at).getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);

function occurrences(runs, today) {
  const year = Number(today.slice(0, 4));
  const out = [];
  for (const r of runs) {
    if (!r.everyYear) { out.push({ start: r.start, end: r.end }); continue; }
    const from = Number(r.start.slice(0, 4));
    for (const y of [year - 1, year, year + 1]) {
      out.push({ start: addYears(r.start, y - from), end: addYears(r.end, y - from) });
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

/** Whether the runs cover today (Philippine day). */
export function isOnNow(runs, at = Date.now()) {
  const today = manilaDay(at);
  return occurrences(runs, today).some((o) => o.start <= today && today <= o.end);
}

/** The next run still to come or running, { start, end }, or null. */
export function nextRun(runs, at = Date.now()) {
  const today = manilaDay(at);
  return occurrences(runs, today).find((o) => o.end >= today) || null;
}

/** { start, end } → "May 14–15, 2027"; without the year when `year` is false ("May 14–15"). */
export function formatRun(run, { year = true } = {}) {
  if (!run) return '';
  const parts = (d) => {
    const [y, m, dd] = d.split('-').map(Number);
    return { y, m, d: dd, month: MONTHS[m - 1] };
  };
  const a = parts(run.start);
  const b = parts(run.end);
  const yr = year ? `, ${a.y}` : '';
  if (run.start === run.end) return `${a.month} ${a.d}${yr}`;
  if (a.y === b.y && a.m === b.m) return `${a.month} ${a.d}–${b.d}${yr}`;
  if (a.y === b.y || !year) return `${a.month} ${a.d} – ${b.month} ${b.d}${a.y === b.y ? yr : ''}`;
  return `${a.month} ${a.d}, ${a.y} – ${b.month} ${b.d}, ${b.y}`;
}

/** The runs as the visiting-hours line: "Celebrated on May 14–15 and January 31, 2027". */
export function formatDatesLine(runs) {
  const parts = runs.map((r) => formatRun(r, { year: !r.everyYear }));
  if (!parts.length) return '';
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `Celebrated on ${list}`;
}

/**
 * A picked run (first and last day from date inputs, and "every year") as a
 * run, or null if it isn't complete or the last day comes first. An every-year
 * run whose last day is in the next year (Dec 30 – Jan 2) is fine.
 */
export function runFromPicks({ start, end, everyYear }) {
  if (!start || !end || !real(start) || !real(end)) return null;
  if (!everyYear) return end >= start ? { start, end, everyYear: false } : null;
  const s = `${ANY_YEAR}${start.slice(4)}`;
  let e = `${ANY_YEAR}${end.slice(4)}`;
  if (e < s) {
    // Only a later month can wrap to January's side ("May 14 – May 12" is a slip).
    if (e.slice(5, 7) === s.slice(5, 7)) return null;
    e = `${ANY_YEAR + 1}${end.slice(4)}`;
  }
  if (!real(s) || !real(e) || addYears(s, 1) <= e) return null;
  return { start: s, end: e, everyYear: true };
}

/** A run as the date inputs show it: an every-year run in this year (its end in the next if it wraps). */
export function picksFromRun(run, at = Date.now()) {
  if (!run.everyYear) return { ...run };
  const year = Number(manilaDay(at).slice(0, 4));
  const shift = year - ANY_YEAR;
  return { start: addYears(run.start, shift), end: addYears(run.end, shift), everyYear: true };
}

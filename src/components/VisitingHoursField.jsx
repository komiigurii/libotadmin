import { useState } from 'react';
import { theme as t, radius } from '../theme';
import Icon from './Icon';
import {
  DAYS, TIME_OPTIONS, formatTime, formatHours, parseHours,
} from '../utils/visitingHours';
import { runFromPicks, isOnNow, nextRun, formatRun } from '../utils/festivalDates';

/*
 * Visiting hours, picked rather than typed (QA 2026-10-16: start and end time
 * dropdowns with a clock icon, and the recurring part kept separate).
 *
 * First the kind: "Regular hours" repeat every week (days + time ranges),
 * "Open anytime", or "Specific dates" for festivals: first and last day of
 * each run, and "Every year" for one that falls on the same days each year.
 * A festival can be visited only on those days (2026-11-01; LibotBackend
 * utils/festivalDates.js reads the same line). It still saves one line of
 * text, the same the app shows; see utils/visitingHours.js. `onChange` gets ''
 * while the choice is incomplete, so the form's required check catches it.
 * `festival`: the spot is filed under Festivals, so dates are what it needs.
 */

const KINDS = [
  { key: 'weekly',  label: 'Regular hours', hint: 'Repeats every week' },
  { key: 'anytime', label: 'Open anytime',  hint: 'Any time, any day' },
  { key: 'dates',   label: 'Specific dates', hint: 'Festivals and events' },
];

const SHORTCUTS = [
  { label: 'Every day', days: DAYS },
  { label: 'Weekdays',  days: DAYS.slice(0, 5) },
  { label: 'Weekends',  days: DAYS.slice(5) },
];

const MAX_RANGES = 3;
const MAX_RUNS = 6;

export default function VisitingHoursField({ value, onChange, festival = false }) {
  const [hours, setHours] = useState(() => parseHours(value));

  const update = (patch) => {
    const next = { ...hours, ...patch };
    setHours(next);
    onChange(formatHours(next));
  };

  const toggleDay = (d) => update({ days: hours.days.includes(d) ? hours.days.filter((x) => x !== d) : [...hours.days, d] });
  const setRange = (i, key, minutes) => update({ ranges: hours.ranges.map((r, j) => (j === i ? { ...r, [key]: minutes } : r)) });
  const addRange = () => {
    const last = hours.ranges[hours.ranges.length - 1];
    const start = Math.min((last?.end ?? 720) + 60, 1380);
    update({ ranges: [...hours.ranges, { start, end: Math.min(start + 120, 1410) }] });
  };
  const removeRange = (i) => update({ ranges: hours.ranges.filter((_, j) => j !== i) });

  // Festival runs. A one-day festival is the usual case: the last day follows
  // the first until it's picked on its own.
  const setRun = (i, patch) => update({
    runs: hours.runs.map((r, j) => {
      if (j !== i) return r;
      const next = { ...r, ...patch };
      if ('start' in patch && (!r.end || r.end === r.start || r.end < patch.start)) next.end = patch.start;
      return next;
    }),
  });
  const addRun = () => update({ runs: [...hours.runs, { start: '', end: '', everyYear: false }] });
  const removeRun = (i) => update({ runs: hours.runs.filter((_, j) => j !== i) });

  const preview = formatHours(hours);
  const badRange = hours.kind === 'weekly' && hours.ranges.some((r) => !(r.end > r.start));
  const noDays = hours.kind === 'weekly' && hours.days.length === 0;
  const picked = hours.kind === 'dates' ? hours.runs.map(runFromPicks) : [];
  const badRun = picked.findIndex((r, i) => !r && hours.runs[i].start && hours.runs[i].end);
  const runsOk = picked.length > 0 && picked.every(Boolean);
  const next = runsOk ? nextRun(picked) : null;
  const status = !runsOk ? '' : isOnNow(picked) ? `open now, until ${formatRun({ start: next.end, end: next.end })}`
    : next ? `locked until ${formatRun(next)}` : 'locked — none of these days is still to come';

  return (
    <div style={st.wrap}>
      <div role="radiogroup" aria-label="Kind of visiting hours" style={st.kinds}>
        {KINDS.map((k) => {
          const on = hours.kind === k.key;
          return (
            <button
              key={k.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => update({ kind: k.key })}
              style={{ ...st.kind, ...(on ? st.kindOn : {}) }}
              className="modern-btn"
            >
              <span style={st.kindLabel}>{k.label}</span>
              <span style={{ ...st.kindHint, ...(on ? st.kindHintOn : {}) }}>{k.hint}</span>
            </button>
          );
        })}
      </div>

      {hours.kind === 'weekly' && (
        <>
          <div>
            <p style={st.sub}>Open on</p>
            <div style={st.chips}>
              {DAYS.map((d) => {
                const on = hours.days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleDay(d)}
                    style={{ ...st.chip, ...(on ? st.chipOn : {}) }}
                    className="modern-btn"
                    title={d}
                  >
                    {d.slice(0, 3)}
                  </button>
                );
              })}
            </div>
            <div style={st.shortcuts}>
              {SHORTCUTS.map((sc) => (
                <button key={sc.label} type="button" onClick={() => update({ days: [...sc.days] })} style={st.link}>
                  {sc.label}
                </button>
              ))}
            </div>
            {noDays && <p style={st.error}>Pick at least one day.</p>}
          </div>

          <div>
            <p style={st.sub}>Hours</p>
            {hours.ranges.map((r, i) => (
              <div key={i} style={st.rangeRow}>
                <TimeSelect label="Opens" value={r.start} onChange={(m) => setRange(i, 'start', m)} />
                <span style={st.to}>to</span>
                <TimeSelect label="Closes" value={r.end} onChange={(m) => setRange(i, 'end', m)} />
                {hours.ranges.length > 1 && (
                  <button type="button" onClick={() => removeRange(i)} style={st.remove} aria-label={`Remove time range ${i + 1}`}>
                    <Icon name="x" size={14} />
                  </button>
                )}
              </div>
            ))}
            {badRange && <p style={st.error}>Closing time has to be after opening time.</p>}
            {hours.ranges.length < MAX_RANGES && (
              <button type="button" onClick={addRange} style={st.link}>
                <Icon name="plus" size={13} /> Add another time range (e.g. closed at lunch)
              </button>
            )}
          </div>
        </>
      )}

      {festival && hours.kind !== 'dates' && (
        <p style={st.error}>A festival’s visiting hours are its dates: choose “Specific dates”. Travelers can only open it on those days.</p>
      )}

      {hours.kind === 'dates' && (
        <div>
          {!!hours.text && !hours.runs.length && (
            <p style={st.was}>
              It said “{hours.text}”, which the app can’t turn into days. Pick them below.
            </p>
          )}
          {hours.runs.map((r, i) => (
            <div key={i} style={st.runRow}>
              <label style={st.dateWrap}>
                <span style={st.sub}>First day</span>
                <input type="date" value={r.start || ''} onChange={(e) => setRun(i, { start: e.target.value })} style={st.input} className="modern-input" />
              </label>
              <label style={st.dateWrap}>
                <span style={st.sub}>Last day</span>
                <input type="date" value={r.end || ''} onChange={(e) => setRun(i, { end: e.target.value })} style={st.input} className="modern-input" />
              </label>
              <label style={st.check}>
                <input type="checkbox" checked={!!r.everyYear} onChange={(e) => setRun(i, { everyYear: e.target.checked })} />
                Every year
              </label>
              <button type="button" onClick={() => removeRun(i)} style={st.removeRun} aria-label={`Remove dates ${i + 1}`}>
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
          {badRun !== -1 && <p style={st.error}>The last day comes before the first{hours.runs.length > 1 ? ` (dates ${badRun + 1})` : ''}.</p>}
          {hours.runs.length < MAX_RUNS && (
            <button type="button" onClick={addRun} style={st.link}>
              <Icon name="plus" size={13} /> {hours.runs.length ? 'Add more dates' : 'Add the dates'}
            </button>
          )}
          <p style={st.hint}>
            Travelers can open a festival and have their visit counted only on these days (Philippine time).
            If the date moves each year, add this year’s and come back for next year’s.
          </p>
        </div>
      )}

      <p style={st.preview} aria-live="polite">
        <Icon name="eye" size={13} /> In the app: <strong>{preview || '…'}</strong>{status && ` — ${status}`}
      </p>
    </div>
  );
}

function TimeSelect({ label, value, onChange }) {
  return (
    <label style={st.timeWrap}>
      <span style={st.srOnly}>{label}</span>
      <span style={st.timeIcon} aria-hidden="true"><Icon name="clock" size={15} /></span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={st.select}
        className="modern-input"
        aria-label={label}
      >
        {TIME_OPTIONS.map((m) => <option key={m} value={m}>{formatTime(m)}</option>)}
      </select>
      <span style={st.chevron} aria-hidden="true"><Icon name="chevron-down" size={14} /></span>
    </label>
  );
}

const st = {
  wrap:  { display: 'flex', flexDirection: 'column', gap: 12, padding: 12, borderRadius: radius.lg, border: `1px solid ${t.border}`, background: t.sidebarBg },
  kinds: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 },
  kind: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, textAlign: 'left',
    padding: '8px 10px', borderRadius: radius.md, border: `1px solid ${t.border}`, background: t.cardBg,
    color: t.textPrimary, cursor: 'pointer',
  },
  // Picked: a teal tint and edge, like the sidebar's current page.
  kindOn:     { background: t.brandSoft, borderColor: t.brand, color: t.brand },
  kindLabel:  { fontWeight: 600, fontSize: 13 },
  kindHint:   { fontSize: 11.5, color: t.textMuted },
  kindHintOn: { color: t.textSecondary },
  sub:   { fontSize: 12, fontWeight: 700, color: t.textSecondary, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.05em' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  chip:  { minWidth: 46, padding: '6px 10px', borderRadius: radius.pill, border: `1px solid ${t.border}`, background: t.cardBg, color: t.textSecondary, fontWeight: 600, fontSize: 12.5, cursor: 'pointer' },
  chipOn: { background: t.brandSoft, borderColor: t.brand, color: t.brand },
  shortcuts: { display: 'flex', gap: 14, marginTop: 6 },
  link:  { display: 'inline-flex', alignItems: 'center', gap: 5, padding: 0, marginTop: 4, border: 'none', background: 'none', color: t.brand, fontWeight: 600, fontSize: 12.5, cursor: 'pointer' },
  rangeRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  to:    { fontSize: 13, color: t.textSecondary },
  timeWrap: { position: 'relative', flex: 1, minWidth: 0 },
  timeIcon: { position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: t.textMuted, display: 'flex', pointerEvents: 'none' },
  chevron:  { position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: t.textMuted, display: 'flex', pointerEvents: 'none' },
  select: {
    width: '100%', padding: '9px 30px 9px 32px', borderRadius: radius.md, border: `1px solid ${t.border}`,
    fontSize: 14, color: t.textPrimary, background: t.cardBg, appearance: 'none', WebkitAppearance: 'none',
    cursor: 'pointer', boxSizing: 'border-box',
  },
  remove: { width: 30, height: 30, borderRadius: radius.md, border: `1px solid ${t.border}`, background: t.cardBg, color: t.textSecondary, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 },
  input: { width: '100%', padding: '10px 12px', borderRadius: radius.md, border: `1px solid ${t.border}`, fontSize: 14, color: t.textPrimary, outline: 'none', background: t.cardBg, boxSizing: 'border-box' },
  error: { fontSize: 12, color: t.danger, margin: '4px 0 0' },
  runRow:   { display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap', marginBottom: 8 },
  dateWrap: { display: 'flex', flexDirection: 'column', flex: '1 1 140px', minWidth: 0 },
  check:    { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: t.textPrimary, padding: '9px 2px', cursor: 'pointer' },
  removeRun: { width: 36, height: 36, borderRadius: radius.md, border: `1px solid ${t.border}`, background: t.cardBg, color: t.textSecondary, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 },
  hint: { fontSize: 12, color: t.textMuted, margin: '6px 0 0' },
  was:  { fontSize: 12.5, color: t.textSecondary, margin: '0 0 8px' },
  preview: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: t.textSecondary, margin: 0 },
  srOnly: { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 },
};

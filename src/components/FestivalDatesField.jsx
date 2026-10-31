import { theme as t, radius } from '../theme';
import Icon from './Icon';
import { festivalDatesProblem, nextRun, isOnNow, formatRun } from '../utils/festivalDates';

/*
 * A festival's dates (2026-10-31): travelers can only open the festival and
 * have their visit counted on these days (LibotBackend utils/festivalDates.js).
 * One row per run, first and last day, with "Every year" for a festival that
 * falls on the same days each year. A festival whose date moves (the last
 * Sunday of January, Holy Week) gets this year's days, and next year's once
 * they're known.
 */

const MAX_RUNS = 6;

export default function FestivalDatesField({ value, onChange }) {
  const runs = Array.isArray(value) ? value : [];
  const set = (i, patch) => onChange(runs.map((r, j) => {
    if (j !== i) return r;
    const next = { ...r, ...patch };
    // A one-day festival is the usual case: the last day follows the first
    // until it's picked on its own.
    if ('start' in patch && (!r.end || r.end === r.start || r.end < patch.start)) next.end = patch.start;
    return next;
  }));
  const add = () => onChange([...runs, { start: '', end: '', everyYear: false }]);
  const remove = (i) => onChange(runs.filter((_, j) => j !== i));

  const problem = runs.length ? festivalDatesProblem(runs) : '';
  const next = problem ? null : nextRun(runs);
  const preview = !runs.length || problem
    ? '…'
    : isOnNow(runs) ? `Open now, until ${formatRun({ start: next.end, end: next.end })}`
      : next ? `Locked until ${formatRun(next)}` : 'Locked — none of these dates is still to come';

  return (
    <div style={st.wrap}>
      {runs.map((r, i) => (
        <div key={i} style={st.row}>
          <label style={st.dateWrap}>
            <span style={st.small}>First day</span>
            <input type="date" value={r.start || ''} onChange={(e) => set(i, { start: e.target.value })} style={st.input} className="modern-input" />
          </label>
          <label style={st.dateWrap}>
            <span style={st.small}>Last day</span>
            <input type="date" value={r.end || ''} min={r.start || undefined} onChange={(e) => set(i, { end: e.target.value })} style={st.input} className="modern-input" />
          </label>
          <label style={st.check}>
            <input type="checkbox" checked={!!r.everyYear} onChange={(e) => set(i, { everyYear: e.target.checked })} />
            Every year
          </label>
          <button type="button" onClick={() => remove(i)} style={st.remove} aria-label={`Remove dates ${i + 1}`}>
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}

      {runs.length < MAX_RUNS && (
        <button type="button" onClick={add} style={st.link}>
          <Icon name="plus" size={13} /> {runs.length ? 'Add more dates' : 'Add the festival’s dates'}
        </button>
      )}

      {problem && <p style={st.error}>{problem}</p>}
      <p style={st.hint}>
        Travelers can open this festival and have their visit counted only on these days (Philippine time).
        If the date moves each year, add this year’s and come back for next year’s.
      </p>
      <p style={st.preview} aria-live="polite">
        <Icon name="eye" size={13} /> In the app: <strong>{preview}</strong>
      </p>
    </div>
  );
}

const st = {
  wrap:  { display: 'flex', flexDirection: 'column', gap: 10, padding: 12, borderRadius: radius.lg, border: `1px solid ${t.border}`, background: t.sidebarBg },
  row:   { display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' },
  dateWrap: { display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 140px', minWidth: 0 },
  small: { fontSize: 12, fontWeight: 700, color: t.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' },
  input: { width: '100%', padding: '9px 10px', borderRadius: radius.md, border: `1px solid ${t.border}`, fontSize: 14, color: t.textPrimary, background: t.cardBg, boxSizing: 'border-box' },
  check: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: t.textPrimary, padding: '9px 2px', cursor: 'pointer' },
  remove: { width: 36, height: 36, borderRadius: radius.md, border: `1px solid ${t.border}`, background: t.cardBg, color: t.textSecondary, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 },
  link:  { display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: 5, padding: 0, border: 'none', background: 'none', color: t.brand, fontWeight: 600, fontSize: 12.5, cursor: 'pointer' },
  error: { fontSize: 12, color: t.danger, margin: 0 },
  hint:  { fontSize: 12, color: t.textMuted, margin: 0 },
  preview: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: t.textSecondary, margin: 0 },
};

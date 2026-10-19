import { useState } from 'react';
import { theme as t, radius } from '../theme';
import Icon from './Icon';
import {
  DAYS, TIME_OPTIONS, formatTime, formatHours, parseHours,
} from '../utils/visitingHours';

/*
 * Visiting hours, picked rather than typed (QA 2026-10-16: start and end time
 * dropdowns with a clock icon, and the recurring part kept separate).
 *
 * First the kind: "Regular hours" repeat every week (days + time ranges),
 * "Open anytime", or "Specific dates" for festivals and anything else (typed).
 * It still saves one line of text, the same the app shows; see
 * utils/visitingHours.js. `onChange` gets '' while the choice is incomplete,
 * so the form's required check catches it.
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

export default function VisitingHoursField({ value, onChange }) {
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

  const preview = formatHours(hours);
  const badRange = hours.kind === 'weekly' && hours.ranges.some((r) => !(r.end > r.start));
  const noDays = hours.kind === 'weekly' && hours.days.length === 0;

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

      {hours.kind === 'dates' && (
        <input
          value={hours.text}
          onChange={(e) => update({ text: e.target.value })}
          style={st.input}
          className="modern-input"
          placeholder="Celebrated on June 23"
          aria-label="Dates or schedule"
        />
      )}

      <p style={st.preview} aria-live="polite">
        <Icon name="eye" size={13} /> In the app: <strong>{preview || '…'}</strong>
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
  kindOn:     { background: t.brandSolid, borderColor: t.brandSolid, color: t.onBrandSolid },
  kindLabel:  { fontWeight: 600, fontSize: 13 },
  kindHint:   { fontSize: 11.5, color: t.textMuted },
  kindHintOn: { color: t.onBrandSolidMuted },
  sub:   { fontSize: 12, fontWeight: 700, color: t.textSecondary, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.05em' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  chip:  { minWidth: 46, padding: '6px 10px', borderRadius: radius.pill, border: `1px solid ${t.border}`, background: t.cardBg, color: t.textSecondary, fontWeight: 600, fontSize: 12.5, cursor: 'pointer' },
  chipOn: { background: t.brandSolid, borderColor: t.brandSolid, color: t.onBrandSolid },
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
  preview: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: t.textSecondary, margin: 0 },
  srOnly: { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 },
};

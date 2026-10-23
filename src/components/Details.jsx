import { theme as t, radius, type } from '../theme';
import { fmtDay, timeAgo } from '../utils/format';

/*
 * The pieces every details drawer is made of (2026-10-23: a table row opens
 * its details in a Drawer): a grid of facts, titled sections, and a note.
 * One look for a traveler, a staff account, a log entry or a maintenance.
 */

/** items: [label, value] pairs; a pair whose value is null or '' is left out. */
export function Facts({ items }) {
  const shown = items.filter(([, v]) => v != null && v !== '');
  if (!shown.length) return null;
  return (
    <dl style={d.facts}>
      {shown.map(([k, v]) => (
        <div key={k} style={d.fact}><dt style={d.dt}>{k}</dt><dd style={d.dd}>{v}</dd></div>
      ))}
    </dl>
  );
}

export function DetailSection({ title, children }) {
  return (
    <section>
      <h3 style={d.h3}>{title}</h3>
      {children}
    </section>
  );
}

/** visits: [{ spot, town?, at }], latest first. */
export function VisitList({ visits }) {
  return (
    <ul style={d.visits}>
      {visits.map((v, i) => (
        <li key={i} style={d.visit}>
          <span style={{ minWidth: 0 }}>
            <span style={{ color: t.textPrimary, fontWeight: 600 }}>{v.spot}</span>
            {v.town && <span style={{ color: t.textMuted }}> · {v.town}</span>}
          </span>
          {v.at && <span className="sa-mono" style={d.when} title={fmtDay(v.at)}>{timeAgo(v.at)}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Long text shown whole: a reason, an appeal, what was done. */
export function DetailText({ children }) {
  return <p style={d.text}>{children}</p>;
}

export const detailStyles = {
  stack:  { display: 'flex', flexDirection: 'column', gap: 18 },
  record: { margin: 0, paddingLeft: 18, fontSize: 13, color: t.textSecondary, lineHeight: 1.6 },
  note:   { fontSize: 12, color: t.textMuted, margin: 0 },
  // A tinted strip with a line of text and an action beside it.
  strip:  { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: radius.md, background: t.sidebarBg, border: `1px solid ${t.border}`, fontSize: 13, color: t.textSecondary, lineHeight: 1.5 },
};

const d = {
  facts: { margin: 0, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 },
  fact:  { padding: '10px 12px', borderRadius: radius.md, background: t.sidebarBg, border: `1px solid ${t.border}`, minWidth: 0 },
  dt:    { ...type.label, color: t.textMuted },
  dd:    { margin: '4px 0 0', fontSize: 15, fontWeight: 600, color: t.textPrimary, overflowWrap: 'anywhere', ...type.num },
  h3:    { fontSize: 13, fontWeight: 700, color: t.textPrimary, margin: '0 0 10px' },
  visits: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' },
  visit:  { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '7px 0', borderBottom: `1px solid ${t.divider}`, fontSize: 13.5 },
  when:   { color: t.textSecondary, whiteSpace: 'nowrap', flexShrink: 0 },
  text:  { margin: 0, padding: '10px 12px', borderRadius: radius.md, background: t.sidebarBg, border: `1px solid ${t.border}`, fontSize: 13.5, color: t.textPrimary, lineHeight: 1.55, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
};

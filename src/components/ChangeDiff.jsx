import { useState } from 'react';
import { theme as t, radius } from '../theme';
import Icon from './Icon';
import { FIELD_LABELS, META_KEYS, LONG_FIELDS, THUMB_FIELDS, FILE_LINK_FIELDS, fmtVal } from '../utils/changeDiff';

/*
 * "What changed" for a spot or food-mission proposal: old value struck
 * through → new value, laid out to suit each field (thumbnails for images,
 * file links for 3D models, stacked blocks for long text).
 *
 * The Approval Queue (admin) and My Submissions (moderator) each carried
 * their own copy of all this, and the copies had drifted — different label
 * widths and type sizes, and only one knew about food-mission fields. The
 * admin and the moderator are looking at the same proposal, so they now see
 * it drawn by the same code.
 */

function fileNameOf(url) {
  try {
    return decodeURIComponent(url.split('?')[0].split('/').pop());
  } catch {
    return url;
  }
}

function Thumb({ url, dimmed }) {
  const [broken, setBroken] = useState(false);
  if (!url || broken) return <div style={{ ...s.thumb, ...s.thumbEmpty }}>—</div>;
  return (
    <a href={url} target="_blank" rel="noreferrer" style={s.thumbLink}>
      <img
        src={url}
        alt=""
        onError={() => setBroken(true)}
        style={{ ...s.thumb, opacity: dimmed ? 0.4 : 1, filter: dimmed ? 'grayscale(0.6)' : 'none' }}
      />
    </a>
  );
}

export function DiffField({ fieldKey, oldVal, newVal, labelMap = FIELD_LABELS }) {
  const label = labelMap[fieldKey] || fieldKey;
  if (fmtVal(fieldKey, oldVal) === fmtVal(fieldKey, newVal)) return null;

  if (THUMB_FIELDS.has(fieldKey)) {
    return (
      <div style={s.row}>
        <span style={s.label}>{label}</span>
        <div style={s.pair}>
          <Thumb url={oldVal} dimmed />
          <span style={s.arrow}><Icon name="arrow-right" size={12} /></span>
          <Thumb url={newVal} />
        </div>
      </div>
    );
  }

  if (FILE_LINK_FIELDS.has(fieldKey)) {
    return (
      <div style={s.row}>
        <span style={s.label}>{label}</span>
        <div style={s.pair}>
          {oldVal ? <a href={oldVal} target="_blank" rel="noreferrer" style={s.linkOld}>{fileNameOf(oldVal)}</a> : <span style={s.dash}>—</span>}
          <span style={s.arrow}><Icon name="arrow-right" size={12} /></span>
          {newVal ? <a href={newVal} target="_blank" rel="noreferrer" style={s.linkNew}>{fileNameOf(newVal)}</a> : <span style={s.dash}>—</span>}
        </div>
      </div>
    );
  }

  if (LONG_FIELDS.has(fieldKey)) {
    return (
      <div style={s.long}>
        <span style={s.label}>{label}</span>
        <div style={s.longOld}>{fmtVal(fieldKey, oldVal)}</div>
        <div style={s.longNew}>{fmtVal(fieldKey, newVal)}</div>
      </div>
    );
  }

  return (
    <div style={s.row}>
      <span style={s.label}>{label}</span>
      <span style={s.old}>{fmtVal(fieldKey, oldVal)}</span>
      <span style={s.arrow}><Icon name="arrow-right" size={12} /></span>
      <span style={s.new}>{fmtVal(fieldKey, newVal)}</span>
    </div>
  );
}

/** Every changed field of a pending spot edit or food-mission proposal. */
export function ChangeList({ record, labelMap, keys }) {
  const entries = Object.entries(record?.pendingChange || {})
    .filter(([k]) => !META_KEYS.has(k))
    .filter(([k]) => !keys || keys.includes(k));
  return (
    <div style={s.list}>
      {entries.map(([k, newVal]) => (
        <DiffField key={k} fieldKey={k} oldVal={record[k]} newVal={newVal} labelMap={labelMap} />
      ))}
    </div>
  );
}

/** A new-spot proposal has nothing to diff against — show what was submitted. */
export function ProposalFieldList({ proposal }) {
  const keys = Object.keys(FIELD_LABELS).filter((k) => {
    const v = proposal[k];
    return v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);
  });
  if (!keys.length) return null;
  return (
    <div style={s.list}>
      {keys.map((k) => (
        <div style={s.row} key={k}>
          <span style={s.label}>{FIELD_LABELS[k]}</span>
          <span style={{ ...s.new, whiteSpace: 'pre-wrap' }}>{fmtVal(k, proposal[k])}</span>
        </div>
      ))}
    </div>
  );
}

const s = {
  list:  { display: 'flex', flexDirection: 'column', borderTop: `1px solid ${t.divider}`, padding: '4px 18px 8px' },
  row:   { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${t.divider}`, fontSize: 12.5, flexWrap: 'wrap' },
  label: { fontSize: 11, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', width: 120, flexShrink: 0 },
  old:   { color: t.textMuted, textDecoration: 'line-through' },
  new:   { color: t.brand, fontWeight: 600 },
  arrow: { color: t.textMuted, flexShrink: 0, display: 'inline-flex' },
  dash:  { color: t.textMuted },
  pair:  { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },

  thumbLink:  { display: 'block', lineHeight: 0 },
  thumb:      { width: 44, height: 44, objectFit: 'cover', borderRadius: radius.sm, border: `1px solid ${t.border}` },
  thumbEmpty: { display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.textMuted, fontSize: 12, background: t.sidebarBg },

  linkOld: { fontSize: 12, color: t.textMuted, textDecoration: 'line-through' },
  linkNew: { fontSize: 12, color: t.brand, fontWeight: 600, textDecoration: 'underline' },

  long:    { padding: '10px 0', borderBottom: `1px solid ${t.divider}` },
  longOld: { fontSize: 12.5, color: t.textMuted, textDecoration: 'line-through', lineHeight: 1.5, marginTop: 4, whiteSpace: 'pre-wrap' },
  longNew: { fontSize: 12.5, color: t.brand, lineHeight: 1.5, marginTop: 4, whiteSpace: 'pre-wrap', fontWeight: 500 },
};

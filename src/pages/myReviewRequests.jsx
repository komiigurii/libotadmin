import { useEffect, useState } from 'react';
import { commentAPI, spotAPI, accountActionAPI } from '../api/api';
import { theme as t } from '../theme';

const STATUS_PILL = {
  pending:  { background: t.warningBg, color: t.warning, label: 'Pending' },
  approved: { background: t.successBg, color: t.success, label: 'Approved' },
  rejected: { background: t.dangerBg,  color: t.danger,  label: 'Rejected' },
};

const ACTION_LABELS = { warn: 'Warn (mute)', suspend: 'Suspend' };

const FIELD_LABELS = {
  name: 'Name', location: 'Location', category: 'Category', description: 'Description',
  history: 'History', recommendations: 'Recommendations', visitingHours: 'Visiting Hours',
  entranceFee: 'Entrance Fee', image: 'Image', modelUrl: 'Model URL', AR3DModelURL: 'AR Model URL',
  Badge: 'Badge', City: 'City', coordinates: 'Coordinates', modelsCoordinates: 'AR Positions', trivia: 'Trivia',
};

const LONG_FIELDS = new Set(['description', 'history', 'recommendations', 'trivia']);
const THUMB_FIELDS = new Set(['image', 'Badge']);
const FILE_LINK_FIELDS = new Set(['modelUrl', 'AR3DModelURL']);

function toArray(data) {
  if (!data) return [];
  if (Array.isArray(data))         return data;
  if (Array.isArray(data.reviews)) return data.reviews;
  if (Array.isArray(data.spots))   return data.spots;
  if (Array.isArray(data.actions)) return data.actions;
  if (Array.isArray(data.data))    return data.data;
  return [];
}

function fmtCoord(c) {
  if (!c || c.lat == null || c.lng == null) return '—';
  return `${Number(c.lat).toFixed(6)}, ${Number(c.lng).toFixed(6)}`;
}

function fmtVal(key, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (key === 'coordinates') return fmtCoord(v);
  if (key === 'modelsCoordinates') {
    if (!Array.isArray(v) || !v.length) return '—';
    return v.map((m, i) => `#${i + 1}  ${fmtCoord(m)}`).join('\n');
  }
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function fileNameOf(url) {
  try {
    const clean = url.split('?')[0];
    return decodeURIComponent(clean.split('/').pop());
  } catch {
    return url;
  }
}

function Thumb({ url, dimmed }) {
  const [broken, setBroken] = useState(false);
  if (!url || broken) {
    return <div style={{ ...s.thumb, ...s.thumbEmpty }}>—</div>;
  }
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

// One changed field, rendered in whichever layout suits its content:
// thumbnail pair (images), file link pair (.glb assets), stacked block
// (long text), or a compact inline row (short text/numbers).
function DiffField({ fieldKey, oldVal, newVal }) {
  const label = FIELD_LABELS[fieldKey] || fieldKey;
  const changed = fmtVal(fieldKey, oldVal) !== fmtVal(fieldKey, newVal);
  if (!changed) return null;

  if (THUMB_FIELDS.has(fieldKey)) {
    return (
      <div style={s.fieldRow}>
        <span style={s.fieldLabel}>{label}</span>
        <div style={s.thumbPair}>
          <Thumb url={oldVal} dimmed />
          <span style={s.arrow}>→</span>
          <Thumb url={newVal} />
        </div>
      </div>
    );
  }

  if (FILE_LINK_FIELDS.has(fieldKey)) {
    const hasOld = !!oldVal, hasNew = !!newVal;
    return (
      <div style={s.fieldRow}>
        <span style={s.fieldLabel}>{label}</span>
        <div style={s.linkPair}>
          {hasOld ? <a href={oldVal} target="_blank" rel="noreferrer" style={s.linkOld}>{fileNameOf(oldVal)}</a> : <span style={s.emptyDash}>—</span>}
          <span style={s.arrow}>→</span>
          {hasNew ? <a href={newVal} target="_blank" rel="noreferrer" style={s.linkNew}>{fileNameOf(newVal)}</a> : <span style={s.emptyDash}>—</span>}
        </div>
      </div>
    );
  }

  if (LONG_FIELDS.has(fieldKey)) {
    return (
      <div style={s.longBlock}>
        <span style={s.fieldLabel}>{label}</span>
        <div style={s.longOldBox}>{fmtVal(fieldKey, oldVal)}</div>
        <div style={s.longNewBox}>{fmtVal(fieldKey, newVal)}</div>
      </div>
    );
  }

  return (
    <div style={s.fieldRow}>
      <span style={s.fieldLabel}>{label}</span>
      <span style={s.oldText}>{fmtVal(fieldKey, oldVal)}</span>
      <span style={s.arrow}>→</span>
      <span style={s.newText}>{fmtVal(fieldKey, newVal)}</span>
    </div>
  );
}

// Labels of every field that actually changed in a spot's pendingChange —
// used for the card's summary line and detail row.
function changedFieldSummary(spot) {
  if (!spot?.pendingChange) return [];
  return Object.entries(spot.pendingChange)
    .filter(([k]) => k !== 'submittedBy' && k !== 'submittedAt' && k !== 'status')
    .filter(([k, newVal]) => fmtVal(k, spot[k]) !== fmtVal(k, newVal))
    .map(([k]) => FIELD_LABELS[k] || k);
}

export default function MyReviewRequests() {
  const [requests, setRequests] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [expanded, setExpanded] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [commentsData, mySpotsData, myAccountActionsData] = await Promise.all([
        commentAPI.getMine(),
        spotAPI.getMine(),
        accountActionAPI.getMine(),
      ]);

      const commentReqs = toArray(commentsData)
        .filter(c => (c.flagStatus || 'none') !== 'none')
        .map(c => ({
          kind: 'comment',
          id: c._id,
          status: c.flagStatus,
          subtitle: (c.spotId && typeof c.spotId === 'object' ? c.spotId.name : '') || '—',
          date: c.flaggedAt || c.createdAt,
          body: c,
        }));

      const spotItems = toArray(mySpotsData)
        .filter(spot => spot.pendingChange)
        .map(spot => ({
          kind: 'spot',
          id: spot._id,
          status: spot.pendingChange.status || 'pending',
          subtitle: spot.name || '—',
          date: spot.pendingChange.submittedAt,
          body: spot,
        }));

      const accountItems = toArray(myAccountActionsData)
        .map(a => ({
          kind: 'account',
          id: a._id,
          status: a.status,
          subtitle: a.targetName || a.clerkUserId,
          date: a.proposedAt || a.createdAt,
          body: a,
        }));

      const all = [...commentReqs, ...spotItems, ...accountItems].sort((a, b) => new Date(b.date) - new Date(a.date));
      setRequests(all);
    } catch {
      setError('Failed to load your review requests.');
      setRequests([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const visible = requests.filter(r => !statusFilter || r.status === statusFilter);
  const pendingCount = requests.filter(r => r.status === 'pending').length;

  return (
    <div style={s.page}>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>My Review Requests</h1>
          <p style={s.pageSub}>Spot edits, comment flags, and account actions you've submitted</p>
        </div>
      </div>

      <div style={s.filterRow}>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={s.select}>
          <option value="">All ({requests.length})</option>
          <option value="pending">Pending ({pendingCount})</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {loading ? (
        <div style={s.emptyCard}>Loading…</div>
      ) : error ? (
        <div style={{ ...s.emptyCard, color: t.danger }}>{error}</div>
      ) : visible.length === 0 ? (
        <div style={s.emptyCard}>No requests found</div>
      ) : (
        <div style={s.grid}>
          {visible.map(r => {
            const pill = STATUS_PILL[r.status] || STATUS_PILL.pending;
            const key = `${r.kind}-${r.id}`;
            const isOpen = expanded === key;

            const image = r.kind === 'spot'
              ? r.body.image
              : r.kind === 'comment'
                ? (r.body.spotId && typeof r.body.spotId === 'object' ? r.body.spotId.image : null)
                : null;

            const changedFields = r.kind === 'spot' ? changedFieldSummary(r.body) : [];
            const kindLabel = r.kind === 'spot' ? 'Spot edit' : r.kind === 'account' ? 'Account action' : 'Comment flag';

            const dateStr = r.date
              ? new Date(r.date).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
              : '—';

            return (
              <div key={key} style={s.card}>
                <div style={s.cardImgWrap}>
                  {image
                    ? <img src={image} alt={r.subtitle} style={s.cardImg} />
                    : <div style={s.cardImgPh}>{r.subtitle?.[0] || '?'}</div>
                  }
                  <span style={s.kindBadge}>{kindLabel}</span>
                  <span style={{ ...s.statusBadge, background: pill.background, color: pill.color }}>{pill.label}</span>
                </div>

                <div style={s.cardBody}>
                  <div style={s.cardName} title={r.subtitle}>{r.subtitle}</div>

                  {r.kind === 'comment' && (
                    <div style={s.cardDesc} title={r.body.comment}>
                      "{r.body.comment || ''}"
                    </div>
                  )}
                  {r.kind === 'account' && (
                    <div style={s.cardDesc} title={r.body.reason}>
                      {ACTION_LABELS[r.body.actionType] || r.body.actionType}: {r.body.reason}
                    </div>
                  )}
                  {r.kind === 'spot' && (
                    <div style={s.cardDesc}>
                      {changedFields.length ? `${changedFields.join(', ')} changed` : 'No field changes'}
                    </div>
                  )}

                  <div style={s.detailList}>
                    <div style={s.detailRow}>
                      <span style={s.detailIcon}>🕒</span>
                      <span style={s.detailText}>{dateStr}</span>
                    </div>
                    {r.kind === 'spot' && (
                      <div style={s.detailRow}>
                        <span style={s.detailIcon}>✏️</span>
                        <span style={s.detailText}>{changedFields.length} field{changedFields.length === 1 ? '' : 's'} changed</span>
                      </div>
                    )}
                    {r.kind === 'comment' && r.body.flagReason && (
                      <div style={s.detailRow}>
                        <span style={s.detailIcon}>📝</span>
                        <span style={s.detailText}>{r.body.flagReason}</span>
                      </div>
                    )}
                    {r.kind === 'account' && r.status !== 'pending' && r.body.resultSummary && (
                      <div style={s.detailRow}>
                        <span style={s.detailIcon}>✅</span>
                        <span style={s.detailText}>{r.body.resultSummary}</span>
                      </div>
                    )}
                  </div>

                  {isOpen && r.kind === 'spot' && (
                    <div style={s.fieldList}>
                      {Object.entries(r.body.pendingChange)
                        .filter(([k]) => k !== 'submittedBy' && k !== 'submittedAt' && k !== 'status')
                        .map(([k, newVal]) => (
                          <DiffField key={k} fieldKey={k} oldVal={r.body[k]} newVal={newVal} />
                        ))}
                    </div>
                  )}

                  <div style={s.cardFooter}>
                    <span style={s.cardVisits}>
                      {r.kind === 'spot' ? 'Proposed edit' : r.kind === 'account' ? 'Proposed action' : 'Flagged review'}
                    </span>
                    {r.kind === 'spot' && (
                      <button onClick={() => setExpanded(isOpen ? null : key)} style={s.btnView}>
                        {isOpen ? 'Hide Changes' : 'View Changes'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const s = {
  page:       { padding: '20px 24px', maxWidth: 1100, margin: '0 auto', width: '100%', boxSizing: 'border-box', textAlign: 'left' },
  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  pageTitle:  { fontSize: 19, fontWeight: 600, color: t.textPrimary, marginBottom: 3 },
  pageSub:    { fontSize: 12, color: t.textSecondary },

  filterRow:  { marginBottom: 14, display: 'flex' },
  select:     { padding: '7px 12px', borderRadius: 8, border: `1px solid ${t.border}`, fontSize: 12.5, color: t.textPrimary, background: t.cardBg, outline: 'none', cursor: 'pointer' },

  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 },

  card: { background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' },

  cardImgWrap: { position: 'relative', width: '100%', height: 100, background: t.sidebarBg },
  cardImg:     { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  cardImgPh:   { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 700, color: t.brand, background: t.brandSoft },

  kindBadge:   { position: 'absolute', top: 8, left: 8, padding: '2px 8px', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)', borderRadius: 20, fontSize: 10, fontWeight: 600, color: '#fff' },
  statusBadge: { position: 'absolute', top: 8, right: 8, padding: '2px 7px', borderRadius: 20, fontSize: 10, fontWeight: 700 },

  cardBody:    { padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 7, flex: 1 },
  cardName:    {
    fontWeight: 600, fontSize: 13, color: t.textPrimary, lineHeight: 1.3,
    display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical',
    overflow: 'hidden', textOverflow: 'ellipsis',
  },
  cardDesc:    {
    fontSize: 11, color: t.textSecondary, lineHeight: 1.35,
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
    overflow: 'hidden', textOverflow: 'ellipsis',
  },

  detailList:  { display: 'flex', flexDirection: 'column', gap: 3 },
  detailRow:   { display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11, color: t.textMuted },
  detailIcon:  { flexShrink: 0, fontSize: 11, lineHeight: '16px' },
  detailText:  { lineHeight: 1.35 },

  cardFooter:  { marginTop: 'auto', paddingTop: 8, borderTop: `1px solid ${t.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  cardVisits:  { fontSize: 11, fontWeight: 600, color: t.textPrimary },
  btnView:     { padding: '4px 10px', background: t.brandSoft, color: t.brand, border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 11, cursor: 'pointer' },

  // ── Field diff list (expanded detail) ──────────────────────
  fieldList: { display: 'flex', flexDirection: 'column', borderTop: `1px solid ${t.divider}`, marginTop: 1 },

  fieldRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: `1px solid ${t.divider}`, fontSize: 11, flexWrap: 'wrap' },
  fieldLabel: { fontSize: 9.5, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', width: 80, flexShrink: 0 },

  oldText: { color: t.textMuted, textDecoration: 'line-through' },
  newText: { color: t.brand, fontWeight: 600 },
  arrow:   { color: t.textMuted, fontSize: 11, flexShrink: 0 },
  emptyDash: { color: t.textMuted },

  thumbPair: { display: 'flex', alignItems: 'center', gap: 8 },
  thumbLink: { display: 'block', lineHeight: 0 },
  thumb:     { width: 40, height: 40, objectFit: 'cover', borderRadius: 6, border: `1px solid ${t.border}` },
  thumbEmpty: { display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.textMuted, fontSize: 12, background: t.sidebarBg },

  linkPair: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  linkOld:  { fontSize: 11.5, color: t.textMuted, textDecoration: 'line-through' },
  linkNew:  { fontSize: 11.5, color: t.brand, fontWeight: 600, textDecoration: 'underline' },

  longBlock: { padding: '9px 0', borderBottom: `1px solid ${t.divider}` },
  longOldBox: { fontSize: 11.5, color: t.textMuted, textDecoration: 'line-through', lineHeight: 1.5, marginTop: 4, whiteSpace: 'pre-wrap' },
  longNewBox: { fontSize: 11.5, color: t.brand, lineHeight: 1.5, marginTop: 4, whiteSpace: 'pre-wrap', fontWeight: 500 },

  emptyCard:  { padding: 44, textAlign: 'center', color: t.textSecondary, background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 12, width: '100%', boxSizing: 'border-box' },
};
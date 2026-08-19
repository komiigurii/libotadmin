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

// Fields whose values are long/multi-line — get a full-width stacked block
const LONG_FIELDS = new Set(['description', 'history', 'recommendations', 'trivia']);
// Fields that are actual images — get a visual thumbnail comparison
const THUMB_FIELDS = new Set(['image', 'Badge']);
// Fields that are non-image asset URLs (.glb) — get a filename link, no thumbnail
const FILE_LINK_FIELDS = new Set(['modelUrl', 'AR3DModelURL']);

function toArray(data) {
  if (!data) return [];
  if (Array.isArray(data))         return data;
  if (Array.isArray(data.reviews)) return data.reviews;
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

export default function ModRequests() {
  const [requests, setRequests] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [acting, setActing] = useState(null);
  // Per-request admin override for the account action to apply on approval.
  // Keyed by `${kind}-${id}`. Defaults to the mod's proposedAction if present.
  const [actionOverrides, setActionOverrides] = useState({});

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [commentsData, pendingSpotsData, accountActionsData] = await Promise.all([
        commentAPI.getAll(),
        spotAPI.getPending(),
        accountActionAPI.getAll(),
      ]);

      const commentReqs = toArray(commentsData)
        .filter(c => (c.flagStatus || 'none') !== 'none')
        .map(c => ({
          kind: 'comment',
          id: c._id,
          status: c.flagStatus,
          title: c.flaggedByName || 'Moderator',
          subtitle: (c.spotId && typeof c.spotId === 'object' ? c.spotId.name : '') || '—',
          date: c.flaggedAt || c.createdAt,
          body: c,
        }));

      const spotItems = toArray(pendingSpotsData.items || pendingSpotsData)
        .filter(spot => spot.pendingChange)
        .map(spot => ({
          kind: 'spot',
          id: spot._id,
          status: 'pending',
          title: 'Spot edit request',
          subtitle: spot.name || '—',
          date: spot.pendingChange.submittedAt,
          body: spot,
        }));

      const accountItems = toArray(accountActionsData)
        .map(a => ({
          kind: 'account',
          id: a._id,
          status: a.status,
          title: a.proposedByName || 'Moderator',
          subtitle: a.targetName || a.clerkUserId,
          date: a.proposedAt || a.createdAt,
          body: a,
        }));

      const all = [...commentReqs, ...spotItems, ...accountItems].sort((a, b) => new Date(b.date) - new Date(a.date));
      setRequests(all);
    } catch {
      setError('Failed to load mod requests.');
      setRequests([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const visible = requests.filter(r => !statusFilter || r.status === statusFilter);
  const pendingCount = requests.filter(r => r.status === 'pending').length;

  const decideComment = async (id, decision, actionType) => {
    setActing(id);
    try {
      const data = await commentAPI.decide(id, decision, actionType || 'none');
      if (data?.success !== false) load();
      else alert('Failed: ' + (data?.message || 'Unknown error'));
    } catch { alert('Network error'); }
    setActing(null);
  };

  const decideSpot = async (id, action) => {
    setActing(id);
    try {
      const data = await spotAPI.reviewChange(id, action);
      if (data?.success !== false) load();
      else alert('Failed: ' + (data?.message || 'Unknown error'));
    } catch { alert('Network error'); }
    setActing(null);
  };

  const decideAccount = async (id, decision) => {
    setActing(id);
    try {
      const data = await accountActionAPI.decide(id, decision);
      if (data?.success !== false) load();
      else alert('Failed: ' + (data?.message || 'Unknown error'));
    } catch { alert('Network error'); }
    setActing(null);
  };

  return (
    <div style={s.page}>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>Mod Requests</h1>
          <p style={s.pageSub}>Comment flags, account actions, and spot edit proposals submitted by moderators</p>
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
        <div style={s.empty}>Loading…</div>
      ) : error ? (
        <div style={{ ...s.empty, color: t.danger }}>{error}</div>
      ) : visible.length === 0 ? (
        <div style={s.emptyState}>
          <div style={s.emptyIcon}>✓</div>
          <div style={s.emptyText}>No requests found</div>
          <div style={s.emptySub}>All caught up for this filter.</div>
        </div>
      ) : (
        visible.map(r => {
          const pill = STATUS_PILL[r.status] || STATUS_PILL.pending;
          const isPending = r.status === 'pending';
          const isActing = acting === r.id;
          const overrideKey = `${r.kind}-${r.id}`;
          const kindLabel = r.kind === 'spot' ? 'Spot edit' : r.kind === 'account' ? 'Account action' : 'Comment flag';

          return (
            <div key={`${r.kind}-${r.id}`} style={s.card}>

              {/* Header: eyebrow + status on one line, heading below, date pinned top-right */}
              <div style={s.cardHead}>
                <div style={{ minWidth: 0 }}>
                  <div style={s.eyebrowRow}>
                    <span style={s.eyebrow}>{kindLabel}</span>
                    <span style={{ ...s.statusPill, background: pill.background, color: pill.color }}>{pill.label}</span>
                  </div>
                  <div style={s.heading}>
                    {r.kind === 'spot' && r.subtitle}
                    {r.kind === 'comment' && (
                      <>{r.title} <span style={s.headingMuted}>flagged a review on</span> {r.subtitle}</>
                    )}
                    {r.kind === 'account' && (
                      <>{r.title} <span style={s.headingMuted}>proposed suspending</span> {r.subtitle}</>
                    )}
                  </div>
                </div>
                <span style={s.dateText}>
                  {r.date ? new Date(r.date).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                </span>
              </div>

              {r.kind === 'comment' && (
                <div style={s.commentBody}>
                  <p style={s.quote}>"{(r.body.comment || '').slice(0, 140)}{(r.body.comment || '').length > 140 ? '…' : ''}"</p>
                  {r.body.flagReason && <p style={s.modNote}><span style={s.modNoteLabel}>Mod's note </span>{r.body.flagReason}</p>}
                </div>
              )}

              {r.kind === 'account' && (
                <div style={s.commentBody}>
                  <p style={s.modNote}><span style={s.modNoteLabel}>Reason </span>{r.body.reason}</p>
                  <p style={s.modNote}><span style={s.modNoteLabel}>Source </span>{r.body.sourceType === 'inactivity' ? 'Account inactivity' : 'Manual'}</p>
                  {r.status !== 'pending' && r.body.resultSummary && (
                    <p style={s.modNote}><span style={s.modNoteLabel}>Result </span>{r.body.resultSummary}</p>
                  )}
                </div>
              )}

              {r.kind === 'spot' && (
                <div style={s.fieldList}>
                  {Object.entries(r.body.pendingChange)
                    .filter(([k]) => k !== 'submittedBy' && k !== 'submittedAt')
                    .map(([k, newVal]) => (
                      <DiffField key={k} fieldKey={k} oldVal={r.body[k]} newVal={newVal} />
                    ))}
                </div>
              )}

              {isPending && r.kind === 'comment' && (
                <div style={s.actionRow}>
                  <span style={s.actionRowLabel}>Account action on approve</span>
                  <select
                    value={actionOverrides[overrideKey] ?? (r.body.proposedAction || '')}
                    onChange={e => setActionOverrides(prev => ({ ...prev, [overrideKey]: e.target.value }))}
                    style={s.actionSelect}
                  >
                    <option value="">No account action</option>
                    <option value="warn">Warn (mute)</option>
                    <option value="suspend">Suspend</option>
                  </select>
                  {r.body.proposedAction && (
                    <span style={s.suggestedTag}>Mod suggested: {ACTION_LABELS[r.body.proposedAction]}</span>
                  )}
                </div>
              )}

              {isPending && (
                <div style={s.actions}>
                  <button
                    disabled={isActing}
                    onClick={() => {
                      if (r.kind === 'comment') decideComment(r.id, 'approved', actionOverrides[overrideKey] ?? r.body.proposedAction);
                      else if (r.kind === 'account') decideAccount(r.id, 'approved');
                      else decideSpot(r.id, 'approve');
                    }}
                    style={{ ...s.btn, ...s.btnApprove, opacity: isActing ? 0.6 : 1 }}
                  >
                    Approve
                  </button>
                  <button
                    disabled={isActing}
                    onClick={() => {
                      if (r.kind === 'comment') decideComment(r.id, 'rejected');
                      else if (r.kind === 'account') decideAccount(r.id, 'rejected');
                      else decideSpot(r.id, 'reject');
                    }}
                    style={{ ...s.btn, ...s.btnDisapprove, opacity: isActing ? 0.6 : 1 }}
                  >
                    Disapprove
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

const s = {
  page:       { padding: '16px 20px', maxWidth: 900, margin: '0 auto' },
  pageHeader: { marginBottom: 14 },
  pageTitle:  { fontSize: 17, fontWeight: 600, color: t.textPrimary, marginBottom: 2 },
  pageSub:    { fontSize: 11.5, color: t.textSecondary },

  filterRow:  { marginBottom: 12 },
  select:     { padding: '6px 10px', borderRadius: 7, border: `1px solid ${t.border}`, fontSize: 11.5, color: t.textPrimary, background: t.cardBg, outline: 'none', cursor: 'pointer' },

  card: { background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, padding: '14px 16px', marginBottom: 10 },

  cardHead:   { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  eyebrowRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 },
  eyebrow:    { fontSize: 10, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' },
  statusPill: { padding: '2px 8px', borderRadius: 20, fontSize: 9.5, fontWeight: 700 },
  heading:      { fontSize: 14, fontWeight: 700, color: t.textPrimary, lineHeight: 1.3 },
  headingMuted: { fontWeight: 400, color: t.textSecondary },
  dateText:   { fontSize: 10.5, color: t.textMuted, flexShrink: 0, whiteSpace: 'nowrap', paddingTop: 2 },

  commentBody: { borderTop: `1px solid ${t.divider}`, paddingTop: 10 },
  quote:      { fontSize: 12, color: t.textSecondary, fontStyle: 'italic', margin: '0 0 4px', lineHeight: 1.4 },
  modNote:    { fontSize: 10.5, color: t.textMuted, margin: '0 0 2px' },
  modNoteLabel: { fontWeight: 600, color: t.textSecondary },

  actionRow:   { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10, paddingTop: 10, borderTop: `1px solid ${t.divider}` },
  actionRowLabel: { fontSize: 10.5, fontWeight: 600, color: t.textSecondary },
  actionSelect: { padding: '5px 9px', borderRadius: 6, border: `1px solid ${t.border}`, fontSize: 11, color: t.textPrimary, background: t.sidebarBg, outline: 'none', cursor: 'pointer' },
  suggestedTag: { fontSize: 10, fontWeight: 600, color: t.warning, background: t.warningBg, padding: '3px 8px', borderRadius: 6 },

  // ── Field diff list ─────────────────────────────────────────
  fieldList: { display: 'flex', flexDirection: 'column', borderTop: `1px solid ${t.divider}` },

  fieldRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: `1px solid ${t.divider}`, fontSize: 12, flexWrap: 'wrap' },
  fieldLabel: { fontSize: 10, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', width: 92, flexShrink: 0 },

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

  actions:    { display: 'flex', gap: 8, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${t.divider}` },
  btn:        { padding: '7px 16px', borderRadius: 7, fontWeight: 600, fontSize: 11.5, cursor: 'pointer', border: 'none' },
  btnApprove: { background: t.successBg, color: t.success },
  btnDisapprove: { background: t.dangerBg, color: t.danger },

  empty:      { padding: 40, textAlign: 'center', color: t.textSecondary },
  emptyState: { textAlign: 'center', padding: '50px 16px' },
  emptyIcon:  { width: 42, height: 42, borderRadius: '50%', background: t.brandSoft, color: t.brand, fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' },
  emptyText:  { fontSize: 14, fontWeight: 600, color: t.textPrimary, marginBottom: 4 },
  emptySub:   { fontSize: 11.5, color: t.textSecondary },
};
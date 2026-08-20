import { useEffect, useState } from 'react';
import { spotAPI, accountActionAPI } from '../api/api';
import { theme as t } from '../theme';

const STATUS_PILL = {
  pending:  { background: t.purpleBg,  color: t.purple,  label: 'PENDING' },
  approved: { background: t.successBg, color: t.success, label: 'APPROVED' },
  rejected: { background: t.dangerBg,  color: t.danger,  label: 'REJECTED' },
};

const KIND_LABELS = { spot: 'Spot edit', account: 'Account action' };

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
  if (Array.isArray(data.actions)) return data.actions;
  if (Array.isArray(data.data))    return data.data;
  return [];
}

const initialsOf = (name) =>
  (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('');

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
  const [expandedKey, setExpandedKey] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [pendingSpotsData, accountActionsData] = await Promise.all([
        spotAPI.getPending(),
        accountActionAPI.getAll(),
      ]);

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

      const all = [...spotItems, ...accountItems].sort((a, b) => new Date(b.date) - new Date(a.date));
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
          <p style={s.pageSub}>Account actions and spot edit proposals submitted by moderators</p>
        </div>
        <span style={s.totalBadge}>{requests.length} total</span>
      </div>

      <div style={s.filterRow}>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={s.filterSelect}>
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
          const key = `${r.kind}-${r.id}`;
          const isExpanded = expandedKey === key;

          const avatarName = r.subtitle;
          const primaryName = avatarName || '—';
          const byLine = r.kind === 'spot' ? null : r.title; // who proposed this

          return (
            <div key={key} style={s.card}>
              <div style={s.cardTop} onClick={() => setExpandedKey(isExpanded ? null : key)}>
                <div style={s.avatar}>{initialsOf(avatarName)}</div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={s.metaRow}>
                    <span style={s.userName}>{primaryName}</span>
                    <span style={s.dateText}>
                      {r.date ? new Date(r.date).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </span>
                    <span style={s.locPill}>{KIND_LABELS[r.kind]}</span>
                    <span style={{ ...s.statusPill, background: pill.background, color: pill.color }}>{pill.label}</span>
                  </div>

                  {byLine && (
                    <p style={s.byLine}><span style={s.byLineLabel}>Proposed by </span>{byLine}</p>
                  )}

                  {r.kind === 'account' && (
                    <p style={s.commentText}>{r.body.reason}</p>
                  )}
                  {r.kind === 'spot' && (
                    <p style={s.commentText}>Proposed changes to this spot's details.</p>
                  )}

                  <div style={s.reactRow}>
                    {r.kind === 'account' && (
                      <span style={s.react}>{r.body.sourceType === 'inactivity' ? '⏱ Account inactivity' : '✋ Manual'}</span>
                    )}
                    {r.status !== 'pending' && r.body.resultSummary && (
                      <span style={s.react}>✅ {r.body.resultSummary}</span>
                    )}
                  </div>
                </div>
              </div>

              {isExpanded && r.kind === 'spot' && (
                <div style={s.fieldList}>
                  {Object.entries(r.body.pendingChange)
                    .filter(([k]) => k !== 'submittedBy' && k !== 'submittedAt')
                    .map(([k, newVal]) => (
                      <DiffField key={k} fieldKey={k} oldVal={r.body[k]} newVal={newVal} />
                    ))}
                </div>
              )}

              {isPending && (
                <div style={s.panel}>
                  <div style={s.actions}>
                    <button
                      disabled={isActing}
                      onClick={() => {
                        if (r.kind === 'account') decideAccount(r.id, 'approved');
                        else decideSpot(r.id, 'approve');
                      }}
                      style={{ ...s.btn, ...s.btnApprove, opacity: isActing ? 0.6 : 1 }}
                    >
                      Approve
                    </button>
                    <button
                      disabled={isActing}
                      onClick={() => {
                        if (r.kind === 'account') decideAccount(r.id, 'rejected');
                        else decideSpot(r.id, 'reject');
                      }}
                      style={{ ...s.btn, ...s.btnDisapprove, opacity: isActing ? 0.6 : 1 }}
                    >
                      Disapprove
                    </button>
                  </div>
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
  page:       { padding: '28px 32px', maxWidth: 1100, margin: '0 auto' },
  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  pageTitle:  { fontSize: 22, fontWeight: 600, color: t.textPrimary, marginBottom: 4 },
  pageSub:    { fontSize: 13, color: t.textSecondary },
  totalBadge: { fontSize: 13, color: t.textMuted, fontWeight: 500, paddingTop: 4 },

  filterRow:    { marginBottom: 18 },
  filterSelect: { padding: '10px 14px', borderRadius: 10, border: `1px solid ${t.border}`, fontSize: 13, color: t.textPrimary, background: t.cardBg, outline: 'none', cursor: 'pointer' },

  card:       { background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 14, marginBottom: 10, overflow: 'hidden' },
  cardTop:    { display: 'flex', alignItems: 'flex-start', gap: 14, padding: '16px 18px', cursor: 'pointer' },
  avatar:     { width: 38, height: 38, borderRadius: '50%', background: t.brandSoft, color: t.brand, fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  metaRow:    { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 },
  userName:   { fontSize: 14, fontWeight: 700, color: t.textPrimary },
  dateText:   { fontSize: 12, color: t.textMuted },
  locPill:    { padding: '3px 10px', background: t.sidebarBg, border: `1px solid ${t.border}`, borderRadius: 20, fontSize: 11, fontWeight: 500, color: t.textSecondary },
  statusPill: { padding: '3px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700, letterSpacing: '0.03em' },

  byLine:      { fontSize: 11.5, color: t.textMuted, margin: '0 0 4px' },
  byLineLabel: { fontWeight: 600, color: t.textSecondary },

  commentText:{ fontSize: 14, color: t.textSecondary, lineHeight: 1.5, margin: '2px 0 8px' },
  reactRow:   { display: 'flex', gap: 14, flexWrap: 'wrap' },
  react:      { fontSize: 12, color: t.textMuted },

  panel:      { borderTop: `1px solid ${t.divider}`, padding: '14px 18px 18px', background: t.sidebarBg },
  panelLabel: { fontSize: 12, fontWeight: 600, color: t.textPrimary, margin: '0 0 6px' },
  select:     { width: '100%', padding: '9px 12px', borderRadius: 8, border: `1.5px solid ${t.border}`, fontSize: 13, color: t.textPrimary, background: t.cardBg, outline: 'none', boxSizing: 'border-box', cursor: 'pointer' },
  suggestedNote: { fontSize: 11, fontWeight: 600, color: t.warning, margin: '8px 0 0' },

  actions:    { display: 'flex', gap: 8, marginTop: 10 },
  btn:        { padding: '8px 18px', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', border: 'none' },
  btnApprove: { background: t.successBg, color: t.success },
  btnDisapprove: { background: t.dangerBg, color: t.danger },

  // ── Field diff list (spot edits, expanded) ─────────────────
  fieldList: { display: 'flex', flexDirection: 'column', borderTop: `1px solid ${t.divider}`, padding: '4px 18px' },

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

  empty:      { padding: 60, textAlign: 'center', color: t.textSecondary },
  emptyState: { textAlign: 'center', padding: '70px 20px' },
  emptyIcon:  { width: 52, height: 52, borderRadius: '50%', background: t.brandSoft, color: t.brand, fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' },
  emptyText:  { fontSize: 16, fontWeight: 600, color: t.textPrimary, marginBottom: 6 },
  emptySub:   { fontSize: 13, color: t.textSecondary },
};
import { useEffect, useState } from 'react';
import { commentAPI, spotAPI } from '../api/api';
import { theme as t } from '../theme';

const STATUS_PILL = {
  pending:  { background: t.warningBg, color: t.warning, label: 'PENDING' },
  approved: { background: t.successBg, color: t.success, label: 'APPROVED' },
  rejected: { background: t.dangerBg,  color: t.danger,  label: 'REJECTED' },
};

const FIELD_LABELS = {
  name: 'Name', location: 'Location', category: 'Category', description: 'Description',
  history: 'History', recommendations: 'Recommendations', visitingHours: 'Visiting Hours',
  entranceFee: 'Entrance Fee', image: 'Image', modelUrl: 'Model URL', AR3DModelURL: 'AR Model URL',
  Badge: 'Badge', City: 'City', coordinates: 'Coordinates', modelsCoordinates: 'AR Positions', trivia: 'Trivia',
};

function toArray(data) {
  if (!data) return [];
  if (Array.isArray(data))         return data;
  if (Array.isArray(data.reviews)) return data.reviews;
  if (Array.isArray(data.data))    return data.data;
  return [];
}

function fmtVal(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export default function ModRequests() {
  const [requests, setRequests] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [acting, setActing] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [commentsData, pendingSpotsData] = await Promise.all([
        commentAPI.getAll(),
        spotAPI.getPending(),
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

      const all = [...commentReqs, ...spotItems].sort((a, b) => new Date(b.date) - new Date(a.date));
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

  const decideComment = async (id, decision) => {
    setActing(id);
    try {
      const data = await commentAPI.decide(id, decision);
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

  return (
    <div style={s.page}>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>Mod Requests</h1>
          <p style={s.pageSub}>Comment flags and spot edit proposals submitted by moderators</p>
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

          return (
            <div key={`${r.kind}-${r.id}`} style={s.card}>
              <div style={s.cardTop}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={s.metaRow}>
                    {r.kind === 'spot' && <span style={s.typeTag}>SPOT EDIT</span>}
                    <span style={s.modName}>{r.title}</span>
                    <span style={s.spotName}>{r.subtitle}</span>
                    <span style={{ ...s.statusPill, background: pill.background, color: pill.color }}>{pill.label}</span>
                  </div>

                  {r.kind === 'comment' ? (
                    <>
                      <p style={s.quote}>"{(r.body.comment || '').slice(0, 140)}{(r.body.comment || '').length > 140 ? '…' : ''}"</p>
                      {r.body.flagReason && <p style={s.modNote}><span style={s.modNoteLabel}>Mod's note: </span>{r.body.flagReason}</p>}
                    </>
                  ) : (
                    <div style={s.diffList}>
                      {Object.entries(r.body.pendingChange)
                        .filter(([k]) => k !== 'submittedBy' && k !== 'submittedAt')
                        .map(([k, newVal]) => (
                          <div key={k} style={s.diffRow}>
                            <span style={s.diffLabel}>{FIELD_LABELS[k] || k}</span>
                            <span style={s.diffOld}>{fmtVal(r.body[k])}</span>
                            <span style={s.diffArrow}>→</span>
                            <span style={s.diffNew}>{fmtVal(newVal)}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
                <span style={s.dateText}>
                  {r.date ? new Date(r.date).toLocaleString('en-PH', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                </span>
              </div>

              {isPending && (
                <div style={s.actions}>
                  <button
                    disabled={isActing}
                    onClick={() => r.kind === 'comment' ? decideComment(r.id, 'approved') : decideSpot(r.id, 'approve')}
                    style={{ ...s.btn, ...s.btnApprove, opacity: isActing ? 0.6 : 1 }}
                  >
                    ✓ Approve
                  </button>
                  <button
                    disabled={isActing}
                    onClick={() => r.kind === 'comment' ? decideComment(r.id, 'rejected') : decideSpot(r.id, 'reject')}
                    style={{ ...s.btn, ...s.btnDisapprove, opacity: isActing ? 0.6 : 1 }}
                  >
                    ✕ Disapprove
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

  card:       { background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, padding: '11px 13px', marginBottom: 8 },
  cardTop:    { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  metaRow:    { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 },
  typeTag:    { padding: '2px 8px', background: t.purpleBg, color: t.purple, borderRadius: 6, fontSize: 9, fontWeight: 700, letterSpacing: '0.02em' },
  modName:    { fontSize: 12, fontWeight: 700, color: t.textPrimary },
  spotName:   { fontSize: 11.5, color: t.brand, fontWeight: 500 },
  statusPill: { padding: '2px 8px', borderRadius: 6, fontSize: 9, fontWeight: 700, letterSpacing: '0.02em' },
  dateText:   { fontSize: 10.5, color: t.textMuted, flexShrink: 0, whiteSpace: 'nowrap' },
  quote:      { fontSize: 12, color: t.textSecondary, fontStyle: 'italic', margin: '0 0 4px', lineHeight: 1.4 },
  modNote:    { fontSize: 10.5, color: t.textMuted, margin: 0 },
  modNoteLabel: { fontWeight: 600, color: t.textSecondary },

  diffList:   { display: 'flex', flexDirection: 'column', gap: 3, marginTop: 2 },
  diffRow:    { display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 11, flexWrap: 'wrap' },
  diffLabel:  { fontWeight: 600, color: t.textPrimary, minWidth: 84, flexShrink: 0 },
  diffOld:    { color: t.textMuted, textDecoration: 'line-through' },
  diffArrow:  { color: t.textMuted },
  diffNew:    { color: t.success, fontWeight: 600 },

  actions:    { display: 'flex', gap: 6, marginTop: 10 },
  btn:        { padding: '6px 15px', borderRadius: 7, fontWeight: 600, fontSize: 11.5, cursor: 'pointer', border: 'none' },
  btnApprove: { background: t.successBg, color: t.success },
  btnDisapprove: { background: t.dangerBg, color: t.danger },

  empty:      { padding: 40, textAlign: 'center', color: t.textSecondary },
  emptyState: { textAlign: 'center', padding: '50px 16px' },
  emptyIcon:  { width: 42, height: 42, borderRadius: '50%', background: t.brandSoft, color: t.brand, fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' },
  emptyText:  { fontSize: 14, fontWeight: 600, color: t.textPrimary, marginBottom: 4 },
  emptySub:   { fontSize: 11.5, color: t.textSecondary },
};
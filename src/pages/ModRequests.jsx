import { useEffect, useState } from 'react';
import { spotAPI, accountActionAPI, missionAPI } from '../api/api';
import { theme as t, radius, shadow } from '../theme';

const STATUS_PILL = {
  pending:  { background: t.purpleBg,  color: t.purple,  label: 'PENDING' },
  approved: { background: t.successBg, color: t.success, label: 'APPROVED' },
  rejected: { background: t.dangerBg,  color: t.danger,  label: 'REJECTED' },
};

const KIND_LABELS = {
  spot:          'Spot edit',
  'spot-delete': 'Spot deletion',
  'spot-proposal': 'New spot',
  account:       'Account action',
  'mission-location': 'Food mission location',
};

const MISSION_FIELD_LABELS = {
  locationName: 'Restaurant name',
  image:        'Restaurant photo',
  locationInfo: 'Restaurant info',
  coordinates:  'Coordinates',
  radiusMeters: 'Radius (m)',
};

const FIELD_LABELS = {
  name: 'Name', location: 'Location', category: 'Category', description: 'Description',
  history: 'History', recommendations: 'Recommendations', visitingHours: 'Visiting Hours',
  entranceFee: 'Entrance Fee', image: 'Image', modelUrl: 'Model URL', AR3DModelURL: 'AR Model URL',
  Badge: 'Badge', City: 'City', coordinates: 'Coordinates', modelsCoordinates: 'AR Positions', trivia: 'Trivia',
};

const LONG_FIELDS = new Set(['description', 'history', 'recommendations', 'trivia', 'locationInfo']);
const THUMB_FIELDS = new Set(['image', 'Badge']);
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

function DiffField({ fieldKey, oldVal, newVal, labelMap = FIELD_LABELS }) {
  const label = labelMap[fieldKey] || fieldKey;
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

// New-spot proposals have no "old" value to diff against — every
// submitted field is just shown as-is.
function ProposalFieldList({ proposal }) {
  const keys = Object.keys(FIELD_LABELS).filter(k => {
    const v = proposal[k];
    return v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);
  });

  if (!keys.length) return null;

  return (
    <div style={s.fieldList}>
      {keys.map(k => (
        <div style={s.fieldRow} key={k}>
          <span style={s.fieldLabel}>{FIELD_LABELS[k]}</span>
          <span style={s.newText}>{fmtVal(k, proposal[k])}</span>
        </div>
      ))}
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
      const [pendingProposalsData, pendingSpotsData, accountActionsData, missionProposalsData] = await Promise.all([
        spotAPI.getPendingProposals(),  // { success, proposals }
        spotAPI.getPending(),           // { success, items }
        accountActionAPI.getAll(),
        missionAPI.getProposals(),      // [] of missions with a pendingChange
      ]);

      const pendingProposals = toArray(pendingProposalsData.proposals || pendingProposalsData);
      const pendingSpots     = toArray(pendingSpotsData.items || pendingSpotsData);

      const proposalItems = pendingProposals.map(proposal => ({
        kind: 'spot-proposal',
        id: proposal._id,
        status: proposal.status || 'pending',
        title: 'New Spot Proposal',
        subtitle: proposal.name || '—',
        date: proposal.submittedAt || proposal.createdAt,
        body: proposal,
      }));

      const editItems = pendingSpots
        .filter(spot => spot.pendingChange && !spot.pendingDelete)
        .map(spot => ({
          kind: 'spot',
          id: spot._id,
          status: 'pending',
          title: 'Spot edit request',
          subtitle: spot.name || '—',
          date: spot.pendingChange?.submittedAt,
          body: spot,
        }));

      const deleteItems = pendingSpots
        .filter(spot => spot.pendingDelete)
        .map(spot => ({
          kind: 'spot-delete',
          id: spot._id,
          status: 'pending',
          title: 'Spot deletion request',
          subtitle: spot.name || '—',
          date: spot.pendingDeleteAt,
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

      const missionLocationItems = toArray(missionProposalsData)
        .map(mission => ({
          kind: 'mission-location',
          id: mission._id,
          status: 'pending',
          title: 'Food mission location',
          subtitle: mission.spotId?.name || mission.title || '—',
          date: mission.pendingChange?.submittedAt,
          body: mission,
        }));

      const all = [...proposalItems, ...editItems, ...deleteItems, ...accountItems, ...missionLocationItems]
        .sort((a, b) => new Date(b.date) - new Date(a.date));
      setRequests(all);
    } catch (err) {
      console.error(err);
      setError('Failed to load mod requests.');
      setRequests([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const visible = requests.filter(r => !statusFilter || r.status === statusFilter);
  const pendingCount = requests.filter(r => r.status === 'pending').length;

  // Approve/reject a NEW spot proposal
  const decideProposal = async (id, action) => {
    setActing(id);
    try {
      const data = await spotAPI.reviewProposal(id, action);
      if (data?.success !== false) await load();
      else alert('Failed: ' + (data?.message || 'Unknown error'));
    } catch (err) {
      console.error(err);
      alert('Network error');
    }
    setActing(null);
  };

  // Approve/reject an EXISTING spot's edit or deletion request
  const decideSpot = async (id, action) => {
    setActing(id);
    try {
      const data = await spotAPI.reviewChange(id, action);
      if (data?.success !== false) await load();
      else alert('Failed: ' + (data?.message || 'Unknown error'));
    } catch (err) {
      console.error(err);
      alert('Network error');
    }
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

  // Approve/reject a proposed food-mission location change
  const decideMissionLocation = async (id, action) => {
    setActing(id);
    try {
      const data = await missionAPI.reviewLocation(id, action);
      if (data?.success !== false) await load();
      else alert('Failed: ' + (data?.message || 'Unknown error'));
    } catch (err) {
      console.error(err);
      alert('Network error');
    }
    setActing(null);
  };

  return (
    <div style={s.page}>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>Mod Requests</h1>
          <p style={s.pageSub}>Account actions, spot edit/deletion proposals, and food mission locations submitted by moderators</p>
        </div>
        <span style={s.totalBadge}>{requests.length} total</span>
      </div>

      <div style={s.filterRow}>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={s.filterSelect} className="modern-input">
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
          const isDeleteRequest = r.kind === 'spot-delete';
          const isNewProposal = r.kind === 'spot-proposal';

          const avatarName = r.subtitle;
          const primaryName = avatarName || '—';
          const isMissionLocation = r.kind === 'mission-location';
          const byLine = r.kind === 'spot' || r.kind === 'spot-delete' || r.kind === 'spot-proposal' || isMissionLocation ? null : r.title;

          const handleApprove = () => {
            if (r.kind === 'account') decideAccount(r.id, 'approved');
            else if (isNewProposal) decideProposal(r.id, 'approve');
            else if (isMissionLocation) decideMissionLocation(r.id, 'approve');
            else decideSpot(r.id, 'approve');
          };

          const handleReject = () => {
            if (r.kind === 'account') decideAccount(r.id, 'rejected');
            else if (isNewProposal) decideProposal(r.id, 'reject');
            else if (isMissionLocation) decideMissionLocation(r.id, 'reject');
            else decideSpot(r.id, 'reject');
          };

          return (
            <div key={key} style={s.card} className="modern-card">
              <div style={s.cardTop} onClick={() => setExpandedKey(isExpanded ? null : key)}>
                <div style={{ ...s.avatar, ...(isDeleteRequest ? s.avatarDanger : {}) }}>
                  {isDeleteRequest ? '🗑️' : initialsOf(avatarName)}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={s.metaRow}>
                    <span style={s.userName}>{primaryName}</span>
                    <span style={s.dateText}>
                      {r.date ? new Date(r.date).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </span>
                    <span style={{ ...s.locPill, ...(isDeleteRequest ? s.locPillDanger : {}) }}>{KIND_LABELS[r.kind]}</span>
                    <span style={{ ...s.statusPill, background: pill.background, color: pill.color }}>{pill.label}</span>
                  </div>

                  {byLine && (
                    <p style={s.byLine}><span style={s.byLineLabel}>Proposed by </span>{byLine}</p>
                  )}

                  {r.kind === 'account' && (
                    <p style={s.commentText}>{r.body.reason}</p>
                  )}
                  {r.kind === 'spot-proposal' && (
                    <p style={s.commentText}>New spot submitted for review — expand to see details.</p>
                  )}
                  {r.kind === 'spot' && (
                    <p style={s.commentText}>Proposed changes to this spot's details.</p>
                  )}
                  {r.kind === 'spot-delete' && (
                    <p style={s.commentText}>
                      {r.body.pendingDeleteReason
                        ? `Reason: ${r.body.pendingDeleteReason}`
                        : 'No reason provided.'}
                    </p>
                  )}
                  {isMissionLocation && (
                    <p style={s.commentText}>
                      Proposed food-recommendation location for this spot's 2nd mission — expand to see details.
                    </p>
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

              {isExpanded && r.kind === 'spot-proposal' && (
                <ProposalFieldList proposal={r.body} />
              )}

              {isExpanded && r.kind === 'spot-delete' && (
                <div style={s.fieldList}>
                  <div style={s.deleteNotice}>
                    Approving this will permanently delete <strong>{r.body.name}</strong> and cannot be undone.
                  </div>
                </div>
              )}

              {isExpanded && isMissionLocation && (
                <div style={s.fieldList}>
                  <p style={s.byLine}>
                    <span style={s.byLineLabel}>Mission: </span>{r.body.title}
                  </p>
                  {Object.entries(r.body.pendingChange || {})
                    .filter(([k]) => ['locationName', 'image', 'locationInfo', 'coordinates', 'radiusMeters'].includes(k))
                    .map(([k, newVal]) => (
                      <DiffField key={k} fieldKey={k} oldVal={r.body[k]} newVal={newVal} labelMap={MISSION_FIELD_LABELS} />
                    ))}
                </div>
              )}

              {isPending && (
                <div style={s.panel}>
                  <div style={s.actions}>
                    <button
                      disabled={isActing}
                      onClick={handleApprove}
                      style={{ ...s.btn, ...(isDeleteRequest ? s.btnApproveDelete : s.btnApprove), opacity: isActing ? 0.6 : 1 }}
                      className="modern-btn"
                    >
                      {isDeleteRequest ? 'Approve & Delete' : 'Approve'}
                    </button>
                    <button
                      disabled={isActing}
                      onClick={handleReject}
                      style={{ ...s.btn, ...s.btnDisapprove, opacity: isActing ? 0.6 : 1 }}
                      className="modern-btn"
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

  card:       { background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: radius.xl, marginBottom: 12, overflow: 'hidden', boxShadow: shadow.sm },
  cardTop:    { display: 'flex', alignItems: 'flex-start', gap: 14, padding: '16px 18px', cursor: 'pointer' },
  avatar:     { width: 38, height: 38, borderRadius: '50%', background: t.brandSoft, color: t.brand, fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarDanger: { background: t.dangerBg, color: t.danger, fontSize: 16 },
  metaRow:    { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 },
  userName:   { fontSize: 14, fontWeight: 700, color: t.textPrimary },
  dateText:   { fontSize: 12, color: t.textMuted },
  locPill:    { padding: '3px 10px', background: t.sidebarBg, border: `1px solid ${t.border}`, borderRadius: 20, fontSize: 11, fontWeight: 500, color: t.textSecondary },
  locPillDanger: { background: t.dangerBg, border: `1px solid ${t.danger}44`, color: t.danger },
  statusPill: { padding: '3px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700, letterSpacing: '0.03em' },

  byLine:      { fontSize: 11.5, color: t.textMuted, margin: '0 0 4px' },
  byLineLabel: { fontWeight: 600, color: t.textSecondary },

  commentText:{ fontSize: 14, color: t.textSecondary, lineHeight: 1.5, margin: '2px 0 8px' },
  reactRow:   { display: 'flex', gap: 14, flexWrap: 'wrap' },
  react:      { fontSize: 12, color: t.textMuted },

  panel:      { borderTop: `1px solid ${t.divider}`, padding: '14px 18px 18px', background: t.sidebarBg },
  actions:    { display: 'flex', gap: 8, marginTop: 10 },
  btn:        { padding: '8px 18px', borderRadius: radius.md, fontWeight: 600, fontSize: 13, cursor: 'pointer', border: 'none' },
  btnApprove: { background: t.successBg, color: t.success },
  btnApproveDelete: { background: t.dangerBg, color: t.danger },
  btnDisapprove: { background: t.dangerBg, color: t.danger },

  fieldList: { display: 'flex', flexDirection: 'column', borderTop: `1px solid ${t.divider}`, padding: '4px 18px' },
  deleteNotice: { padding: '12px 0', fontSize: 13, color: t.danger, lineHeight: 1.5 },

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
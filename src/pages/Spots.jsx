import { useEffect, useState } from 'react';
import { spotAPI } from '../api/api';
import SpotForm from '../components/SpotForm';
import { theme as t } from '../theme';

const role = () => localStorage.getItem('role');

// Simple confirm/prompt replacement — native window.confirm/prompt aren't
// supported in this environment, so we render our own lightweight modal.
function ConfirmModal({ title, message, showReasonInput, confirmLabel = 'Confirm', danger, onConfirm, onCancel }) {
  const [reason, setReason] = useState('');
  return (
    <div style={ms.overlay}>
      <div style={ms.modal}>
        <h3 style={ms.title}>{title}</h3>
        {message && <p style={ms.message}>{message}</p>}
        {showReasonInput && (
          <textarea
            autoFocus
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Reason (optional)…"
            style={ms.textarea}
            rows={3}
          />
        )}
        <div style={ms.actions}>
          <button onClick={onCancel} style={ms.cancelBtn}>Cancel</button>
          <button
            onClick={() => onConfirm(reason)}
            style={{ ...ms.confirmBtn, ...(danger ? ms.confirmBtnDanger : {}) }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Spots() {
  const [spots,    setSpots]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [editing,  setEditing]  = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [search,   setSearch]   = useState('');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [deletingId, setDeletingId] = useState(null); // spot._id currently being requested/deleted

  // Holds the pending confirm-modal config: { spot, mode: 'request'|'withdraw'|'delete' }
  const [confirmState, setConfirmState] = useState(null);

  const isModerator = role() === 'moderator';

  const load = async () => {
    setLoading(true);
    try {
      const data = isModerator ? await spotAPI.getMine() : await spotAPI.getAll();
      setSpots(data || []);
    } catch (err) {
      console.error('Failed to load spots:', err);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openDeleteFlow = (spot) => {
    if (isModerator) {
      if (spot.pendingDelete) {
        setConfirmState({ spot, mode: 'withdraw' });
        return;
      }
      if (spot.pendingChange) {
        alert('This spot has a pending edit awaiting review. Resolve that first before requesting deletion.');
        return;
      }
      setConfirmState({ spot, mode: 'request' });
      return;
    }
    setConfirmState({ spot, mode: 'delete' });
  };

  const closeConfirm = () => setConfirmState(null);

  const runConfirm = async (reason) => {
    if (!confirmState) return;
    const { spot, mode } = confirmState;
    setDeletingId(spot._id);
    closeConfirm();
    try {
      if (mode === 'request') {
        await spotAPI.proposeDelete(spot._id, reason);
      } else if (mode === 'withdraw') {
        await spotAPI.cancelDelete(spot._id);
      } else if (mode === 'delete') {
        await spotAPI.delete(spot._id);
      }
      load();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Unknown error';
      alert(
        mode === 'request'   ? 'Failed to submit deletion request: ' + msg :
        mode === 'withdraw'  ? 'Failed to withdraw request: ' + msg :
        'Failed to delete: ' + msg
      );
    } finally {
      setDeletingId(null);
    }
  };

  const handleEditClick = (spot) => {
    if (isModerator && spot.pendingChange) {
      alert('This spot already has a pending change awaiting admin review. You can submit a new edit once that one is resolved.');
      return;
    }
    if (isModerator && spot.pendingDelete) {
      alert('This spot has a pending deletion request awaiting admin review. Withdraw it first if you want to edit instead.');
      return;
    }
    setEditing(spot);
    setShowForm(true);
  };

  const handleSave = async (formData) => {
    setSaving(true);
    setError('');
    try {
      if (editing) {
        if (isModerator) {
          await spotAPI.proposeChange(editing._id, formData);
        } else {
          await spotAPI.update(editing._id, formData);
        }
      } else {
        await spotAPI.create(formData);
      }
      setShowForm(false);
      setEditing(null);
      load();
    } catch (err) {
      const msg = err.message || 'Something went wrong';
      setError(msg);
      alert('Error: ' + msg);
    } finally {
      setSaving(false);
    }
  };

  const filtered = spots.filter(s => {
    const name = s.name?.toLowerCase() || '';
    const cat  = Array.isArray(s.category)
      ? s.category.join(' ').toLowerCase()
      : (s.category || '').toLowerCase();
    const q = search.toLowerCase();
    return name.includes(q) || cat.includes(q);
  });

  return (
    <div style={s.page}>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>Spots</h1>
          <p style={s.pageSub}>{spots.length} spots total</p>
        </div>
        {!isModerator && (
          <button onClick={() => { setEditing(null); setShowForm(true); }} style={s.btnPrimary}>
            + Add Spot
          </button>
        )}
      </div>

      {error && (
        <div style={s.errorBanner}>
          ⚠ {error}
          <button onClick={() => setError('')} style={s.errorClose}>✕</button>
        </div>
      )}

      {showForm && (
        <div style={s.formWrap}>
          <SpotForm
            initial={editing}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setEditing(null); setError(''); }}
            saving={saving}
            isModerator={isModerator}
          />
        </div>
      )}

      {confirmState && confirmState.mode === 'request' && (
        <ConfirmModal
          title="Request deletion"
          message={`Submit a request to delete "${confirmState.spot.name}"? An admin will review this before anything is removed.`}
          showReasonInput
          confirmLabel="Submit request"
          onConfirm={runConfirm}
          onCancel={closeConfirm}
        />
      )}
      {confirmState && confirmState.mode === 'withdraw' && (
        <ConfirmModal
          title="Withdraw request"
          message={`Withdraw your deletion request for "${confirmState.spot.name}"?`}
          confirmLabel="Withdraw"
          onConfirm={runConfirm}
          onCancel={closeConfirm}
        />
      )}
      {confirmState && confirmState.mode === 'delete' && (
        <ConfirmModal
          title="Delete spot"
          message={`Delete "${confirmState.spot.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={runConfirm}
          onCancel={closeConfirm}
        />
      )}

      <div style={s.filterRow}>
        <input
          placeholder="Search spots by name or category…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={s.searchInput}
        />
      </div>

      {loading ? (
        <div style={s.emptyCard}>Loading spots…</div>
      ) : filtered.length === 0 ? (
        <div style={s.emptyCard}>No spots found</div>
      ) : (
        <div style={s.grid}>
          {filtered.map(spot => (
            <div key={spot._id} style={s.card}>
              <div style={s.cardImgWrap}>
                {spot.image
                  ? <img src={spot.image} alt={spot.name} style={s.cardImg} />
                  : <div style={s.cardImgPh}>{spot.name?.[0]}</div>
                }
                <span style={s.categoryBadge}>
                  {Array.isArray(spot.category) ? spot.category.join(' / ') : spot.category || '—'}
                </span>
              </div>

              <div style={s.cardBody}>
                <div style={s.cardName} title={spot.name}>{spot.name}</div>

                {spot.pendingChange && (
                  <span style={s.pendingBadge}>⏳ Edit pending review</span>
                )}
                {spot.pendingDelete && (
                  <span style={s.pendingDeleteBadge}>🗑️ Deletion pending review</span>
                )}

                {spot.description && (
                  <div style={s.cardDesc} title={spot.description}>{spot.description}</div>
                )}

                <div style={s.detailList}>
                  <div style={s.detailRow}>
                    <span style={s.detailIcon}>📍</span>
                    <span style={s.detailText}>{spot.city || '—'}</span>
                  </div>
                  <div style={s.detailRow}>
                    <span style={s.detailIcon}>🕒</span>
                    <span style={s.detailText}>{spot.visitingHours || 'Hours not set'}</span>
                  </div>
                  <div style={s.detailRow}>
                    <span style={s.detailIcon}>🎟️</span>
                    <span style={s.detailText}>{spot.entranceFee || 'Free'}</span>
                  </div>
                </div>

                <div style={s.cardFooter}>
                  <span style={s.cardVisits}>
                    {(spot.visitCount || 0).toLocaleString()} visits
                  </span>
                  <div style={s.actions}>
                    <button
                      onClick={() => handleEditClick(spot)}
                      style={s.btnEdit}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => openDeleteFlow(spot)}
                      style={s.btnDelete}
                      disabled={deletingId === spot._id}
                    >
                      {isModerator
                        ? (spot.pendingDelete ? 'Withdraw request' : 'Request delete')
                        : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const s = {
  page:        { padding: '28px 32px', maxWidth: 1100, margin: '0 auto' },
  pageHeader:  { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  pageTitle:   { fontSize: 22, fontWeight: 600, color: t.textPrimary, marginBottom: 4 },
  pageSub:     { fontSize: 13, color: t.textSecondary },
  btnPrimary:  { padding: '9px 20px', background: t.brandSolid, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: 'pointer' },
  errorBanner: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: t.dangerBg, border: `1px solid ${t.danger}44`, borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: t.danger, fontSize: 14, fontWeight: 500 },
  errorClose:  { background: 'none', border: 'none', color: t.danger, cursor: 'pointer', fontWeight: 700, fontSize: 16 },
  formWrap:    { marginBottom: 18 },
  filterRow:   { marginBottom: 18 },
  searchInput: { width: '100%', padding: '10px 14px', borderRadius: 10, border: `1px solid ${t.border}`, fontSize: 14, background: t.cardBg, outline: 'none', color: t.textPrimary, boxSizing: 'border-box' },

  grid:        { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 18 },

  card:        { background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column' },

  cardImgWrap: { position: 'relative', width: '100%', height: 140, background: t.sidebarBg },
  cardImg:     { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  cardImgPh:   { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 700, color: t.brand, background: t.brandSoft },

  categoryBadge: { position: 'absolute', top: 10, left: 10, padding: '3px 10px', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)', borderRadius: 20, fontSize: 11, fontWeight: 600, color: '#fff' },

  cardBody:    { padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 },
  cardName:    {
    fontWeight: 600, fontSize: 14, color: t.textPrimary, lineHeight: 1.3,
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
    overflow: 'hidden', textOverflow: 'ellipsis', minHeight: '2.6em',
  },
  pendingBadge: {
    alignSelf: 'flex-start',
    fontSize: 11,
    fontWeight: 700,
    color: '#a9722c',
    background: '#a9722c1a',
    borderRadius: 6,
    padding: '3px 8px',
  },
  pendingDeleteBadge: {
    alignSelf: 'flex-start',
    fontSize: 11,
    fontWeight: 700,
    color: '#b3261e',
    background: '#b3261e1a',
    borderRadius: 6,
    padding: '3px 8px',
  },
  cardDesc:    {
    fontSize: 12, color: t.textSecondary, lineHeight: 1.4,
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
    overflow: 'hidden', textOverflow: 'ellipsis',
  },

  detailList:  { display: 'flex', flexDirection: 'column', gap: 5 },
  detailRow:   { display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 12, color: t.textMuted },
  detailIcon:  { flexShrink: 0, fontSize: 12, lineHeight: '18px' },
  detailText:  { lineHeight: 1.4 },

  cardFooter:  { marginTop: 'auto', paddingTop: 10, borderTop: `1px solid ${t.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardVisits:  { fontSize: 12, fontWeight: 600, color: t.textPrimary },

  actions:     { display: 'flex', gap: 7 },
  btnEdit:     { padding: '5px 13px', background: t.brandSoft, color: t.brand, border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 12, cursor: 'pointer' },
  btnDelete:   { padding: '5px 13px', background: t.dangerBg, color: t.danger, border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 12, cursor: 'pointer' },

  emptyCard:   { padding: 60, textAlign: 'center', color: t.textSecondary, background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 14 },
};

// ── Confirm/reason modal styles ──────────────────────────────
const ms = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 20 },
  modal:   { background: t.cardBg, borderRadius: 14, width: '100%', maxWidth: 400, padding: 22, boxShadow: '0 24px 60px rgba(0,0,0,0.5)', border: `1px solid ${t.border}`, display: 'flex', flexDirection: 'column', gap: 12 },
  title:   { fontSize: 16, fontWeight: 700, color: t.textPrimary, margin: 0 },
  message: { fontSize: 13.5, color: t.textSecondary, margin: 0, lineHeight: 1.5 },
  textarea:{ width: '100%', padding: '9px 12px', borderRadius: 8, border: `1px solid ${t.border}`, fontSize: 13, color: t.textPrimary, outline: 'none', background: t.sidebarBg, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
  cancelBtn: { padding: '8px 16px', borderRadius: 8, border: `1px solid ${t.border}`, background: 'transparent', color: t.textSecondary, fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  confirmBtn: { padding: '8px 16px', borderRadius: 8, border: 'none', background: t.brandSolid, color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  confirmBtnDanger: { background: '#b3261e' },
};
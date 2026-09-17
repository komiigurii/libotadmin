import { useEffect, useState } from 'react';
import { spotAPI } from '../api/api';
import SpotForm from '../components/SpotForm';
import { notify } from '../components/AppAlert';
import { theme as t, radius, shadow } from '../theme';
import { pageStyles, Loading, EmptyState } from '../components/Layout';
import Icon from '../components/Icon';

const role = () => localStorage.getItem('role');
const modCity = () => localStorage.getItem('city') || '';

export default function Spots() {
  const [spots,    setSpots]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [editing,  setEditing]  = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [search,   setSearch]   = useState('');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteReason, setDeleteReason] = useState('');

  const isModerator = role() === 'moderator';
  const lockedCity = isModerator ? modCity() : '';

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

  // Moderators only — opens our custom modal instead of window.prompt
  const openDeleteModal = (id) => {
    setDeleteTarget(id);
    setDeleteReason('');
  };

  // Called when the moderator confirms inside the modal
  const confirmDelete = async () => {
    const id = deleteTarget;
    setDeleteTarget(null);

    try {
      await spotAPI.proposeDelete(id, deleteReason);
      setError('');
      load();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Unknown error';
      setError('Failed to submit request: ' + msg);
    }
  };

  const handleSave = async (formData) => {
    setSaving(true);
    setError('');

    try {
      if (editing) {
        await spotAPI.proposeChange(editing._id, formData);
        notify('Changes submitted for admin approval.', { tone: 'success' });
      } else {
        await spotAPI.proposeCreate(formData);
        notify('New spot submitted for admin approval.', { tone: 'success' });
      }

      setShowForm(false);
      setEditing(null);
      load();

    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        'Something went wrong';

      setError(msg);
      notify('Error: ' + msg, { tone: 'danger' });

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
        {isModerator && (
          <button onClick={() => { setEditing(null); setShowForm(true); }} style={s.btnPrimary} className="modern-btn">
            + Add Spot
          </button>
        )}
      </div>

      {error && (
        <div style={s.errorBanner}>
          <Icon name="alert-triangle" size={13} /> {error}
          <button onClick={() => setError('')} style={s.errorClose} aria-label="Dismiss error"><Icon name="x" size={12} /></button>
        </div>
      )}

      {deleteTarget && (
        <div style={s.modalOverlay}>
          <div style={s.modalBox}>
            <h3 style={{ marginTop: 0, marginBottom: 4, color: t.textPrimary }}>Request deletion</h3>
            <p style={{ fontSize: 13, color: t.textSecondary, marginTop: 0 }}>
              Reason for requesting deletion (optional):
            </p>
            <textarea
              value={deleteReason}
              onChange={e => setDeleteReason(e.target.value)}
              rows={3}
              style={s.modalTextarea}
              className="modern-input"
              placeholder="e.g. permanently closed"
              autoFocus
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button onClick={() => setDeleteTarget(null)} style={s.btnEdit} className="modern-btn">Cancel</button>
              <button onClick={confirmDelete} style={s.btnDelete} className="modern-btn">Submit Request</button>
            </div>
          </div>
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
            lockedCity={lockedCity}
          />
        </div>
      )}

      <div style={s.filterRow}>
        <input
          placeholder="Search spots by name or category…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={s.searchInput}
          className="modern-input"
        />
      </div>

      {loading ? (
        <Loading label="Loading spots…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="map-pin"
          title={spots.length === 0 ? 'No spots yet' : 'No spots match your search'}
          subtitle={spots.length === 0
            ? 'Spots you add will appear here.'
            : 'Try a different name or category.'}
        />
      ) : (
        <div style={s.grid}>
          {filtered.map(spot => (
            <div key={spot._id} style={s.card} className="modern-card">
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

                {spot.description && (
                  <div style={s.cardDesc} title={spot.description}>{spot.description}</div>
                )}

                <div style={s.detailList}>
                  <div style={s.detailRow}>
                    <span style={s.detailIcon}><Icon name="map-pin" size={12} /></span>
                    <span style={s.detailText}>{spot.city || '—'}</span>
                  </div>
                  <div style={s.detailRow}>
                    <span style={s.detailIcon}><Icon name="clock" size={12} /></span>
                    <span style={s.detailText}>{spot.visitingHours || 'Hours not set'}</span>
                  </div>
                  <div style={s.detailRow}>
                    <span style={s.detailIcon}><Icon name="star" size={12} /></span>
                    <span style={s.detailText}>{spot.entranceFee || 'Free'}</span>
                  </div>
                </div>

                {spot.pendingChange && (
                  <div style={s.pendingNotice}><Icon name="clock" size={11} /> Edit pending admin approval</div>
                )}
                {spot.pendingDelete && (
                  <div style={s.pendingNoticeDanger}><Icon name="trash" size={11} /> Deletion pending admin approval</div>
                )}

                <div style={s.cardFooter}>
                  <span style={s.cardVisits}>
                    {(spot.visitCount || 0).toLocaleString()} visits
                  </span>
                  {isModerator && (
                    <div style={s.actions}>
                      <button
                        onClick={() => { setEditing(spot); setShowForm(true); }}
                        style={s.btnEdit}
                        className="modern-btn"
                        disabled={!!spot.pendingChange || !!spot.pendingDelete}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => openDeleteModal(spot._id)}
                        style={s.btnDelete}
                        className="modern-btn"
                        disabled={!!spot.pendingChange || !!spot.pendingDelete}
                      >
                        Delete
                      </button>
                    </div>
                  )}
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
  // Page shell, header, toolbar, states and table cells come from
  // components/Layout so every page is spaced identically.
  ...pageStyles,
  // Page-specific: the shared card has no padding, overflow or margin,
  // because those differ by how each page uses a card.
  card: { background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: radius.xl, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: shadow.sm },
  btnPrimary:  { padding: '9px 20px', background: t.accent, color: t.onAccent, border: 'none', borderRadius: radius.lg, fontWeight: 700, fontSize: 14, cursor: 'pointer', boxShadow: shadow.sm },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modalBox:     { background: t.cardBg, borderRadius: radius.xl, padding: 20, width: 360, boxShadow: shadow.lg, border: `1px solid ${t.border}` },
  modalTextarea:{ width: '100%', padding: 10, borderRadius: 8, border: `1px solid ${t.border}`, fontSize: 13, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', color: t.textPrimary, background: t.cardBg },
  formWrap:    { marginBottom: 18 },

  grid:        { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 18 },


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
  cardDesc:    {
    fontSize: 12, color: t.textSecondary, lineHeight: 1.4,
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
    overflow: 'hidden', textOverflow: 'ellipsis',
  },

  detailList:  { display: 'flex', flexDirection: 'column', gap: 5 },
  detailRow:   { display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 12, color: t.textMuted },
  detailIcon:  { flexShrink: 0, fontSize: 12, lineHeight: '18px' },
  detailText:  { lineHeight: 1.4 },

  pendingNotice:       { fontSize: 11.5, fontWeight: 600, color: t.purple, background: t.purpleBg, borderRadius: 7, padding: '5px 9px' },
  pendingNoticeDanger: { fontSize: 11.5, fontWeight: 600, color: t.danger, background: t.dangerBg, borderRadius: 7, padding: '5px 9px' },

  cardFooter:  { marginTop: 'auto', paddingTop: 10, borderTop: `1px solid ${t.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardVisits:  { fontSize: 12, fontWeight: 600, color: t.textPrimary },

  actions:     { display: 'flex', gap: 7 },
  btnEdit:     { padding: '5px 13px', background: t.brandSoft, color: t.brand, border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 12, cursor: 'pointer' },
  btnDelete:   { padding: '5px 13px', background: t.dangerBg, color: t.danger, border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 12, cursor: 'pointer' },

};
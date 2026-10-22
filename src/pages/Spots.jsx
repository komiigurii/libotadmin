import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { spotAPI } from '../api/api';
import SpotForm from '../components/SpotForm';
import { notify } from '../components/AppAlert';
import { theme as t, radius, shadow, type } from '../theme';
import {
  Page, PageHeader, Toolbar, SearchInput, Button, StatusPill, Loading, EmptyState, ErrorBanner, pageStyles,
} from '../components/Layout';
import { plural } from '../utils/format';
import Icon from '../components/Icon';

const role = () => localStorage.getItem('role');
const modCity = () => localStorage.getItem('city') || '';

/*
 * The spots. A moderator's changes go to an admin for approval; an admin's
 * own add, edit or delete goes live at once (mock defense 2026-10-21: "lahat
 * nagagawa ni admin"), through the same request on the server, which keeps
 * its history. For admins this is the Spots tab of Spot Management
 * (`embedded`: no page shell, the actions sit in the toolbar).
 */
export default function Spots({ embedded = false }) {
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
    setError('');
    try {
      // The admin list, not the public one: only it carries the pending edit /
      // deletion behind the "waiting for approval" labels on each card.
      const data = isModerator ? await spotAPI.getMine() : await spotAPI.getAllAdmin();
      setSpots(data || []);
    } catch (err) {
      console.error('Failed to load spots:', err);
      // A failed request is not an empty list — say so instead of showing
      // "No spots yet" when the server simply couldn't be reached.
      setError('Couldn’t load spots.');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // The dashboard's "Add a spot" action links here with ?new=1. Open the form
  // once, then drop the parameter so closing it (or reloading) doesn't reopen it.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    setEditing(null);
    setShowForm(true);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  // Esc closes the deletion-request dialog, like every other dialog here.
  useEffect(() => {
    if (!deleteTarget) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setDeleteTarget(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteTarget]);

  // Moderators only — opens our custom modal instead of window.prompt
  const openDeleteModal = (id) => {
    setDeleteTarget(id);
    setDeleteReason('');
  };

  // Called when the moderator confirms inside the modal
  const confirmDelete = async () => {
    const id = deleteTarget;
    setDeleteTarget(null);

    // A toast either way, like a submitted edit (QA 2026-10-16: the request
    // used to go through with nothing said but a small label on the card).
    try {
      const data = await spotAPI.proposeDelete(id, deleteReason);
      setError('');
      notify(data?.direct
        ? 'Spot deleted. It’s gone from the app.'
        : 'Deletion requested. The spot stays live until an admin approves it.', { tone: 'success' });
      load();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Unknown error';
      setError('Failed to submit request: ' + msg);
      notify('Couldn’t request the deletion: ' + msg, { tone: 'danger' });
    }
  };

  const handleSave = async (formData) => {
    setSaving(true);
    setError('');

    try {
      const data = editing
        ? await spotAPI.proposeChange(editing._id, formData)
        : await spotAPI.proposeCreate(formData);
      // An admin's own change is approved in the same step.
      notify(data?.direct
        ? (editing ? 'Changes saved. They’re live in the app now.' : 'Spot added. It’s live in the app now.')
        : (editing ? 'Changes submitted for admin approval.' : 'New spot submitted for admin approval.'), { tone: 'success' });

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

  const filtered = spots.filter(x => {
    const name = x.name?.toLowerCase() || '';
    const cat  = Array.isArray(x.category)
      ? x.category.join(' ').toLowerCase()
      : (x.category || '').toLowerCase();
    const q = search.toLowerCase();
    return name.includes(q) || cat.includes(q);
  });

  const headerActions = <>
    <Button icon="refresh-cw" onClick={load} disabled={loading}>Refresh</Button>
    <Button variant="primary" icon="plus" onClick={() => { setEditing(null); setShowForm(true); }}>
      Add spot
    </Button>
  </>;
  const Shell = embedded ? EmbeddedShell : Page;

  return (
    <Shell>
      {!embedded && (
        <PageHeader
          title="Spot Management"
          count={spots.length}
          subtitle={isModerator
            ? `The spots${lockedCity ? ` in ${lockedCity}` : ''} you look after. Add one or propose changes — an admin approves each before it goes live.`
            : 'Every spot in the app. What you add, edit or delete goes live at once.'}
          actions={headerActions}
        />
      )}

      {error && <ErrorBanner onDismiss={() => setError('')}>{error}</ErrorBanner>}

      {deleteTarget && (
        <div style={s.modalOverlay}>
          <div style={s.modalBox} role="dialog" aria-modal="true" aria-labelledby="delete-title">
            <h2 id="delete-title" style={s.modalTitle}>{isModerator ? 'Request deletion' : 'Delete this spot?'}</h2>
            <p style={s.modalText}>
              {isModerator
                ? 'An admin reviews this before the spot is removed. Reason (optional):'
                : 'It’s removed from the app straight away, with its missions and badge. Reason (optional, kept in the activity log):'}
            </p>
            <textarea
              value={deleteReason}
              onChange={e => setDeleteReason(e.target.value)}
              rows={3}
              style={s.textarea}
              className="modern-input"
              placeholder="e.g. Permanently closed"
              autoFocus
            />
            <div style={{ ...s.buttonRow, justifyContent: 'flex-end' }}>
              <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="dangerSolid" icon="trash" onClick={confirmDelete}>{isModerator ? 'Request deletion' : 'Delete spot'}</Button>
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

      <Toolbar>
        <SearchInput
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search spots by name or category…"
        />
        {embedded && headerActions}
      </Toolbar>

      {loading ? (
        <Loading label="Loading spots…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="map-pin"
          title={spots.length === 0 ? 'No spots yet' : 'No spots match'}
          subtitle={spots.length === 0
            ? (isModerator ? 'Spots you add will appear here once an admin approves them.' : 'Published spots will appear here.')
            : 'Try a different name or category.'}
        />
      ) : (
        <div style={s.grid}>
          {filtered.map(spot => {
            const locked = !!spot.pendingChange || !!spot.pendingDelete;
            return (
              <div key={spot._id} style={s.spotCard}>
                <div style={s.cardImgWrap}>
                  {spot.image
                    ? <img src={spot.image} alt="" style={s.cardImg} />
                    : <div style={s.cardImgPh}><Icon name="map-pin" size={28} /></div>}
                  <span style={s.categoryBadge}>
                    {Array.isArray(spot.category) ? spot.category.join(' / ') : spot.category || '—'}
                  </span>
                </div>

                <div style={s.cardBody}>
                  <div style={s.cardName} title={spot.name}>{spot.name}</div>

                  {spot.description && (
                    <div style={s.cardDesc} title={spot.description}>{spot.description}</div>
                  )}

                  <div style={s.facts}>
                    <span style={s.itemFact}><Icon name="map-pin" size={12} /> {spot.city || 'City not set'}</span>
                    <span style={s.itemFact}><Icon name="clock" size={12} /> {spot.visitingHours || 'Hours not set'}</span>
                    {/* Not "Free": a missing fee is unknown, not zero. */}
                    <span style={s.itemFact}><Icon name="star" size={12} /> {spot.entranceFee || 'Fee not set'}</span>
                  </div>

                  {(spot.pendingChange || spot.pendingDelete) && (
                    <div>
                      {spot.pendingDelete
                        ? <StatusPill tone="danger" icon="trash">Deletion waiting for approval</StatusPill>
                        : <StatusPill tone="warning" icon="clock">Edit waiting for approval</StatusPill>}
                    </div>
                  )}

                  <div style={s.cardFooter}>
                    <span style={s.cardVisits}>{plural(spot.visitCount || 0, 'visit')}</span>
                    {/* Locked while a moderator's request on it waits for review. */}
                    <div style={s.cellActions}>
                      <Button size="sm" variant="subtle" icon="edit" disabled={locked} onClick={() => { setEditing(spot); setShowForm(true); }}>
                        Edit
                      </Button>
                      <Button size="sm" variant="danger" icon="trash" disabled={locked} onClick={() => openDeleteModal(spot._id)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Shell>
  );
}

const EmbeddedShell = ({ children }) => <>{children}</>;

const s = {
  // Page shell, header, toolbar, states, facts and buttons come from
  // components/Layout; only the photo card is this page's own.
  ...pageStyles,
  modalOverlay: { position: 'fixed', inset: 0, background: t.overlay, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 },
  modalBox:     { background: t.cardBg, borderRadius: radius.xl, padding: 22, width: '100%', maxWidth: 400, boxShadow: shadow.lg, border: `1px solid ${t.border}` },
  modalTitle:   { ...type.dialogTitle, color: t.textPrimary, margin: '0 0 6px' },
  modalText:    { fontSize: 13, color: t.textSecondary, margin: '0 0 10px', lineHeight: 1.5 },
  formWrap:     { marginBottom: 18 },

  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 },

  spotCard:    { ...pageStyles.item, display: 'flex', flexDirection: 'column' },
  cardImgWrap: { position: 'relative', width: '100%', height: 140, background: t.sidebarBg },
  cardImg:     { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  cardImgPh:   { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.brand, background: t.brandSoft },
  // Sits on the photo, so it carries its own dark scrim rather than a theme
  // surface — it has to read over any image in either theme.
  categoryBadge: { position: 'absolute', top: 10, left: 10, padding: '3px 10px', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', borderRadius: radius.pill, fontSize: 11.5, fontWeight: 600, color: '#fff' },

  cardBody: { padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 },
  cardName: {
    fontWeight: 700, fontSize: 14, color: t.textPrimary, lineHeight: 1.3,
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
    overflow: 'hidden', textOverflow: 'ellipsis', minHeight: '2.6em',
  },
  cardDesc: {
    fontSize: 12.5, color: t.textSecondary, lineHeight: 1.45,
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
    overflow: 'hidden', textOverflow: 'ellipsis',
  },
  facts:      { display: 'flex', flexDirection: 'column', gap: 5 },
  cardFooter: { marginTop: 'auto', paddingTop: 10, borderTop: `1px solid ${t.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardVisits: { fontSize: 12.5, fontWeight: 600, color: t.textPrimary },
};

import { useEffect, useState } from 'react';
import { spotAPI } from '../api/api';

export default function PendingChanges() {
  const [pending, setPending]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [acting, setActing]     = useState(null);
  const [expanded, setExpanded] = useState(null); 

  useEffect(() => {
    spotAPI.getPending()
      .then(data => setPending(data?.items || data || []))
      .catch(() => setPending([]))
      .finally(() => setLoading(false));
  }, []);

  const handle = async (id, action) => {
    setActing(id);
    try {
      await spotAPI.reviewChange(id, action);
      setPending(prev => prev.filter(p => p._id !== id));
    } catch {
      alert(`Failed to ${action} change. Please try again.`);
    } finally {
      setActing(null);
    }
  };

  if (loading) return <div style={styles.centered}>Loading pending changes...</div>;

  return (
    <div style={styles.page}>

      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Pending Changes</h1>
          <p style={styles.subtitle}>
            {pending.length === 0
              ? 'All caught up — no pending changes.'
              : `${pending.length} change${pending.length > 1 ? 's' : ''} awaiting review`}
          </p>
        </div>
        {/* Reviewer-role info badge */}
        <div style={styles.infoBadge}>
          <span style={styles.infoDot} />
          Reviewer access only
        </div>
      </div>

      {pending.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>✓</div>
          <p style={styles.emptyText}>No pending changes</p>
          <p style={styles.emptySubtext}>New spot change requests will appear here for your review.</p>
        </div>
      ) : (
        <div style={styles.list}>
          {pending.map(item => {
            const isExpanded = expanded === item._id;
            const isActing   = acting === item._id;

            return (
              <div key={item._id} style={styles.card}>

                {/* Card header — always visible */}
                <div style={styles.cardTop}>
                  <div style={styles.cardLeft}>
                    {item.image
                      ? <img src={item.image} alt={item.name} style={styles.thumb} onError={e => e.target.style.display = 'none'} />
                      : <div style={styles.thumbPlaceholder}>{item.name?.[0]}</div>
                    }
                    <div>
                      <p style={styles.spotName}>{item.name}</p>
                      <div style={styles.metaRow}>
                        {item.category?.[0] && <span style={styles.catBadge}>{item.category[0]}</span>}
                        {item.createdAt && (
                          <span style={styles.dateText}>
                            Submitted {new Date(item.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={styles.cardRight}>
                    <button
                      style={styles.expandBtn}
                      onClick={() => setExpanded(isExpanded ? null : item._id)}
                    >
                      {isExpanded ? 'Hide details ▲' : 'View details ▼'}
                    </button>
                    <button
                      style={{ ...styles.rejectBtn, opacity: isActing ? 0.6 : 1 }}
                      disabled={isActing}
                      onClick={() => handle(item._id, 'reject')}
                    >
                      ✕ Reject
                    </button>
                    <button
                      style={{ ...styles.approveBtn, opacity: isActing ? 0.6 : 1 }}
                      disabled={isActing}
                      onClick={() => handle(item._id, 'approve')}
                    >
                      {isActing ? '...' : '✓ Approve'}
                    </button>
                  </div>
                </div>

                {/* Expanded details — read-only */}
                {isExpanded && (
                  <div style={styles.details}>
                    <div style={styles.detailsGrid}>
                      <Field label="Description"    value={item.description} wide />
                      <Field label="Entrance Fee"   value={item.entranceFee} />
                      <Field label="Visiting Hours" value={item.visitingHours} />
                      <Field
                        label="Coordinates"
                        value={item.coordinates?.lat && item.coordinates?.lng
                          ? `${item.coordinates.lat}, ${item.coordinates.lng}`
                          : null}
                      />
                      <Field label="Image URL"      value={item.image} wide />
                      <Field label="3D Model URL"   value={item.modelUrl} wide />
                      <Field label="AR Model URL"   value={item.ARModelUrl} wide />
                      <Field label="Badge URL"      value={item.Badge} wide />
                    </div>

                    {/* AR positions */}
                    {item.modelsCoordinates?.length > 0 && (
                      <div style={styles.arSection}>
                        <p style={styles.arLabel}>AR Model Positions ({item.modelsCoordinates.length})</p>
                        <div style={styles.arList}>
                          {item.modelsCoordinates.map((m, i) => (
                            <div key={i} style={styles.arChip}>
                              <span style={styles.arChipNum}>{i + 1}</span>
                              {m.lat}, {m.lng}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Map link */}
                    {item.coordinates?.lat && item.coordinates?.lng && (
                      <a
                        href={`https://www.google.com/maps?q=${item.coordinates.lat},${item.coordinates.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        style={styles.mapLink}
                      >
                        View on Google Maps →
                      </a>
                    )}
                  </div>
                )}

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, wide }) {
  if (!value) return null;
  return (
    <div style={{ ...styles.field, ...(wide ? styles.fieldWide : {}) }}>
      <p style={styles.fieldLabel}>{label}</p>
      <p style={styles.fieldValue}>{value}</p>
    </div>
  );
}

const styles = {
  page:        { padding: '32px 40px', maxWidth: 900, margin: '0 auto' },
  centered:    { padding: 60, textAlign: 'center', color: '#9a7a78', fontSize: 15 },
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  title:       { fontSize: 26, fontWeight: 700, color: '#2d1f1e', marginBottom: 4 },
  subtitle:    { fontSize: 14, color: '#9a7a78' },
  infoBadge:   { display: 'flex', alignItems: 'center', gap: 7, padding: '6px 14px', background: '#f0f4ff', border: '1px solid #dde3ff', borderRadius: 20, fontSize: 12, fontWeight: 600, color: '#3b5bdb' },
  infoDot:     { width: 7, height: 7, borderRadius: '50%', background: '#3b5bdb' },

  emptyState:  { textAlign: 'center', padding: '70px 20px' },
  emptyIcon:   { width: 56, height: 56, borderRadius: '50%', background: '#e8f8ef', color: '#27ae60', fontSize: 24, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' },
  emptyText:   { fontSize: 17, fontWeight: 600, color: '#2d1f1e', marginBottom: 6 },
  emptySubtext:{ fontSize: 14, color: '#9a7a78' },

  list:        { display: 'flex', flexDirection: 'column', gap: 14 },
  card:        { background: '#fff', border: '1px solid #f0e0de', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 8px rgba(74,46,44,0.06)' },

  cardTop:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', gap: 12 },
  cardLeft:    { display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 },
  thumb:       { width: 52, height: 52, borderRadius: 10, objectFit: 'cover', border: '1px solid #f0e0de', flexShrink: 0 },
  thumbPlaceholder: { width: 52, height: 52, borderRadius: 10, background: '#faf0ee', color: '#6b4b45', fontWeight: 700, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  spotName:    { fontSize: 15, fontWeight: 700, color: '#2d1f1e', marginBottom: 4 },
  metaRow:     { display: 'flex', alignItems: 'center', gap: 8 },
  catBadge:    { padding: '2px 10px', background: '#faf0ee', borderRadius: 20, fontSize: 12, fontWeight: 500, color: '#6b4b45' },
  dateText:    { fontSize: 12, color: '#b0908e' },

  cardRight:   { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  expandBtn:   { padding: '6px 14px', background: '#faf5f4', color: '#6b4b45', border: '1px solid #f0e0de', borderRadius: 7, fontWeight: 600, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' },
  rejectBtn:   { padding: '7px 16px', background: '#fff0f0', color: '#c0392b', border: '1px solid #ffd0d0', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  approveBtn:  { padding: '7px 16px', background: '#27ae60', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' },

  details:     { borderTop: '1px solid #faf0ee', padding: '16px 20px', background: '#fdfaf9' },
  detailsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px', marginBottom: 12 },
  field:       {},
  fieldWide:   { gridColumn: '1 / -1' },
  fieldLabel:  { fontSize: 11, fontWeight: 600, color: '#9a7a78', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 },
  fieldValue:  { fontSize: 13, color: '#2d1f1e', wordBreak: 'break-all' },

  arSection:   { marginTop: 12 },
  arLabel:     { fontSize: 11, fontWeight: 600, color: '#9a7a78', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 },
  arList:      { display: 'flex', flexWrap: 'wrap', gap: 8 },
  arChip:      { display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: '#fff', border: '1px solid #f0e0de', borderRadius: 20, fontSize: 12, color: '#4a2e2c' },
  arChipNum:   { width: 18, height: 18, borderRadius: '50%', background: '#6b4b45', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' },

  mapLink:     { display: 'inline-block', marginTop: 12, fontSize: 13, color: '#6b4b45', fontWeight: 600, textDecoration: 'none' },
};
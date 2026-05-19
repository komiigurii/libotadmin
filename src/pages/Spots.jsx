import { useEffect, useState } from 'react';
import { spotAPI } from '../api/api';
import SpotForm from '../components/SpotForm';

export default function Spots() {
  const [spots, setSpots]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [editing, setEditing]   = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch]     = useState('');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await spotAPI.getAll();
      setSpots(data || []);
    } catch (err) {
      console.error('Failed to load spots:', err);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id) => {
    if (!confirm('Delete this spot?')) return;
    try {
      await spotAPI.delete(id);
      load();
    } catch (err) {
      alert('Failed to delete spot: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleSave = async (formData) => {
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await spotAPI.update(editing._id, formData);
      } else {
        await spotAPI.create(formData);
      }
      setShowForm(false);
      setEditing(null);
      load();
    } catch (err) {
      console.error('Save failed:', err);
      const msg = err.response?.data?.message || err.message || 'Something went wrong';
      setError(msg);
      alert('Error saving spot: ' + msg);
    } finally {
      setSaving(false);
    }
  };

  const filtered = spots.filter(s => {
    const name = s.name?.toLowerCase() || '';
    const cat = Array.isArray(s.category)
      ? s.category.join(' ').toLowerCase()
      : (s.category || '').toLowerCase();
    const q = search.toLowerCase();
    return name.includes(q) || cat.includes(q);
  });

  return (
    <div style={styles.page}>

      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Spots</h1>
          <p style={styles.subtitle}>{spots.length} spots total</p>
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true); }} style={styles.primaryBtn}>
          + Add Spot
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div style={styles.errorBanner}>
          ⚠ {error}
          <button onClick={() => setError('')} style={styles.errorClose}>✕</button>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <SpotForm
          initial={editing}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditing(null); setError(''); }}
          saving={saving}
        />
      )}

      {/* Search */}
      <div style={styles.searchWrap}>
        <input
          placeholder="Search spots by name or category..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={styles.search}
        />
      </div>

      {/* Table */}
      <div style={styles.card}>
        {loading ? (
          <div style={styles.empty}>Loading spots...</div>
        ) : filtered.length === 0 ? (
          <div style={styles.empty}>No spots found</div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr style={styles.thead}>
                <th style={styles.th}>Spot</th>
                <th style={styles.th}>Category</th>
                <th style={styles.th}>Entrance Fee</th>
                <th style={styles.th}>Visiting Hours</th>
                <th style={styles.th}>Visits</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(spot => (
                <tr key={spot._id} style={styles.tr}>
                  <td style={styles.td}>
                    <div style={styles.spotCell}>
                      {spot.image
                        ? <img src={spot.image} alt={spot.name} style={styles.spotImg} />
                        : <div style={styles.spotImgPlaceholder}>{spot.name?.[0]}</div>
                      }
                      <span style={styles.spotName}>{spot.name}</span>
                    </div>
                  </td>
                  <td style={styles.td}>
                    <span style={styles.badge}>{spot.category || '—'}</span>
                  </td>
                  <td style={styles.td}>{spot.entranceFee || 'Free'}</td>
                  <td style={styles.td}>{spot.visitingHours || '—'}</td>
                  <td style={styles.td}>{spot.visitCount || 0}</td>
                  <td style={styles.td}>
                    <div style={styles.actions}>
                      <button
                        onClick={() => { setEditing(spot); setShowForm(true); }}
                        style={styles.editBtn}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(spot._id)}
                        style={styles.deleteBtn}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const styles = {
  page:       { padding: '32px 40px', maxWidth: 1100, margin: '0 auto' },
  header:     { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  title:      { fontSize: 26, fontWeight: 700, color: '#2d1f1e', marginBottom: 4 },
  subtitle:   { fontSize: 14, color: '#9a7a78' },
  primaryBtn: { padding: '10px 22px', background: '#6b4b45', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: 'pointer' },
  errorBanner:{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff0f0', border: '1px solid #ffd0d0', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#c0392b', fontSize: 14, fontWeight: 500 },
  errorClose: { background: 'none', border: 'none', color: '#c0392b', cursor: 'pointer', fontWeight: 700, fontSize: 16, padding: '0 4px' },
  searchWrap: { marginBottom: 16 },
  search:     { width: '100%', padding: '11px 16px', borderRadius: 10, border: '1px solid #f0e0de', fontSize: 14, background: '#fff', outline: 'none', color: '#2d1f1e', boxSizing: 'border-box' },
  card:       { background: '#fff', borderRadius: 14, border: '1px solid #f0e0de', overflow: 'hidden', boxShadow: '0 1px 4px rgba(74,46,44,0.07)' },
  empty:      { padding: 60, textAlign: 'center', color: '#9a7a78' },
  table:      { width: '100%', borderCollapse: 'collapse' },
  thead:      { background: '#faf5f4' },
  th:         { padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#9a7a78', textTransform: 'uppercase', letterSpacing: '0.05em' },
  tr:         { borderTop: '1px solid #faf0ee', transition: 'background 0.1s' },
  td:         { padding: '14px 16px', fontSize: 14, color: '#4a2e2c' },
  spotCell:   { display: 'flex', alignItems: 'center', gap: 10 },
  spotImg:    { width: 36, height: 36, borderRadius: 8, objectFit: 'cover', flexShrink: 0 },
  spotImgPlaceholder: { width: 36, height: 36, borderRadius: 8, background: '#f0e0de', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#6b4b45', fontSize: 14, flexShrink: 0 },
  spotName:   { fontWeight: 600, color: '#2d1f1e' },
  badge:      { padding: '3px 10px', background: '#faf0ee', borderRadius: 20, fontSize: 12, fontWeight: 500, color: '#6b4b45' },
  actions:    { display: 'flex', gap: 8 },
  editBtn:    { padding: '6px 14px', background: '#faf0ee', color: '#4a2e2c', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  deleteBtn:  { padding: '6px 14px', background: '#fff0f0', color: '#c0392b', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 13, cursor: 'pointer' },
};
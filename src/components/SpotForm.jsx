import { useState } from 'react';

const CATEGORIES = ['Historical', 'Religious', 'Nature', 'Festivals'];
const emptyArModel = () => ({ lat: '', lng: '' });

export default function SpotForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    name:            initial?.name             || '',
    category:        initial?.category?.[0]    || '',
    description:     initial?.description      || '',
    entranceFee:     initial?.entranceFee      || '',
    visitingHours:   initial?.visitingHours    || '',
    image:           initial?.image            || '',
    modelUrl:        initial?.modelUrl         || '',
    Badge:           initial?.Badge            || '',
    coordinates_lat: initial?.coordinates?.lat || '',
    coordinates_lng: initial?.coordinates?.lng || '',
  });

  const [arModels, setArModels] = useState(() => {
    if (initial?.modelsCoordinates) {
      if (Array.isArray(initial.modelsCoordinates)) {
        return initial.modelsCoordinates.map(m => ({ lat: m.lat || '', lng: m.lng || '' }));
      }
      return [{ lat: initial.modelsCoordinates.lat || '', lng: initial.modelsCoordinates.lng || '' }];
    }
    return [emptyArModel()];
  });

  const handleChange = (e) =>
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleArChange = (index, field, value) =>
    setArModels(prev => prev.map((m, i) => i === index ? { ...m, [field]: value } : m));

  const addArModel    = () => setArModels(prev => [...prev, emptyArModel()]);
  const removeArModel = (index) => setArModels(prev => prev.filter((_, i) => i !== index));

  const handleSave = () => {
    if (!form.name)     return alert('Name is required');
    if (!form.category) return alert('Category is required');
    if (!form.image)    return alert('Image URL is required');

    const payload = {
      name:          form.name,
      category:      [form.category],
      description:   form.description,
      entranceFee:   form.entranceFee,
      visitingHours: form.visitingHours,
      image:         form.image,
      modelUrl:      form.modelUrl,
      Badge:         form.Badge,
      coordinates: {
        lat: parseFloat(form.coordinates_lat) || null,
        lng: parseFloat(form.coordinates_lng) || null,
      },
      modelsCoordinates: arModels.filter(m => m.lat && m.lng),
    };
    onSave(payload);
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>

        {/* Header */}
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>{initial ? 'Edit Spot' : 'Add New Spot'}</h2>
          <button onClick={onCancel} style={styles.closeBtn}>✕</button>
        </div>

        <div style={styles.body}>

          {/* ── Basic Info ── */}
          <div style={styles.section}>
            <p style={styles.sectionTitle}>Basic Info</p>
            <div style={styles.grid}>
              <div>
                <label style={styles.label}>Name <span style={styles.required}>*</span></label>
                <input name="name" value={form.name} onChange={handleChange} style={styles.input} placeholder="e.g. Barasoain Church" />
              </div>
              <div>
                <label style={styles.label}>Category <span style={styles.required}>*</span></label>
                <select name="category" value={form.category} onChange={handleChange} style={styles.select}>
                  <option value="">Select category</option>
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={styles.label}>Entrance Fee</label>
                <input name="entranceFee" value={form.entranceFee} onChange={handleChange} style={styles.input} placeholder="e.g. Free or ₱50" />
              </div>
              <div>
                <label style={styles.label}>Visiting Hours</label>
                <input name="visitingHours" value={form.visitingHours} onChange={handleChange} style={styles.input} placeholder="e.g. 6am to 10pm" />
              </div>
              <div style={styles.fullWidth}>
                <label style={styles.label}>Description</label>
                <textarea name="description" value={form.description} onChange={handleChange} style={styles.textarea} rows={3} placeholder="Short description of the spot..." />
              </div>
            </div>
          </div>

          {/* ── Media ── */}
          <div style={styles.section}>
            <p style={styles.sectionTitle}>Media</p>
            <div style={styles.grid}>
              <div style={styles.fullWidth}>
                <label style={styles.label}>Image URL <span style={styles.required}>*</span></label>
                <input name="image" value={form.image} onChange={handleChange} style={styles.input} placeholder="https://res.cloudinary.com/..." />
                {form.image && (
                  <img src={form.image} alt="preview" style={styles.imgPreview} onError={e => e.target.style.display = 'none'} />
                )}
              </div>
              <div style={styles.fullWidth}>
                <label style={styles.label}>3D Model URL <span style={styles.hint}>(Cloudinary .glb)</span></label>
                <input name="modelUrl" value={form.modelUrl} onChange={handleChange} style={styles.input} placeholder="https://res.cloudinary.com/...model.glb" />
              </div>
              <div style={styles.fullWidth}>
                <label style={styles.label}>Badge Image URL <span style={styles.hint}>(reward badge for visiting)</span></label>
                <input name="Badge" value={form.Badge} onChange={handleChange} style={styles.input} placeholder="https://res.cloudinary.com/...badge.png" />
                {form.Badge && (
                  <img src={form.Badge} alt="badge" style={styles.badgePreview} onError={e => e.target.style.display = 'none'} />
                )}
              </div>
            </div>
          </div>

          {/* ── Spot GPS ── */}
          <div style={styles.section}>
            <p style={styles.sectionTitle}>Spot Location <span style={styles.hint}>(real GPS coordinates)</span></p>
            <div style={styles.grid}>
              <div>
                <label style={styles.label}>Latitude</label>
                <input name="coordinates_lat" value={form.coordinates_lat} onChange={handleChange} style={styles.input} placeholder="e.g. 14.846306" />
              </div>
              <div>
                <label style={styles.label}>Longitude</label>
                <input name="coordinates_lng" value={form.coordinates_lng} onChange={handleChange} style={styles.input} placeholder="e.g. 120.812528" />
              </div>
              {form.coordinates_lat && form.coordinates_lng && (
                <div style={styles.fullWidth}>
                  
                  <a href={`https://www.google.com/maps?q=${form.coordinates_lat},${form.coordinates_lng}`}
                    target="_blank"
                    rel="noreferrer"
                    style={styles.mapLink}
                  >
                    Preview spot on Google Maps →
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* ── AR Models ── */}
          <div style={styles.section}>
            <div style={styles.arHeader}>
              <div>
                <p style={styles.sectionTitle}>AR Model Positions</p>
                <p style={styles.arSubtitle}>
                  Each entry places one AR 3D model at a GPS location.
                  {arModels.length > 0 && <span style={styles.arCount}> {arModels.length} model{arModels.length > 1 ? 's' : ''}</span>}
                </p>
              </div>
              <button onClick={addArModel} style={styles.addArBtn}>+ Add AR Model</button>
            </div>

            {arModels.length === 0 && (
              <div style={styles.emptyAr}>
                <p>No AR models added yet. Click "+ Add AR Model" to add one.</p>
              </div>
            )}

            {arModels.map((model, index) => (
              <div key={index} style={styles.arCard}>
                <div style={styles.arCardHeader}>
                  <div style={styles.arBadge}>
                    <span style={styles.arBadgeDot} />
                    AR Model {index + 1}
                  </div>
                  <button onClick={() => removeArModel(index)} style={styles.removeBtn}>
                    ✕ Remove
                  </button>
                </div>

                <div style={styles.grid}>
                  <div>
                    <label style={styles.label}>Latitude</label>
                    <input
                      value={model.lat}
                      onChange={e => handleArChange(index, 'lat', e.target.value)}
                      style={styles.input}
                      placeholder="e.g. 14.846306"
                    />
                  </div>
                  <div>
                    <label style={styles.label}>Longitude</label>
                    <input
                      value={model.lng}
                      onChange={e => handleArChange(index, 'lng', e.target.value)}
                      style={styles.input}
                      placeholder="e.g. 120.812528"
                    />
                  </div>
                </div>

                {model.lat && model.lng && (
                  
                  <a href={`https://www.google.com/maps?q=${model.lat},${model.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    style={styles.mapLink}
                  >
                    Preview AR position on Google Maps →
                  </a>
                )}
              </div>
            ))}

          </div>

        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <div style={styles.footerLeft}>
            <span style={styles.requiredNote}>* Required fields</span>
          </div>
          <div style={styles.footerRight}>
            <button onClick={onCancel} style={styles.cancelBtn}>Cancel</button>
            <button onClick={handleSave} style={styles.saveBtn}>
              {initial ? 'Save Changes' : 'Add Spot'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

const styles = {
  overlay:      { position: 'fixed', inset: 0, background: 'rgba(45,31,30,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 },
  modal:        { background: '#fff', borderRadius: 18, width: '100%', maxWidth: 680, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(74,46,44,0.2)' },
  modalHeader:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '22px 28px', borderBottom: '1px solid #f0e0de', flexShrink: 0 },
  modalTitle:   { fontSize: 20, fontWeight: 700, color: '#2d1f1e' },
  closeBtn:     { width: 32, height: 32, borderRadius: 8, border: 'none', background: '#faf0ee', color: '#4a2e2c', fontWeight: 700, cursor: 'pointer', fontSize: 14 },
  body:         { overflowY: 'auto', flex: 1, padding: '0 28px 8px' },
  section:      { paddingTop: 20, paddingBottom: 16, borderBottom: '1px solid #faf0ee' },
  sectionTitle: { fontSize: 13, fontWeight: 700, color: '#4a2e2c', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 },
  grid:         { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 },
  fullWidth:    { gridColumn: '1 / -1' },
  label:        { display: 'block', fontSize: 12, fontWeight: 600, color: '#9a7a78', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' },
  required:     { color: '#e74c3c', fontWeight: 700 },
  hint:         { fontSize: 11, color: '#b0908e', fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 4 },
  input:        { width: '100%', padding: '10px 14px', borderRadius: 9, border: '1px solid #f0e0de', fontSize: 14, color: '#2d1f1e', outline: 'none', background: '#fafafa', boxSizing: 'border-box' },
  select:       { width: '100%', padding: '10px 14px', borderRadius: 9, border: '1px solid #f0e0de', fontSize: 14, color: '#2d1f1e', outline: 'none', background: '#fafafa', boxSizing: 'border-box', cursor: 'pointer', appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%239a7a78' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center' },
  textarea:     { width: '100%', padding: '10px 14px', borderRadius: 9, border: '1px solid #f0e0de', fontSize: 14, color: '#2d1f1e', outline: 'none', background: '#fafafa', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' },
  imgPreview:   { width: '100%', height: 140, objectFit: 'cover', borderRadius: 10, marginTop: 10, border: '1px solid #f0e0de' },
  badgePreview: { width: 60, height: 60, objectFit: 'contain', borderRadius: 10, marginTop: 10, border: '1px solid #f0e0de' },
  mapLink:      { display: 'inline-block', marginTop: 10, fontSize: 13, color: '#6b4b45', fontWeight: 600, textDecoration: 'none' },

  // AR section
  arHeader:    { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  arSubtitle:  { fontSize: 13, color: '#9a7a78', marginTop: 2 },
  arCount:     { fontWeight: 600, color: '#6b4b45' },
  addArBtn:    { padding: '8px 16px', background: '#6b4b45', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 },
  emptyAr:     { background: '#faf5f4', borderRadius: 10, padding: '20px', textAlign: 'center', color: '#9a7a78', fontSize: 14, border: '1px dashed #f0e0de' },
  arCard:      { background: '#faf5f4', borderRadius: 12, padding: 16, marginBottom: 12, border: '1px solid #f0e0de' },
  arCardHeader:{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  arBadge:     { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#4a2e2c' },
  arBadgeDot:  { width: 8, height: 8, borderRadius: '50%', background: '#6b4b45', display: 'inline-block' },
  removeBtn:   { padding: '5px 12px', background: '#fff0f0', color: '#c0392b', border: '1px solid #ffd0d0', borderRadius: 7, fontWeight: 600, fontSize: 12, cursor: 'pointer' },

  // Footer
  footer:       { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 28px', borderTop: '1px solid #f0e0de', flexShrink: 0 },
  footerLeft:   { },
  footerRight:  { display: 'flex', gap: 10 },
  requiredNote: { fontSize: 12, color: '#9a7a78' },
  cancelBtn:    { padding: '10px 22px', borderRadius: 9, border: '1px solid #f0e0de', background: '#fff', color: '#7a5a58', fontWeight: 600, fontSize: 14, cursor: 'pointer' },
  saveBtn:      { padding: '10px 22px', borderRadius: 9, border: 'none', background: '#6b4b45', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer' },
};
import { useState } from 'react';

const FIELDS = [
  { key: 'name',          label: 'Name',           type: 'input' },
  { key: 'category',      label: 'Category',       type: 'input' },
  { key: 'entranceFee',   label: 'Entrance Fee',   type: 'input' },
  { key: 'visitingHours', label: 'Visiting Hours', type: 'input' },
  { key: 'image',         label: 'Image URL',      type: 'input' },
  { key: 'modelUrl',      label: '3D Model URL',   type: 'input' },
  { key: 'description',   label: 'Description',    type: 'textarea' },
];

export default function SpotForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    name:          initial?.name          || '',
    category:      initial?.category      || '',
    entranceFee:   initial?.entranceFee   || '',
    visitingHours: initial?.visitingHours || '',
    image:         initial?.image         || '',
    modelUrl:      initial?.modelUrl      || '',
    description:   initial?.description   || '',
  });

  const handleChange = (e) =>
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>{initial ? 'Edit Spot' : 'Add New Spot'}</h2>
          <button onClick={onCancel} style={styles.closeBtn}>✕</button>
        </div>

        <div style={styles.grid}>
          {FIELDS.map(field => (
            <div key={field.key} style={field.type === 'textarea' ? styles.fullWidth : {}}>
              <label style={styles.label}>{field.label}</label>
              {field.type === 'textarea' ? (
                <textarea
                  name={field.key}
                  value={form[field.key]}
                  onChange={handleChange}
                  style={styles.textarea}
                  rows={4}
                />
              ) : (
                <input
                  name={field.key}
                  value={form[field.key]}
                  onChange={handleChange}
                  style={styles.input}
                />
              )}
            </div>
          ))}
        </div>

        <div style={styles.footer}>
          <button onClick={onCancel} style={styles.cancelBtn}>Cancel</button>
          <button onClick={() => onSave(form)} style={styles.saveBtn}>
            {initial ? 'Save Changes' : 'Add Spot'}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay:     { position: 'fixed', inset: 0, background: 'rgba(45,31,30,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 },
  modal:       { background: '#fff', borderRadius: 18, width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(74,46,44,0.2)' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '22px 28px 0' },
  modalTitle:  { fontSize: 20, fontWeight: 700, color: '#2d1f1e' },
  closeBtn:    { width: 32, height: 32, borderRadius: 8, border: 'none', background: '#faf0ee', color: '#4a2e2c', fontWeight: 700, cursor: 'pointer', fontSize: 14 },
  grid:        { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: '20px 28px' },
  fullWidth:   { gridColumn: '1 / -1' },
  label:       { display: 'block', fontSize: 12, fontWeight: 600, color: '#9a7a78', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' },
  input:       { width: '100%', padding: '10px 14px', borderRadius: 9, border: '1px solid #f0e0de', fontSize: 14, color: '#2d1f1e', outline: 'none', background: '#fafafa', boxSizing: 'border-box' },
  textarea:    { width: '100%', padding: '10px 14px', borderRadius: 9, border: '1px solid #f0e0de', fontSize: 14, color: '#2d1f1e', outline: 'none', background: '#fafafa', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' },
  footer:      { display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '0 28px 24px' },
  cancelBtn:   { padding: '10px 22px', borderRadius: 9, border: '1px solid #f0e0de', background: '#fff', color: '#7a5a58', fontWeight: 600, fontSize: 14, cursor: 'pointer' },
  saveBtn:     { padding: '10px 22px', borderRadius: 9, border: 'none', background: '#6b4b45', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer' },
};
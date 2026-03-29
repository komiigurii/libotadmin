import { useState } from 'react';

export default function SpotForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    name:          initial?.name          || '',
    category:      initial?.category      || '',
    description:   initial?.description   || '',
    entranceFee:   initial?.entranceFee   || '',
    visitingHours: initial?.visitingHours || '',
    image:         initial?.image         || '',
    modelUrl:      initial?.modelUrl      || '',
  });

  const handleChange = (e) =>
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  return (
    <div style={styles.card}>
      <h3>{initial ? 'Edit Spot' : 'Add New Spot'}</h3>
      {Object.keys(form).map(field => (
        <div key={field} style={{ marginBottom: 10 }}>
          <label style={styles.label}>{field}</label>
          {field === 'description' ? (
            <textarea name={field} value={form[field]} onChange={handleChange} style={styles.textarea} />
          ) : (
            <input name={field} value={form[field]} onChange={handleChange} style={styles.input} />
          )}
        </div>
      ))}
      <div style={{ display:'flex', gap:10, marginTop:16 }}>
        <button onClick={() => onSave(form)} style={styles.saveBtn}>Save</button>
        <button onClick={onCancel}           style={styles.cancelBtn}>Cancel</button>
      </div>
    </div>
  );
}

const styles = {
  card:      { background:'#faf5f4', padding:24, borderRadius:16, marginBottom:24, border:'1px solid #f0e0de' },
  label:     { display:'block', fontSize:12, fontWeight:700, color:'#4a2e2c', marginBottom:4, textTransform:'capitalize' },
  input:     { width:'100%', padding:10, borderRadius:8, border:'1px solid #f0e0de', fontSize:14, boxSizing:'border-box' },
  textarea:  { width:'100%', padding:10, borderRadius:8, border:'1px solid #f0e0de', fontSize:14, minHeight:80, boxSizing:'border-box' },
  saveBtn:   { background:'#6b4b45', color:'#fff', border:'none', padding:'10px 24px', borderRadius:8, fontWeight:700, cursor:'pointer' },
  cancelBtn: { background:'#f0e0de', color:'#4a2e2c', border:'none', padding:'10px 24px', borderRadius:8, fontWeight:700, cursor:'pointer' },
};
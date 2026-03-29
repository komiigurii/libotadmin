import { useEffect, useState } from 'react';
import { spotAPI } from '../api/api';
import SpotForm from '../components/SpotForm';

export default function Spots() {
  const [spots, setSpots]       = useState([]);
  const [editing, setEditing]   = useState(null);   // spot being edited
  const [showForm, setShowForm] = useState(false);

  const load = async () => setSpots(await spotAPI.getAll());
  useEffect(() => { load(); }, []);

  const handleDelete = async (id) => {
    if (!confirm('Delete this spot?')) return;
    await spotAPI.delete(id);
    load();
  };

  const handleSave = async (formData) => {
    if (editing) {
      await spotAPI.update(editing._id, formData);
    } else {
      await spotAPI.create(formData);
    }
    setShowForm(false);
    setEditing(null);
    load();
  };

  return (
    <div style={{ padding: 30 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:20 }}>
        <h2>Spots</h2>
        <button onClick={() => { setEditing(null); setShowForm(true); }} style={btnStyle}>
          + Add Spot
        </button>
      </div>

      {showForm && (
        <SpotForm
          initial={editing}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      <table style={{ width:'100%', borderCollapse:'collapse' }}>
        <thead>
          <tr style={{ background:'#faf5f4' }}>
            {['Name','Category','Entrance Fee','Visiting Hours','Actions'].map(h => (
              <th key={h} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {spots.map(spot => (
            <tr key={spot._id} style={{ borderBottom:'1px solid #f0e0de' }}>
              <td style={tdStyle}>{spot.name}</td>
              <td style={tdStyle}>{spot.category}</td>
              <td style={tdStyle}>{spot.entranceFee}</td>
              <td style={tdStyle}>{spot.visitingHours}</td>
              <td style={tdStyle}>
                <button onClick={() => { setEditing(spot); setShowForm(true); }} style={editBtn}>Edit</button>
                <button onClick={() => handleDelete(spot._id)} style={deleteBtn}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const btnStyle    = { background:'#6b4b45', color:'#fff', border:'none', padding:'10px 20px', borderRadius:8, cursor:'pointer', fontWeight:700 };
const editBtn     = { ...btnStyle, marginRight:8, background:'#4a2e2c' };
const deleteBtn   = { ...btnStyle, background:'#c0392b' };
const thStyle     = { padding:'12px 16px', textAlign:'left', fontWeight:700, color:'#4a2e2c' };
const tdStyle     = { padding:'12px 16px', color:'#7a5a58' };
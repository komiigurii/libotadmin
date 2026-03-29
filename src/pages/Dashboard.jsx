import { useEffect, useState } from 'react';
import { spotAPI } from '../api/api';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const [spots, setSpots]     = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    spotAPI.getAll()
      .then(data => { setSpots(data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const stats = [
    { label: 'Total Spots',    value: spots.length,                                    color: '#6b4b45' },
    { label: 'Categories',     value: new Set(spots.map(s => s.category)).size,        color: '#4a2e2c' },
    { label: 'Free Spots',     value: spots.filter(s => !s.entranceFee || s.entranceFee === 'Free').length, color: '#8b6b5a' },
    { label: 'Total Visits',   value: spots.reduce((a, s) => a + (s.visitCount || 0), 0), color: '#3d2420' },
  ];

  const topSpots = [...spots].sort((a, b) => (b.visitCount || 0) - (a.visitCount || 0)).slice(0, 5);

  return (
    <div style={styles.page}>

      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Dashboard</h1>
          <p style={styles.subtitle}>Welcome back, Admin</p>
        </div>
        <button onClick={() => navigate('/spots')} style={styles.primaryBtn}>
          + Add New Spot
        </button>
      </div>

      {/* Stats cards */}
      {loading ? (
        <div style={styles.loading}>Loading...</div>
      ) : (
        <>
          <div style={styles.statsGrid}>
            {stats.map(stat => (
              <div key={stat.label} style={styles.statCard}>
                <div style={{ ...styles.statIcon, background: stat.color }}>
                  {stat.label[0]}
                </div>
                <div>
                  <div style={styles.statValue}>{stat.value}</div>
                  <div style={styles.statLabel}>{stat.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Top spots */}
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Top Visited Spots</h2>
            <div style={styles.card}>
              {topSpots.length === 0 ? (
                <p style={styles.empty}>No spots yet</p>
              ) : (
                topSpots.map((spot, i) => (
                  <div key={spot._id} style={styles.spotRow}>
                    <div style={styles.spotRank}>{i + 1}</div>
                    <div style={styles.spotImage}>
                      {spot.image
                        ? <img src={spot.image} alt={spot.name} style={styles.img} />
                        : <div style={styles.imgPlaceholder}>{spot.name?.[0]}</div>
                      }
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={styles.spotName}>{spot.name}</div>
                      <div style={styles.spotCat}>{spot.category}</div>
                    </div>
                    <div style={styles.visitBadge}>{spot.visitCount || 0} visits</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const styles = {
  page:        { padding: '32px 40px', maxWidth: 1100, margin: '0 auto' },
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 },
  title:       { fontSize: 26, fontWeight: 700, color: '#2d1f1e', marginBottom: 4 },
  subtitle:    { fontSize: 14, color: '#9a7a78' },
  primaryBtn:  { padding: '10px 22px', background: '#6b4b45', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: 'pointer' },
  loading:     { textAlign: 'center', padding: 60, color: '#9a7a78' },
  statsGrid:   { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 },
  statCard:    { background: '#fff', borderRadius: 14, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 1px 4px rgba(74,46,44,0.07)', border: '1px solid #f0e0de' },
  statIcon:    { width: 44, height: 44, borderRadius: 12, color: '#fff', fontWeight: 700, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  statValue:   { fontSize: 26, fontWeight: 700, color: '#2d1f1e' },
  statLabel:   { fontSize: 13, color: '#9a7a78', marginTop: 2 },
  section:     { marginBottom: 32 },
  sectionTitle:{ fontSize: 17, fontWeight: 600, color: '#2d1f1e', marginBottom: 14 },
  card:        { background: '#fff', borderRadius: 14, border: '1px solid #f0e0de', overflow: 'hidden', boxShadow: '0 1px 4px rgba(74,46,44,0.07)' },
  empty:       { padding: 40, textAlign: 'center', color: '#9a7a78' },
  spotRow:     { display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderBottom: '1px solid #faf0ee' },
  spotRank:    { width: 28, height: 28, borderRadius: 8, background: '#faf0ee', color: '#6b4b45', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  spotImage:   { width: 42, height: 42, borderRadius: 10, overflow: 'hidden', flexShrink: 0 },
  img:         { width: '100%', height: '100%', objectFit: 'cover' },
  imgPlaceholder: { width: '100%', height: '100%', background: '#f0e0de', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#6b4b45' },
  spotName:    { fontWeight: 600, fontSize: 14, color: '#2d1f1e' },
  spotCat:     { fontSize: 12, color: '#9a7a78', marginTop: 2 },
  visitBadge:  { padding: '4px 12px', background: '#faf0ee', borderRadius: 20, fontSize: 12, fontWeight: 600, color: '#6b4b45' },
};
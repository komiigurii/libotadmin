import { useEffect, useState } from 'react';
import { spotAPI } from '../api/api';
import { useNavigate } from 'react-router-dom';
import { theme as t } from '../theme';

export default function Dashboard() {
  const [spots,   setSpots]   = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    spotAPI.getAll()
      .then(data => { setSpots(data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const stats = [
    { label: 'Total Spots',  value: spots.length,                                                          icon: '📍', variant: 'brand'   },
    { label: 'Free Spots',   value: spots.filter(s => !s.entranceFee || s.entranceFee === 'Free').length,  icon: '🎫', variant: 'success' },
    { label: 'Total Visits', value: spots.reduce((a, s) => a + (s.visitCount || 0), 0).toLocaleString(),  icon: '👁', variant: 'info'    },
  ];

  const topSpots = [...spots]
    .sort((a, b) => (b.visitCount || 0) - (a.visitCount || 0))
    .slice(0, 5);

  return (
    <div style={s.page}>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>Dashboard</h1>
          <p style={s.pageSub}>Welcome back, Admin</p>
        </div>
        <button onClick={() => navigate('/spots')} style={s.btnPrimary}>
          + Add New Spot
        </button>
      </div>

      {loading ? (
        <div style={s.loading}>Loading…</div>
      ) : (
        <>
          <div style={s.statsGrid}>
            {stats.map(stat => (
              <div key={stat.label} style={s.statCard}>
                <div style={{ ...s.statIcon, ...s.iconVariants[stat.variant] }}>
                  {stat.icon}
                </div>
                <div>
                  <div style={s.statVal}>{stat.value}</div>
                  <div style={s.statLbl}>{stat.label}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={s.sectionHead}>
            <h2 style={s.sectionTitle}>Top Visited Spots</h2>
          </div>

          <div style={s.card}>
            {topSpots.length === 0 ? (
              <p style={s.empty}>No spots yet</p>
            ) : (
              topSpots.map((spot, i) => (
                <div key={spot._id} style={s.cardRow}>
                  <div style={s.rankNum}>{i + 1}</div>
                  <div style={s.spotThumbWrap}>
                    {spot.image
                      ? <img src={spot.image} alt={spot.name} style={s.spotThumb} />
                      : <div style={s.spotThumbPh}>{spot.name?.[0]}</div>
                    }
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={s.cardName}>{spot.name}</div>
                    <div style={s.cardSub}>{spot.category?.[0] || spot.category}</div>
                  </div>
                  <span style={s.visitBadge}>{(spot.visitCount || 0).toLocaleString()} visits</span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

const s = {
  page:       { padding: '28px 32px', maxWidth: 1100, margin: '0 auto' },
  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  pageTitle:  { fontSize: 22, fontWeight: 600, color: t.textPrimary, marginBottom: 4 },
  pageSub:    { fontSize: 13, color: t.textSecondary },
  btnPrimary: { padding: '9px 20px', background: t.brandSolid, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: 'pointer' },
  loading:    { textAlign: 'center', padding: 60, color: t.textSecondary },

  statsGrid:  { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 28 },
  statCard:   { background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 14, padding: '20px 22px', display: 'flex', alignItems: 'center', gap: 16 },
  statIcon:   { width: 46, height: 46, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 },
  iconVariants: {
    brand:   { background: t.brandSoft,  color: t.brand   },
    success: { background: t.successBg, color: t.success },
    info:    { background: t.infoBg,    color: t.info    },
  },
  statVal:    { fontSize: 26, fontWeight: 600, color: t.textPrimary, lineHeight: 1 },
  statLbl:    { fontSize: 12, color: t.textSecondary, marginTop: 4 },

  sectionHead:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sectionTitle: { fontSize: 15, fontWeight: 600, color: t.textPrimary },

  card:       { background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 14, overflow: 'hidden' },
  cardRow:    { display: 'flex', alignItems: 'center', gap: 14, padding: '13px 18px', borderBottom: `1px solid ${t.divider}` },
  rankNum:    { width: 26, height: 26, borderRadius: 7, background: t.brandSoft, color: t.brand, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  spotThumbWrap: { flexShrink: 0 },
  spotThumb:  { width: 40, height: 40, borderRadius: 9, objectFit: 'cover' },
  spotThumbPh:{ width: 40, height: 40, borderRadius: 9, background: t.brandSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: t.brand, fontSize: 15 },
  cardName:   { fontWeight: 600, fontSize: 13, color: t.textPrimary },
  cardSub:    { fontSize: 11, color: t.textSecondary, marginTop: 2 },
  visitBadge: { marginLeft: 'auto', padding: '4px 12px', background: t.brandSoft, borderRadius: 20, fontSize: 12, fontWeight: 600, color: t.brand },
  empty:      { padding: 40, textAlign: 'center', color: t.textSecondary },
};
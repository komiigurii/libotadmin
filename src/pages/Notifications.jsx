import { useEffect, useState } from 'react';
import { commentAPI, inactiveUsersAPI } from '../api/api';
import { theme as t } from '../theme';

function toArray(data) {
  if (!data) return [];
  if (Array.isArray(data))         return data;
  if (Array.isArray(data.reviews)) return data.reviews;
  if (Array.isArray(data.data))    return data.data;
  return [];
}

const TYPE_STYLE = {
  inactive_user: { color: t.warning,  bar: t.warning },
  mod_request:   { color: t.purple,   bar: t.purple  },
};

export default function Notifications() {
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [commentsData, inactiveData] = await Promise.all([
        commentAPI.getAll(),
        inactiveUsersAPI.getAll(),
      ]);

      const feed = [];

      const pendingRequests = toArray(commentsData).filter(c => (c.flagStatus || 'none') === 'pending');
      pendingRequests.forEach(r => {
        const spotName = (r.spotId && typeof r.spotId === 'object' ? r.spotId.name : '') || 'a spot';
        feed.push({
          type: 'mod_request',
          urgent: false,
          title: 'MOD REQUEST',
          message: `${r.flaggedByName || 'A moderator'} (${spotName}) submitted a new review request.`,
          date: r.flaggedAt || r.createdAt,
        });
      });

      const pendingCount     = inactiveData?.pendingCount || 0;
      const approachingCount = inactiveData?.approachingCount || 0;

      if (pendingCount > 0) {
        feed.push({
          type: 'inactive_user',
          urgent: true,
          title: 'INACTIVE USER',
          message: `${pendingCount} user${pendingCount > 1 ? 's have' : ' has'} exceeded 30 days of inactivity and require${pendingCount > 1 ? '' : 's'} archival review.`,
          date: new Date(),
        });
      }
      if (approachingCount > 0) {
        feed.push({
          type: 'inactive_user',
          urgent: false,
          title: 'INACTIVE USER',
          message: `${approachingCount} additional user${approachingCount > 1 ? 's are' : ' is'} approaching the 30-day inactivity threshold (0–5 days remaining).`,
          date: new Date(),
        });
      }

      feed.sort((a, b) => new Date(b.date) - new Date(a.date));
      setItems(feed);
    } catch {
      setItems([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <div style={s.page}>
      <div style={s.pageHeader}>
        <h1 style={s.pageTitle}>Notifications</h1>
        <p style={s.pageSub}>System-generated alerts requiring admin attention</p>
      </div>

      {loading ? (
        <div style={s.empty}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={s.emptyState}>
          <div style={s.emptyIcon}>✓</div>
          <div style={s.emptyText}>All caught up</div>
          <div style={s.emptySub}>No pending alerts right now.</div>
        </div>
      ) : (
        items.map((n, i) => {
          const style = TYPE_STYLE[n.type] || TYPE_STYLE.mod_request;
          return (
            <div key={i} style={{ ...s.card, borderLeftColor: style.bar }}>
              <div style={s.cardTop}>
                <div style={s.metaRow}>
                  <span style={{ ...s.typeLabel, color: style.color }}>{n.title}</span>
                  {n.urgent && <span style={s.urgentPill}>URGENT</span>}
                </div>
                <span style={s.dateText}>
                  {n.date ? new Date(n.date).toLocaleString('en-PH', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                </span>
              </div>
              <p style={s.message}>{n.message}</p>
            </div>
          );
        })
      )}
    </div>
  );
}

const s = {
  page:       { padding: '28px 32px', maxWidth: 900, margin: '0 auto' },
  pageHeader: { marginBottom: 22 },
  pageTitle:  { fontSize: 22, fontWeight: 600, color: t.textPrimary, marginBottom: 4 },
  pageSub:    { fontSize: 13, color: t.textSecondary },

  card:       { background: t.cardBg, border: `1px solid ${t.border}`, borderLeft: '3px solid', borderRadius: 12, padding: '14px 18px', marginBottom: 10 },
  cardTop:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 8 },
  metaRow:    { display: 'flex', alignItems: 'center', gap: 8 },
  typeLabel:  { fontSize: 11, fontWeight: 700, letterSpacing: '0.06em' },
  urgentPill: { padding: '2px 8px', background: t.dangerBg, color: t.danger, borderRadius: 6, fontSize: 10, fontWeight: 700, letterSpacing: '0.03em' },
  dateText:   { fontSize: 12, color: t.textMuted },
  message:    { fontSize: 14, color: t.textPrimary, margin: 0, lineHeight: 1.5 },

  empty:      { padding: 60, textAlign: 'center', color: t.textSecondary },
  emptyState: { textAlign: 'center', padding: '70px 20px' },
  emptyIcon:  { width: 52, height: 52, borderRadius: '50%', background: t.brandSoft, color: t.brand, fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' },
  emptyText:  { fontSize: 16, fontWeight: 600, color: t.textPrimary, marginBottom: 6 },
  emptySub:   { fontSize: 13, color: t.textSecondary },
};
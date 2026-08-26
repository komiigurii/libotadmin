import { useEffect, useState } from 'react';
import { bannedAccountsAPI } from '../api/api';
import { theme as t } from '../theme';

function formatRemaining(expiresAt) {
  if (!expiresAt) return 'Permanent';
  const ms = new Date(expiresAt) - Date.now();
  if (ms <= 0) return 'Expired (pending auto-lift)';
  const days = Math.ceil(ms / 86_400_000);
  return `${days} day${days === 1 ? '' : 's'} left`;
}

export default function BannedAccounts() {
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [error,   setError]   = useState('');
  const [busyId,  setBusyId]  = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await bannedAccountsAPI.getAll();
      setUsers(data || []);
    } catch (err) {
      console.error('Failed to load banned accounts:', err);
      setError(err.message || 'Failed to load banned accounts');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleUnban = async (clerkUserId) => {
    if (!confirm('Unban this account?')) return;
    setBusyId(clerkUserId);
    try {
      await bannedAccountsAPI.unban(clerkUserId);
      setUsers(prev => prev.filter(u => u.clerkUserId !== clerkUserId));
    } catch (err) {
      alert('Failed to unban: ' + (err.message || 'Unknown error'));
    }
    setBusyId(null);
  };

  const filtered = users.filter(u => {
    const name  = u.name?.toLowerCase()  || '';
    const email = u.email?.toLowerCase() || '';
    const q = search.toLowerCase();
    return name.includes(q) || email.includes(q);
  });

  return (
    <div style={s.page}>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>Banned Accounts</h1>
          <p style={s.pageSub}>Accounts suspended or permanently banned for policy violations</p>
        </div>
      </div>

      {error && (
        <div style={s.errorBanner}>
          ⚠ {error}
          <button onClick={() => setError('')} style={s.errorClose}>✕</button>
        </div>
      )}

      {users.length > 0 && (
        <div style={s.filterRow}>
          <input
            placeholder="Search by name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={s.searchInput}
          />
        </div>
      )}

      {loading ? (
        <div style={s.emptyCard}>Loading banned accounts…</div>
      ) : users.length === 0 ? (
        <div style={s.emptyCard}>No banned accounts found.</div>
      ) : filtered.length === 0 ? (
        <div style={s.emptyCard}>No banned accounts match your search.</div>
      ) : (
        <div style={s.list}>
          <div style={s.listHead}>
            <span style={s.colUser}>User</span>
            <span style={s.colReason}>Reason</span>
            <span style={s.colStrikes}>Strikes</span>
            <span style={s.colStatus}>Status</span>
            <span style={s.colActions}></span>
          </div>

          {filtered.map(u => (
            <div key={u.clerkUserId} style={s.row}>
              <div style={s.colUser}>
                <div style={s.avatar}>{u.name?.[0]?.toUpperCase() || '?'}</div>
                <div>
                  <div style={s.userName}>{u.name || 'Unknown'}</div>
                  <div style={s.userEmail}>{u.email}</div>
                </div>
              </div>

              <div style={s.colReason} title={u.banReason}>
                {u.banReason || '—'}
              </div>

              <div style={s.colStrikes}>
                {u.strikeCount || 0}
              </div>

              <div style={s.colStatus}>
                <span style={u.isPermanent ? s.badgePermanent : s.badgeTemp}>
                  {u.isPermanent ? 'Permanent' : formatRemaining(u.banExpiresAt)}
                </span>
                {u.appealStatus === 'submitted' && (
                  <span style={s.badgeAppeal}>Appeal pending</span>
                )}
              </div>

              <div style={s.colActions}>
                <button
                  onClick={() => handleUnban(u.clerkUserId)}
                  style={s.btnUnban}
                  disabled={busyId === u.clerkUserId}
                >
                  {busyId === u.clerkUserId ? 'Unbanning…' : 'Unban'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const s = {
  page:        { padding: '28px 32px', maxWidth: 1100, margin: '0 auto' },
  pageHeader:  { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  pageTitle:   { fontSize: 22, fontWeight: 600, color: t.textPrimary, marginBottom: 4 },
  pageSub:     { fontSize: 13, color: t.textSecondary },

  errorBanner: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: t.dangerBg, border: `1px solid ${t.danger}44`, borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: t.danger, fontSize: 14, fontWeight: 500 },
  errorClose:  { background: 'none', border: 'none', color: t.danger, cursor: 'pointer', fontWeight: 700, fontSize: 16 },

  filterRow:   { marginBottom: 18 },
  searchInput: { width: '100%', padding: '10px 14px', borderRadius: 10, border: `1px solid ${t.border}`, fontSize: 14, background: t.cardBg, outline: 'none', color: t.textPrimary, boxSizing: 'border-box' },

  list:        { background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 14, overflow: 'hidden' },
  listHead:    { display: 'grid', gridTemplateColumns: '2fr 2fr 0.7fr 1.3fr 100px', gap: 12, alignItems: 'center', padding: '10px 18px', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: t.textMuted, borderBottom: `1px solid ${t.border}` },
  row:         { display: 'grid', gridTemplateColumns: '2fr 2fr 0.7fr 1.3fr 100px', gap: 12, alignItems: 'center', padding: '14px 18px', borderBottom: `1px solid ${t.divider}` },

  //fix this shti
  colUser:     { display: 'flex', alignItems: 'center', gap: 10 },
  colReason:   { fontSize: 13, color: t.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  colStrikes:  { fontSize: 13, fontWeight: 600, color: t.textPrimary },
  colStatus:   { fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' },
  colActions:  { display: 'flex', justifyContent: 'flex-end' },

  avatar:      { width: 34, height: 34, borderRadius: '50%', background: t.brandSoft, color: t.brand, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 },
  userName:    { fontWeight: 600, fontSize: 13.5, color: t.textPrimary },
  userEmail:   { fontSize: 12, color: t.textMuted },

  badgePermanent: { padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: t.dangerBg, color: t.danger },
  badgeTemp:      { padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: t.warningBg, color: t.warning },
  badgeAppeal:    { padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: t.infoBg, color: t.info },

  btnUnban:    { padding: '6px 14px', background: t.brandSoft, color: t.brand, border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 12, cursor: 'pointer' },

  emptyCard:   { padding: 70, textAlign: 'center', color: t.textSecondary, fontSize: 14, background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 14 },
};
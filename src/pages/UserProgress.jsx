import { useEffect, useMemo, useState } from 'react';
import { userProgressAPI } from '../api/api';
import { theme as t, radius, shadow } from '../theme';
import Icon from '../components/Icon';
import {
  Page, PageHeader, Toolbar, SearchInput, Table, Th, Td,
  EmptyState, Loading, ErrorBanner, Card,
} from '../components/Layout';

// User Progress module — the traveler leaderboard, plus the engagement figures
// that give the ranking some context. Read-only by design: this module is for
// tracking achievements and activity trends, not for acting on accounts (that
// lives in Inactive Users / Banned Accounts).

const fmtDate = (d) => {
  if (!d) return 'Never';
  const days = Math.floor((Date.now() - new Date(d)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
};

// Podium colours for the top three; everyone else gets a plain rank number.
const MEDAL = { 1: '#F2CE1B', 2: '#C7D0D2', 3: '#CD8B54' };

function StatCard({ label, value, hint }) {
  return (
    <div style={s.statCard} className="modern-card">
      <p style={s.statValue}>{value}</p>
      <p style={s.statLabel}>{label}</p>
      {hint && <p style={s.statHint}>{hint}</p>}
    </div>
  );
}

export default function UserProgress() {
  const [rows,    setRows]    = useState([]);
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [search,  setSearch]  = useState('');
  const [onlyExplorers, setOnlyExplorers] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await userProgressAPI.getAll();
      setRows(data?.leaderboard || []);
      setStats(data?.stats || null);
    } catch (err) {
      console.error('[UserProgress]', err);
      setError('Failed to load user progress.');
      setRows([]);
      setStats(null);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Filtering is derived, never stored — so the rank column always shows the
  // traveller's real standing rather than their position in a filtered list.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyExplorers && r.spotsVisited === 0) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || (r.email || '').toLowerCase().includes(q);
    });
  }, [rows, search, onlyExplorers]);

  return (
    <Page>
      <PageHeader
        title="Traveler Progress"
        subtitle="The traveler leaderboard — spots visited, missions completed, badges and points for everyone using the app."
        actions={
          <button onClick={load} style={s.refreshBtn} className="modern-btn" disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        }
      />

      {error && <ErrorBanner onDismiss={() => setError(null)}>{error}</ErrorBanner>}

      {stats && (
        <div style={s.statGrid}>
          <StatCard label="Travelers" value={stats.totalUsers} />
          <StatCard
            label="Explorers"
            value={stats.explorers}
            hint={stats.totalUsers ? `${Math.round((stats.explorers / stats.totalUsers) * 100)}% have visited a spot` : null}
          />
          <StatCard label="Active this week"  value={stats.activeLast7} />
          <StatCard label="Active this month" value={stats.activeLast30} />
          <StatCard label="Total spot visits" value={stats.totalVisits} hint={`${stats.avgVisits} avg per traveller`} />
          <StatCard label="Badges collected"  value={stats.totalBadges} />
        </div>
      )}

      <Toolbar>
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
        />
        <label style={s.checkRow}>
          <input
            type="checkbox"
            checked={onlyExplorers}
            onChange={(e) => setOnlyExplorers(e.target.checked)}
          />
          <span>Hide travellers with no visits</span>
        </label>
        <span style={s.count}>{visible.length} shown</span>
      </Toolbar>

      {loading ? (
        <Loading label="Loading traveler leaderboard…" />
      ) : visible.length === 0 ? (
        <EmptyState
          icon="users"
          title={rows.length === 0 ? 'No travellers yet' : 'No travellers match this filter'}
          subtitle={rows.length === 0 ? 'Rankings appear once someone visits a spot.' : 'Try a different search.'}
        />
      ) : (
        <Table
          head={<>
            <Th width={64}>Rank</Th>
            <Th>Traveller</Th>
            <Th align="right">Locations</Th>
            <Th align="right">Badges</Th>
            <Th align="right">Activities</Th>
            <Th align="right">Points</Th>
            <Th align="right">Last active</Th>
          </>}
        >
          {visible.map((r) => (
            <tr key={r.clerkUserId}>
              <Td>
                <span style={{ ...s.rank, ...(MEDAL[r.rank] ? { background: MEDAL[r.rank], color: '#2C2810' } : {}) }}>
                  {r.rank}
                </span>
              </Td>
              <Td>
                <div style={s.userCell}>
                  {r.profileImage
                    ? <img src={r.profileImage} alt="" style={s.avatar} />
                    : <div style={s.avatarEmpty}>{(r.name || '?')[0].toUpperCase()}</div>}
                  <div style={{ minWidth: 0 }}>
                    <div style={s.userName}>
                      {r.name}
                      {r.isBanned && <span style={s.bannedPill}>BANNED</span>}
                    </div>
                    <div style={s.userEmail}>{r.email}</div>
                  </div>
                </div>
              </Td>
              <Td align="right" style={{ color: t.brand, fontWeight: 700, fontSize: 14.5 }}>{r.spotsVisited}</Td>
              <Td align="right">{r.badges}</Td>
              <Td align="right">{r.missionsCompleted}</Td>
              <Td align="right">{r.points}</Td>
              <Td align="right" muted>{fmtDate(r.lastActiveAt)}</Td>
            </tr>
          ))}
        </Table>
      )}
    </Page>
  );
}

// Page shell, header, toolbar, table and empty state all come from
// components/Layout — only what's unique to this page is styled here.
const s = {
  refreshBtn: { padding: '9px 18px', background: t.accent, color: t.onAccent, border: 'none', borderRadius: radius.lg, fontWeight: 700, fontSize: 13.5, cursor: 'pointer', boxShadow: shadow.sm, flexShrink: 0 },

  statGrid:  { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 },
  statCard:  { background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: radius.lg, padding: '14px 16px', boxShadow: shadow.sm },
  statValue: { fontSize: 26, fontWeight: 800, color: t.textPrimary, letterSpacing: '-0.02em', lineHeight: 1.1 },
  statLabel: { fontSize: 12, color: t.textSecondary, marginTop: 4, fontWeight: 600 },
  statHint:  { fontSize: 11, color: t.textMuted, marginTop: 3 },

  checkRow:    { display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: t.textSecondary, cursor: 'pointer', userSelect: 'none' },
  count:       { fontSize: 12.5, color: t.textMuted, fontVariantNumeric: 'tabular-nums' },

  rank: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 26, height: 26, borderRadius: radius.pill, background: t.sidebarBg, color: t.textSecondary, fontWeight: 700, fontSize: 12.5, padding: '0 8px' },

  userCell:    { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 },
  avatar:      { width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 },
  avatarEmpty: { width: 30, height: 30, borderRadius: '50%', background: t.brandSoft, color: t.brand, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 },
  userName:    { fontWeight: 600, color: t.textPrimary, display: 'flex', alignItems: 'center', gap: 7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  userEmail:   { fontSize: 11.5, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  bannedPill:  { fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', background: t.dangerBg, color: t.danger, borderRadius: 4, padding: '2px 5px', flexShrink: 0 },
};

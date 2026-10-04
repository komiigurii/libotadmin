import { useEffect, useMemo, useState } from 'react';
import { userProgressAPI } from '../api/api';
import { theme as t, radius } from '../theme';
import {
  Page, PageHeader, Toolbar, SearchInput, FilterTabs, Table, Th, Td, Stat, Button, StatusPill,
  EmptyState, Loading, ErrorBanner, Avatar, pageStyles,
} from '../components/Layout';
import { fmtNum, timeAgo } from '../utils/format';

// Traveler Progress — the traveler leaderboard, plus the engagement figures
// that give the ranking some context. Read-only by design: this module is for
// tracking achievements and activity, not for acting on accounts (that lives
// in Inactive Accounts / Suspensions & Bans).

// Podium colours for the top three (gold, silver, bronze — the same in both
// themes, with dark ink on all three); everyone else gets a plain number.
const MEDAL = { 1: '#F2CE1B', 2: '#C7D0D2', 3: '#CD8B54' };
const MEDAL_INK = '#2C2810';

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
      setError('Couldn’t load traveler progress.');
      setRows([]);
      setStats(null);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Filtering is derived, never stored — so the rank column always shows the
  // traveler's real standing rather than their position in a filtered list.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyExplorers && r.spotsVisited === 0) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || (r.email || '').toLowerCase().includes(q);
    });
  }, [rows, search, onlyExplorers]);

  const explorers = rows.filter((r) => r.spotsVisited > 0).length;

  return (
    <Page>
      <PageHeader
        title="Traveler Progress"
        count={rows.length}
        subtitle="The traveler leaderboard, ranked by points as in the app — with spots visited, missions completed and badges for everyone using it."
        actions={<Button icon="refresh-cw" onClick={load} disabled={loading}>Refresh</Button>}
      />

      {error && <ErrorBanner onDismiss={() => setError(null)}>{error}</ErrorBanner>}

      {stats && (
        // Six figures: a narrower minimum keeps them on one row on a laptop
        // instead of five plus one orphan.
        <div style={{ ...s.statGrid, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <Stat label="Travelers" value={fmtNum(stats.totalUsers)} />
          <Stat
            label="Explorers"
            value={fmtNum(stats.explorers)}
            hint={stats.totalUsers ? `${Math.round((stats.explorers / stats.totalUsers) * 100)}% have visited a spot` : null}
          />
          <Stat label="Active this week"  value={fmtNum(stats.activeLast7)} />
          <Stat label="Active this month" value={fmtNum(stats.activeLast30)} />
          <Stat label="Spot visits" value={fmtNum(stats.totalVisits)} hint={`${stats.avgVisits} per traveler on average`} />
          <Stat label="Badges collected" value={fmtNum(stats.totalBadges)} />
        </div>
      )}

      <Toolbar>
        <FilterTabs
          label="Show"
          value={onlyExplorers ? 'explorers' : ''}
          onChange={(v) => setOnlyExplorers(v === 'explorers')}
          options={[
            { value: '',          label: 'All travelers',  count: rows.length },
            { value: 'explorers', label: 'Visited a spot', count: explorers },
          ]}
        />
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
        />
      </Toolbar>

      {loading ? (
        <Loading label="Loading the traveler leaderboard…" />
      ) : visible.length === 0 ? (
        <EmptyState
          icon="users"
          title={rows.length === 0 ? 'No travelers yet' : 'No travelers match'}
          subtitle={rows.length === 0 ? 'Rankings appear once someone visits a spot.' : 'Try a different search or filter.'}
        />
      ) : (
        <Table
          caption="Traveler leaderboard"
          head={<>
            <Th width={64}>Rank</Th>
            <Th>Traveler</Th>
            <Th align="right">Spots visited</Th>
            <Th align="right">Badges</Th>
            <Th align="right">Missions</Th>
            <Th align="right">Points</Th>
            <Th align="right">Last active</Th>
          </>}
        >
          {visible.map((r) => (
            <tr key={r.clerkUserId}>
              <Td>
                <span style={{ ...s.rank, ...(MEDAL[r.rank] ? { background: MEDAL[r.rank], color: MEDAL_INK } : {}) }}>
                  {r.rank}
                </span>
              </Td>
              <Td>
                <div style={s.person}>
                  <Avatar src={r.profileImage} name={r.name} size={32} />
                  <div style={{ minWidth: 0 }}>
                    <div style={s.personName}>
                      {r.name}
                      {r.isBanned && <StatusPill tone="danger" icon="slash">Banned</StatusPill>}
                    </div>
                    <div style={s.personSub}>{r.email}</div>
                  </div>
                </div>
              </Td>
              <Td align="right">{r.spotsVisited}</Td>
              <Td align="right">{r.badges}</Td>
              <Td align="right">{r.missionsCompleted}</Td>
              <Td align="right" strong>{fmtNum(r.points)}</Td>
              <Td align="right" muted>{r.lastActiveAt ? timeAgo(r.lastActiveAt) : 'Never'}</Td>
            </tr>
          ))}
        </Table>
      )}
    </Page>
  );
}

// Page shell, header, toolbar, table, person cell and stats all come from
// components/Layout — only the rank badge is this page's own.
const s = {
  ...pageStyles,
  rank: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 26, height: 26,
    borderRadius: radius.pill, background: t.sidebarBg, color: t.textSecondary,
    fontWeight: 700, fontSize: 12.5, padding: '0 8px', fontVariantNumeric: 'tabular-nums',
  },
};

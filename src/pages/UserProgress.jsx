import { useEffect, useMemo, useState } from 'react';
import { userProgressAPI } from '../api/api';
import { theme as t, radius } from '../theme';
import {
  Page, PageHeader, Toolbar, SearchInput, FilterTabs, Table, Th, Td, StatusPill,
  EmptyState, Loading, ErrorBanner, Avatar, pageStyles,
} from '../components/Layout';
import { fmtNum, timeAgo, fmtDay } from '../utils/format';
import { useLive } from '../api/live';

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

  // `quiet`: a live update — no spinner, and a failure keeps the board shown.
  const load = async ({ quiet = false } = {}) => {
    if (!quiet) {
      setLoading(true);
      setError(null);
    }
    try {
      const data = await userProgressAPI.getAll();
      setRows(data?.leaderboard || []);
      setStats(data?.stats || null);
    } catch (err) {
      console.error('[UserProgress]', err);
      if (!quiet) {
        setError('Couldn’t load traveler progress.');
        setRows([]);
        setStats(null);
      }
    }
    if (!quiet) setLoading(false);
  };

  useEffect(() => { load(); }, []);
  // Points and visits as travelers earn them, and names, photos and standing.
  useLive(['progress', 'travelers'], () => load({ quiet: true }));

  // Filtering is derived, never stored — so the rank column always shows the
  // traveler's real standing rather than their position in a filtered list.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyExplorers && r.spotsVisited === 0) return false;
      if (!q) return true;
      return [r.name, r.email, r.municipality].some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [rows, search, onlyExplorers]);

  const explorers = rows.filter((r) => r.spotsVisited > 0).length;

  // The engagement figures in the band's strip. Six cells, so a tablet folds
  // them to two rows of three; the week and the month share one.
  const v = (n) => (stats ? fmtNum(n) : loading ? '…' : '—');
  const strip = [
    { label: 'Travelers', hue: 'teal', value: v(stats?.totalUsers), hint: 'with an account' },
    { label: 'Explorers', value: v(stats?.explorers),
      hint: stats?.totalUsers ? `${Math.round((stats.explorers / stats.totalUsers) * 100)}% have visited a spot` : null },
    { label: 'Active this week', value: v(stats?.activeLast7), hint: stats ? `${fmtNum(stats.activeLast30)} this month` : null },
    { label: 'Spot visits', hue: 'magenta', value: v(stats?.totalVisits), hint: stats ? `${stats.avgVisits} per traveler on average` : null },
    { label: 'Badges collected', value: v(stats?.totalBadges) },
    { label: 'Towns finished', value: v(stats ? stats.totalTownBadges ?? 0 : null), hint: 'Town badges earned' },
  ];

  return (
    <Page>
      <PageHeader
        title="Traveler Progress"
        count={rows.length}
        subtitle="The traveler leaderboard, ranked as in the app by points (visits and missions); equal points share a rank — with spots visited, badges, missions and home municipality for everyone using it."
        stats={strip}
      />

      {error && <ErrorBanner onDismiss={() => setError(null)}>{error}</ErrorBanner>}

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
          placeholder="Search by name, email or municipality…"
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
            <Th>Municipality</Th>
            <Th align="right">Points</Th>
            <Th align="right">Spots visited</Th>
            <Th align="right">Badges</Th>
            <Th align="right">Towns</Th>
            <Th align="right">Missions</Th>
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
                      {r.titleName && <StatusPill tone="info" icon="star">{r.titleName}</StatusPill>}
                      {r.isBanned && <StatusPill tone="danger" icon="slash">Banned</StatusPill>}
                    </div>
                    <div style={s.personSub}>{r.email}</div>
                    {r.createdAt && <div style={s.personSub}>Joined {fmtDay(r.createdAt)}</div>}
                  </div>
                </div>
              </Td>
              {/* Blank for accounts made before sign-up asked for it. */}
              <Td muted={!r.municipality}>{r.municipality || '—'}</Td>
              {/* Points decide the rank, so they come first and in bold. */}
              <Td align="right" strong>{fmtNum(r.points)}</Td>
              <Td align="right">{r.spotsVisited}</Td>
              <Td align="right">{r.badges}</Td>
              <Td align="right">{r.townsFinished ?? 0}</Td>
              <Td align="right">{r.missionsCompleted}</Td>
              <Td align="right" muted>{r.lastActiveAt ? timeAgo(r.lastActiveAt) : 'Never'}</Td>
            </tr>
          ))}
        </Table>
      )}
    </Page>
  );
}

// Page shell, header and its strip, toolbar, table and person cell all come
// from components/Layout — only the rank badge is this page's own.
const s = {
  ...pageStyles,
  rank: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 26, height: 26,
    borderRadius: radius.pill, background: t.sidebarBg, color: t.textSecondary,
    fontWeight: 700, fontSize: 12.5, padding: '0 8px', fontVariantNumeric: 'tabular-nums',
  },
};

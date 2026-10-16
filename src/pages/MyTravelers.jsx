import { useEffect, useMemo, useState } from 'react';
import { myTravelersAPI } from '../api/api';
import {
  Page, PageHeader, Toolbar, SearchInput, FilterTabs, Table, Th, Td, Button, StatusPill,
  Loading, EmptyState, ErrorBanner, Avatar, pageStyles as s,
} from '../components/Layout';
import { fmtNum, fmtDay, timeAgo } from '../utils/format';
import { standingLabel } from '../utils/standing';

// Travelers — for a moderator: the travelers whose home municipality is the one
// they look after (QA 2026-10-16: user management within their municipality).
// Read-only, as decided with the team: warnings, suspensions and bans stay with
// the administrators. No emails.

const STATUS = {
  active:    { tone: 'success', icon: 'check',  label: 'Active' },
  muted:     { tone: 'warning', icon: 'clock',  label: 'Muted' },
  suspended: { tone: 'warning', icon: 'pause',  label: 'Suspended' },
  inactive:  { tone: 'neutral', icon: 'clock',  label: 'Inactive' },
  banned:    { tone: 'danger',  icon: 'slash',  label: 'Banned' },
};

export default function MyTravelers() {
  const [rows,    setRows]    = useState([]);
  const [town,    setTown]    = useState('');
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [search,  setSearch]  = useState('');
  const [filter,  setFilter]  = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await myTravelersAPI.getAll();
      setRows(data?.travelers || []);
      setTown(data?.municipality || '');
    } catch (err) {
      setError(err?.response?.data?.message || 'Couldn’t load the travelers.');
      setRows([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const flagged = (r) => r.status !== 'active' || r.warnings > 0;
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === 'explorers' && r.spotsVisited === 0) return false;
      if (filter === 'flagged' && !flagged(r)) return false;
      return !q || (r.name || '').toLowerCase().includes(q);
    });
  }, [rows, search, filter]);

  return (
    <Page>
      <PageHeader
        title="Travelers"
        count={rows.length}
        subtitle={`Travelers who live in ${town || 'your municipality'}, by points. View only: warnings, suspensions and bans are handled by the administrators.`}
        actions={<Button icon="refresh-cw" onClick={load} disabled={loading}>Refresh</Button>}
      />

      {error && <ErrorBanner onDismiss={() => setError('')}>{error}</ErrorBanner>}

      {rows.length > 0 && (
        <Toolbar>
          <FilterTabs
            label="Show"
            value={filter}
            onChange={setFilter}
            options={[
              { value: '',          label: 'All',             count: rows.length },
              { value: 'explorers', label: 'Visited a spot',  count: rows.filter((r) => r.spotsVisited > 0).length },
              { value: 'flagged',   label: 'Warned or limited', count: rows.filter(flagged).length },
            ]}
          />
          <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name…" />
        </Toolbar>
      )}

      {loading ? (
        <Loading label="Loading travelers…" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="users"
          title="No travelers yet"
          subtitle={`Travelers who pick ${town || 'your municipality'} as their home when they sign up appear here.`}
        />
      ) : visible.length === 0 ? (
        <EmptyState icon="users" title="No travelers match" subtitle="Try a different search or filter." />
      ) : (
        <Table
          caption={`Travelers from ${town}`}
          head={<>
            <Th>Traveler</Th>
            <Th align="right">Points</Th>
            <Th align="right">Spots visited</Th>
            <Th>Standing</Th>
            <Th align="right">Last active</Th>
          </>}
        >
          {visible.map((r) => {
            const st = STATUS[r.status] || STATUS.active;
            return (
              <tr key={r.id}>
                <Td>
                  <div style={s.person}>
                    <Avatar src={r.profileImage} name={r.name} size={32} />
                    <div style={{ minWidth: 0 }}>
                      <div style={s.personName}>{r.name}</div>
                      <div style={s.personSub}>Joined {r.joinedAt ? fmtDay(r.joinedAt) : '—'}</div>
                    </div>
                  </div>
                </Td>
                <Td align="right" strong>{fmtNum(r.points)}</Td>
                <Td align="right">{r.spotsVisited}</Td>
                <Td>
                  <div style={s.pillStack}>
                    <StatusPill tone={st.tone} icon={st.icon}>{st.label}</StatusPill>
                    {standingLabel(r) && <StatusPill tone="neutral" icon="flag">{standingLabel(r)}</StatusPill>}
                  </div>
                </Td>
                <Td align="right" muted>{r.lastActiveAt ? timeAgo(r.lastActiveAt) : 'Never'}</Td>
              </tr>
            );
          })}
        </Table>
      )}
    </Page>
  );
}

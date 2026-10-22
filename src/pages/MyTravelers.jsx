import { useEffect, useMemo, useState } from 'react';
import { myTravelersAPI } from '../api/api';
import {
  Page, PageHeader, Toolbar, SearchInput, FilterTabs, Table, Th, Td, Button, StatusPill,
  Loading, EmptyState, ErrorBanner, Avatar, pageStyles as s,
} from '../components/Layout';
import { fmtDay, timeAgo } from '../utils/format';
import { standingLabel } from '../utils/standing';
import { useLive } from '../api/live';

// Travelers — for a moderator: the travelers who have visited the spots in
// their municipality (QA 2026-10-16: user management within their
// municipality), whoever they are and wherever they live. Read-only, as decided
// with the team: warnings, suspensions and bans stay with the administrators.
// No emails.

const STATUS = {
  active:    { tone: 'success', icon: 'check',  label: 'Active' },
  muted:     { tone: 'warning', icon: 'clock',  label: 'Muted' },
  suspended: { tone: 'warning', icon: 'pause',  label: 'Suspended' },
  inactive:  { tone: 'neutral', icon: 'clock',  label: 'Inactive' },
  banned:    { tone: 'danger',  icon: 'slash',  label: 'Banned' },
};

export default function MyTravelers() {
  const [rows,      setRows]      = useState([]);
  const [town,      setTown]      = useState('');
  const [spotCount, setSpotCount] = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [search,    setSearch]    = useState('');
  const [filter,    setFilter]    = useState('');

  // `quiet`: a live update — no spinner, and a failure keeps the list shown.
  const load = async ({ quiet = false } = {}) => {
    if (!quiet) {
      setLoading(true);
      setError('');
    }
    try {
      const data = await myTravelersAPI.getAll();
      setRows(data?.travelers || []);
      setTown(data?.municipality || '');
      setSpotCount(data?.spotCount || 0);
    } catch (err) {
      if (!quiet) {
        setError(err?.response?.data?.message || 'Couldn’t load the travelers.');
        setRows([]);
      }
    }
    if (!quiet) setLoading(false);
  };

  useEffect(() => { load(); }, []);
  // New visits to the town's spots, and travelers' standing.
  useLive(['progress', 'travelers', 'spots'], () => load({ quiet: true }));

  const flagged = (r) => r.status !== 'active' || r.warnings > 0;
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === 'locals' && r.homeMunicipality !== town) return false;
      if (filter === 'visitors' && r.homeMunicipality === town) return false;
      if (filter === 'flagged' && !flagged(r)) return false;
      return !q || [r.name, r.homeMunicipality, ...(r.spotNames || [])].some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [rows, search, filter, town]);

  const locals = rows.filter((r) => r.homeMunicipality === town).length;
  const spotsWord = `${spotCount} ${spotCount === 1 ? 'spot' : 'spots'}`;

  return (
    <Page>
      <PageHeader
        title="Travelers"
        count={rows.length}
        subtitle={`Travelers who have visited the ${spotsWord} in ${town || 'your municipality'}, most recent visit first. View only: warnings, suspensions and bans are handled by the administrators.`}
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
              { value: '',         label: 'All',                      count: rows.length },
              { value: 'locals',   label: `Live in ${town}`,          count: locals },
              { value: 'visitors', label: 'From other towns',         count: rows.length - locals },
              { value: 'flagged',  label: 'Warned or limited',        count: rows.filter(flagged).length },
            ]}
          />
          <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, town or spot…" />
        </Toolbar>
      )}

      {loading ? (
        <Loading label="Loading travelers…" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="users"
          title="No visits yet"
          subtitle={spotCount
            ? `Travelers appear here once the app records their arrival at one of the ${spotsWord} in ${town}.`
            : `${town || 'Your municipality'} has no spots yet. Add one in Spot Management.`}
        />
      ) : visible.length === 0 ? (
        <EmptyState icon="users" title="No travelers match" subtitle="Try a different search or filter." />
      ) : (
        <Table
          caption={`Travelers who visited spots in ${town}`}
          head={<>
            <Th>Traveler</Th>
            <Th>Spots visited here</Th>
            <Th align="right">Last visit</Th>
            <Th>Standing</Th>
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
                      <div style={s.personSub}>{r.homeMunicipality ? `Lives in ${r.homeMunicipality}` : 'Home town not given'}</div>
                    </div>
                  </div>
                </Td>
                <Td>
                  <div style={s.personName}>{r.spotsVisited} of {spotCount}</div>
                  <div style={{ ...s.personSub, whiteSpace: 'normal' }}>{(r.spotNames || []).join(', ')}</div>
                </Td>
                <Td align="right" muted>
                  <span title={r.lastVisitAt ? fmtDay(r.lastVisitAt) : ''}>{r.lastVisitAt ? timeAgo(r.lastVisitAt) : '—'}</span>
                </Td>
                <Td>
                  <div style={s.pillStack}>
                    <StatusPill tone={st.tone} icon={st.icon}>{st.label}</StatusPill>
                    {standingLabel(r) && <StatusPill tone="neutral" icon="alert-triangle">{standingLabel(r)}</StatusPill>}
                  </div>
                </Td>
              </tr>
            );
          })}
        </Table>
      )}
    </Page>
  );
}

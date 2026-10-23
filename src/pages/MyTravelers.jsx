import { useEffect, useMemo, useState } from 'react';
import { myTravelersAPI } from '../api/api';
import {
  Page, PageHeader, Toolbar, SearchInput, FilterTabs, Table, Th, Td, Row, StatusPill,
  Loading, EmptyState, ErrorBanner, Avatar, pageStyles as s,
} from '../components/Layout';
import Drawer from '../components/Drawer';
import { Paged, usePaged } from '../components/Pagination';
import { Facts, DetailSection, VisitList, detailStyles as d } from '../components/Details';
import { fmtDay, fmtNum, timeAgo } from '../utils/format';
import { standingLabel } from '../utils/standing';
import { useLive } from '../api/live';

// Travelers — for a moderator: the travelers who have visited the spots in
// their municipality (QA 2026-10-16: user management within their
// municipality), whoever they are and wherever they live. Read-only, as decided
// with the team: warnings, suspensions and bans stay with the administrators.
// No emails. A row opens the traveler's visits here and their standing.

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
  const [openId,    setOpenId]    = useState(null);
  const opened = openId && rows.find((r) => r.id === openId);

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
  const paged = usePaged(visible, `${search}|${filter}`);

  const locals = rows.filter((r) => r.homeMunicipality === town).length;
  const spotsWord = `${spotCount} ${spotCount === 1 ? 'spot' : 'spots'}`;

  return (
    <Page>
      <PageHeader
        title="Travelers"
        count={loading ? '…' : rows.length}
      />

      {error && <ErrorBanner onDismiss={() => setError('')}>{error}</ErrorBanner>}

      {rows.length > 0 && (
        <Toolbar>
          <FilterTabs
            label="Show"
            pending={loading}
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
        <Loading label="Loading travelers…" cols={4} media="avatar" />
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
        <Paged {...paged} label="Traveler pages">
        <Table
          caption={`Travelers who visited spots in ${town}`}
          head={<>
            <Th>Traveler</Th>
            <Th>Spots visited here</Th>
            <Th align="right">Last visit</Th>
            <Th>Standing</Th>
          </>}
        >
          {paged.rows.map((r) => {
            const st = STATUS[r.status] || STATUS.active;
            return (
              <Row key={r.id} onOpen={() => setOpenId(r.id)} label={`Details of ${r.name}`}>
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
              </Row>
            );
          })}
        </Table>
        </Paged>
      )}

      {opened && <TravelerDetails r={opened} town={town} spotCount={spotCount} onClose={() => setOpenId(null)} />}
    </Page>
  );
}

// What the list knows about one traveler, laid out whole: each spot here with
// when they were last there, and their standing. Still no email.
function TravelerDetails({ r, town, spotCount, onClose }) {
  const st = STATUS[r.status] || STATUS.active;
  const visits = r.visits || (r.spotNames || []).map((spot) => ({ spot }));
  return (
    <Drawer title={r.name} subtitle={r.homeMunicipality ? `Lives in ${r.homeMunicipality}` : 'Home town not given'} onClose={onClose}>
      <div style={d.stack}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <StatusPill tone={st.tone} icon={st.icon}>{st.label}</StatusPill>
          {standingLabel(r) && <StatusPill tone="neutral" icon="alert-triangle">{standingLabel(r)}</StatusPill>}
        </div>
        <Facts items={[
          [`Spots visited in ${town}`, `${r.spotsVisited} of ${spotCount}`],
          ['Last visit', r.lastVisitAt ? fmtDay(r.lastVisitAt) : '—'],
          ['Points', fmtNum(r.points)],
          ['Lives in', r.homeMunicipality || '—'],
          ['Warnings', fmtNum(r.warnings)],
          ['Suspensions', fmtNum(r.suspensions)],
        ]} />
        {visits.length > 0 && (
          <DetailSection title={`Visits to ${town}’s spots`}>
            <VisitList visits={visits} />
          </DetailSection>
        )}
        <p style={d.note}>View only: warnings, suspensions and bans are handled by the administrators.</p>
      </div>
    </Drawer>
  );
}

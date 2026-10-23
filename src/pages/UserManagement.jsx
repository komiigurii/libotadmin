import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { bannedAccountsAPI, appealAPI, inactiveUsersAPI, userProgressAPI } from '../api/api';
import { notify, confirmAction } from '../components/AppAlert';
import {
  Page, PageHeader, Toolbar, SearchInput, FilterTabs, Table, Th, Td, Row, Button, StatusPill,
  Loading, EmptyState, ErrorBanner, Avatar, pageStyles,
} from '../components/Layout';
import TravelerDrawer from '../components/TravelerDrawer';
import { Paged, usePaged } from '../components/Pagination';
import { Facts, DetailSection, DetailText } from '../components/Details';
import { fmtNum, fmtDateTime, fmtDay, timeAgo } from '../utils/format';
import { standingLabel } from '../utils/standing';
import { theme as t, radius } from '../theme';
import { useLive } from '../api/live';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function remaining(expiresAt) {
  const ms = new Date(expiresAt) - Date.now();
  if (!(ms > 0)) return 'Expired — lifting soon';
  const days = Math.ceil(ms / 86_400_000);
  return `${days} day${days === 1 ? '' : 's'} left`;
}

const APPEAL_STATUS = {
  submitted: { tone: 'info',    icon: 'message-square', label: 'Appeal waiting' },
  approved:  { tone: 'success', icon: 'check',          label: 'Appeal approved' },
  rejected:  { tone: 'neutral', icon: 'x',              label: 'Appeal rejected' },
};

const MEDAL     = { 1: '#F2CE1B', 2: '#C7D0D2', 3: '#CD8B54' };
const MEDAL_INK = '#2C2810';

const TAB = { ALL: 'all', BANS: 'bans', INACTIVE: 'inactive', PROGRESS: 'progress' };

// A row in any panel opens that traveler's overview (TravelerDrawer); the
// Suspended & Banned one adds the ban, its reason and the appeal on top, and
// an appeal is decided there.
const overviewOf = (u) => ({ id: u.clerkUserId, name: u.name, email: u.email });

// ─── Shared: traveler cell ────────────────────────────────────────────────────
// Used in every panel so name / email / join date always look the same.

function TravelerCell({ src, name, email, createdAt, pills }) {
  return (
    <div style={pageStyles.person}>
      <Avatar src={src} name={name} size={32} />
      <div style={{ minWidth: 0 }}>
        <div style={pageStyles.personName}>
          {name || 'Unknown'}
          {pills}
        </div>
        <div style={pageStyles.personSub}>{email}</div>
        {createdAt && (
          <div style={pageStyles.personSub}>Joined {fmtDay(createdAt)}</div>
        )}
      </div>
    </div>
  );
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

const tabBarStyle = {
  display: 'flex',
  gap: 4,
  borderBottom: '1px solid var(--border, #e5e7eb)',
  marginBottom: 24,
};

function tabStyle(active) {
  return {
    padding: '8px 16px',
    fontSize: 14,
    fontWeight: active ? 600 : 400,
    color: active ? 'var(--color-primary, #2563eb)' : 'var(--color-muted, #6b7280)',
    background: 'none',
    border: 'none',
    borderBottom: active
      ? '2px solid var(--color-primary, #2563eb)'
      : '2px solid transparent',
    cursor: 'pointer',
    marginBottom: -1,
    transition: 'color 0.15s, border-color 0.15s',
  };
}

// ─── All Users panel ──────────────────────────────────────────────────────────

function AllUsersPanel() {
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [search,  setSearch]  = useState('');
  const [open,    setOpen]    = useState(null);

  const load = async ({ quiet = false } = {}) => {
    if (!quiet) { setLoading(true); setError(null); }
    try {
      const data = await userProgressAPI.getAll();
      setRows(data?.leaderboard || []);
    } catch (err) {
      console.error('[AllUsers]', err);
      if (!quiet) { setError("Couldn't load the user list."); setRows([]); }
    }
    if (!quiet) setLoading(false);
  };

  useEffect(() => { load(); }, []);
  useLive(['travelers', 'progress'], () => load({ quiet: true }));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      [r.name, r.email, r.municipality].some(v => (v || '').toLowerCase().includes(q))
    );
  }, [rows, search]);
  const paged = usePaged(filtered, search);

  return (
    <>
      {error && <ErrorBanner onDismiss={() => setError(null)}>{error}</ErrorBanner>}

      <Toolbar>
        <SearchInput
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email or municipality…"
        />
      </Toolbar>

      {loading ? (
        <Loading label="Loading all users…" cols={6} media="avatar" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="users"
          title={rows.length === 0 ? 'No users yet' : 'No users match'}
          subtitle={rows.length === 0 ? 'Users appear here once they sign up.' : 'Try a different search.'}
        />
      ) : (
        <Paged {...paged} label="User pages">
        <Table
          caption="All users"
          head={<>
            <Th>Traveler</Th>
            <Th>Municipality</Th>
            <Th align="right">Points</Th>
            <Th align="right">Spots visited</Th>
            <Th align="right">Badges</Th>
            <Th align="right">Last active</Th>
          </>}
        >
          {paged.rows.map(r => (
            <Row key={r.clerkUserId} onOpen={() => setOpen(overviewOf(r))} label={`Overview of ${r.name}`}>
              <Td>
                <TravelerCell
                  src={r.profileImage}
                  name={r.name}
                  email={r.email}
                  createdAt={r.createdAt}
                  pills={<>
                    {r.titleName && <StatusPill tone="info"   icon="star" >{r.titleName}</StatusPill>}
                    {r.isBanned  && <StatusPill tone="danger" icon="slash">Banned</StatusPill>}
                  </>}
                />
              </Td>
              <Td muted={!r.municipality}>{r.municipality || '—'}</Td>
              <Td align="right" strong>{fmtNum(r.points)}</Td>
              <Td align="right">{r.spotsVisited}</Td>
              <Td align="right">{r.badges}</Td>
              <Td align="right" muted>{r.lastActiveAt ? timeAgo(r.lastActiveAt) : 'Never'}</Td>
            </Row>
          ))}
        </Table>
        </Paged>
      )}

      {open && <TravelerDrawer traveler={open} onClose={() => setOpen(null)} />}
    </>
  );
}

// ─── Suspensions & Bans panel ─────────────────────────────────────────────────

function BannedAccountsPanel() {
  const [users,      setUsers]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [error,      setError]      = useState('');
  const [busyId,     setBusyId]     = useState(null);
  const [openId,     setOpenId]     = useState(null);
  // From the live list: an unban closes it, a decided appeal shows as decided.
  const opened = openId && users.find(u => u.clerkUserId === openId);

  const load = async ({ quiet = false } = {}) => {
    if (!quiet) { setLoading(true); setError(''); }
    try {
      const data = await bannedAccountsAPI.getAll();
      setUsers(data || []);
    } catch (err) {
      console.error('Failed to load banned accounts:', err);
      if (!quiet) setError("Couldn't load suspended and banned accounts.");
    }
    if (!quiet) setLoading(false);
  };

  useEffect(() => { load(); }, []);
  useLive(['travelers'], () => load({ quiet: true }));

  const handleUnban = async (clerkUserId) => {
    if (!(await confirmAction('Lift the suspension or ban on this account?', { confirmText: 'Unban' }))) return;
    setBusyId(clerkUserId);
    try {
      await bannedAccountsAPI.unban(clerkUserId);
      setUsers(prev => prev.filter(u => u.clerkUserId !== clerkUserId));
    } catch (err) {
      notify('Failed to unban: ' + (err.message || 'Unknown error'), { tone: 'danger' });
    }
    setBusyId(null);
  };

  const handleAppealDecision = async (clerkUserId, decision) => {
    const approve = decision === 'approved';
    const question = `${approve ? 'Approve' : 'Reject'} this appeal?` +
      (approve ? ' This unbans the account.' : ' The account stays banned.');
    if (!(await confirmAction(question, { danger: !approve, confirmText: approve ? 'Approve & unban' : 'Reject' }))) return;
    setBusyId(clerkUserId);
    try {
      await appealAPI.decide(clerkUserId, decision);
      await load();
    } catch (err) {
      notify(
        `Failed to ${approve ? 'approve' : 'reject'} the appeal: ` +
          (err?.response?.data?.message || err.message || 'Unknown error'),
        { tone: 'danger' },
      );
    }
    setBusyId(null);
  };

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    return (
      (u.name?.toLowerCase()  || '').includes(q) ||
      (u.email?.toLowerCase() || '').includes(q)
    );
  });
  const paged = usePaged(filtered, search);

  return (
    <>
      {error && <ErrorBanner onDismiss={() => setError('')}>{error}</ErrorBanner>}

      {users.length > 0 && (
        <Toolbar>
          <SearchInput
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email…"
          />
        </Toolbar>
      )}

      {loading ? (
        <Loading label="Loading suspended and banned accounts…" cols={5} media="avatar" />
      ) : users.length === 0 ? (
        <EmptyState
          icon="check"
          title="No suspended or banned accounts"
          subtitle="Nobody is currently suspended or banned."
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon="users" title="No accounts match" subtitle="Try a different name or email." />
      ) : (
        <Paged {...paged} label="Suspended and banned pages">
        <Table
          caption="Suspended and banned accounts"
          head={<>
            <Th>Traveler</Th>
            <Th>Reason</Th>
            <Th>Record</Th>
            <Th>Status</Th>
            <Th align="right">Action</Th>
          </>}
        >
          {paged.rows.map(u => {
            const hasAppeal = !!u.appealStatus && u.appealStatus !== 'none';
            const appeal    = APPEAL_STATUS[u.appealStatus];
            const busy      = busyId === u.clerkUserId;

            return (
              <Row key={u.clerkUserId} onOpen={() => setOpenId(u.clerkUserId)} label={`Details of ${u.name || 'this traveler'}`}>
                <Td>
                  <TravelerCell
                    src={u.profileImage}
                    name={u.name}
                    email={u.email}
                    createdAt={u.createdAt}
                  />
                </Td>
                <Td>
                  <span style={pageStyles.clampCell} title={u.banReason}>
                    {u.banReason || '—'}
                  </span>
                </Td>
                {/* "Warning 3 · Suspension 1": every warning ever given (QA
                    2026-10-16), not warningCount, which restarts after two. */}
                <Td muted={!standingLabel({ warnings: u.warningsGiven ?? u.warningCount, suspensions: u.suspensionCount })}>
                  {standingLabel({ warnings: u.warningsGiven ?? u.warningCount, suspensions: u.suspensionCount }) || 'No warnings'}
                </Td>
                <Td>
                  <div style={pageStyles.pillStack}>
                    {u.isPermanent
                      ? <StatusPill tone="danger"  icon="slash">Permanent ban</StatusPill>
                      : <StatusPill tone="warning" icon="clock">{remaining(u.suspendedUntil)}</StatusPill>}
                    {appeal && (
                      <StatusPill tone={appeal.tone} icon={appeal.icon}>{appeal.label}</StatusPill>
                    )}
                  </div>
                </Td>
                <Td align="right">
                  <div style={pageStyles.cellActions}>
                    {hasAppeal && (
                      <Button size="sm" icon="message-square" onClick={() => setOpenId(u.clerkUserId)}>
                        View appeal
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="subtle"
                      disabled={busy}
                      onClick={() => handleUnban(u.clerkUserId)}
                    >
                      Unban
                    </Button>
                  </div>
                </Td>
              </Row>
            );
          })}
        </Table>
        </Paged>
      )}

      {opened && (
        <TravelerDrawer traveler={overviewOf(opened)} onClose={() => setOpenId(null)}>
          <BanDetails u={opened} busy={busyId === opened.clerkUserId} onDecide={handleAppealDecision} />
        </TravelerDrawer>
      )}
    </>
  );
}

// The ban or suspension, its reason in full, and the appeal with its decision.
// The standing itself (Banned, Suspended) is the overview's own pill above.
function BanDetails({ u, busy, onDecide }) {
  const appeal = APPEAL_STATUS[u.appealStatus];
  const record = standingLabel({ warnings: u.warningsGiven ?? u.warningCount, suspensions: u.suspensionCount });
  return (
    <>
      <Facts items={[
        ['Banned', u.isPermanent ? (u.bannedAt ? fmtDay(u.bannedAt) : 'For good') : null],
        ['Suspended until', !u.isPermanent && u.suspendedUntil ? `${fmtDateTime(u.suspendedUntil)} (${remaining(u.suspendedUntil).toLowerCase()})` : null],
        ['Record', record || 'No warnings'],
      ]} />
      <DetailSection title="Reason">
        <DetailText>{u.banReason || 'No reason was written down.'}</DetailText>
      </DetailSection>
      {appeal && (
        <DetailSection title={`Appeal${u.appealedAt ? `, sent ${fmtDateTime(u.appealedAt)}` : ''}`}>
          <DetailText>{u.appealText || '(No appeal text provided.)'}</DetailText>
          {u.appealDeadline && (
            <p style={pageStyles.panelNote}>
              {new Date(u.appealDeadline) < new Date() ? 'Appeals for this ban closed on ' : 'Appeals for this ban close on '}
              {fmtDay(u.appealDeadline)}. The account stays archived until you decide; it is never deleted.
            </p>
          )}
          {u.appealStatus === 'submitted' ? (
            <div style={pageStyles.buttonRow}>
              <Button variant="success" icon="check" disabled={busy} onClick={() => onDecide(u.clerkUserId, 'approved')}>
                Approve &amp; unban
              </Button>
              <Button variant="danger" icon="x" disabled={busy} onClick={() => onDecide(u.clerkUserId, 'rejected')}>
                Reject
              </Button>
            </div>
          ) : (
            <p style={pageStyles.panelNote}>This appeal has already been {u.appealStatus}.</p>
          )}
        </DetailSection>
      )}
    </>
  );
}

// ─── Inactive Accounts panel ──────────────────────────────────────────────────

// Admin only: moderators work on attractions and their own requests.
function InactiveUsersPanel() {
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [acting,  setActing]  = useState(null);
  const [open,    setOpen]    = useState(null);

  const load = async ({ quiet = false } = {}) => {
    if (!quiet) { setLoading(true); setError(null); }
    try {
      const data = await inactiveUsersAPI.getAll();
      setUsers(data?.users || []);
    } catch {
      if (!quiet) { setError("Couldn't load inactive accounts."); setUsers([]); }
    }
    if (!quiet) setLoading(false);
  };

  useEffect(() => { load(); }, []);
  useLive(['travelers', 'progress'], () => load({ quiet: true }));
  const paged = usePaged(users);

  const archive = async (clerkUserId) => {
    if (!(await confirmAction(
      'Approve archival for this traveler? Their account and records are kept, out of public view, and they can ask for it back when they return.',
      { danger: true, confirmText: 'Approve archival' },
    ))) return;
    setActing(clerkUserId);
    try {
      await inactiveUsersAPI.archive(clerkUserId);
      load();
    } catch {
      notify('Failed to archive the account.', { tone: 'danger' });
    }
    setActing(null);
  };

  return (
    <>
      {error && <ErrorBanner onDismiss={() => setError(null)}>{error}</ErrorBanner>}

      {loading ? (
        <Loading label="Loading inactive accounts…" cols={6} media="avatar" />
      ) : users.length === 0 ? (
        <EmptyState
          icon="check"
          title="No inactive accounts"
          subtitle="Nobody has been away for 30 days or more."
        />
      ) : (
        <Paged {...paged} label="Inactive account pages">
        <Table
          caption="Inactive accounts"
          head={<>
            <Th>Traveler</Th>
            <Th>Last active</Th>
            <Th>Inactive for</Th>
            <Th align="right">Reviews</Th>
            <Th>Status</Th>
            <Th align="right">Action</Th>
          </>}
        >
          {paged.rows.map(u => {
            const busy = acting === u.clerkUserId;
            return (
              <Row key={u.clerkUserId} onOpen={() => setOpen(overviewOf(u))} label={`Overview of ${u.name || 'this traveler'}`}>
                <Td>
                  <TravelerCell
                    src={u.profileImage}
                    name={u.name}
                    email={u.email}
                    createdAt={u.createdAt}
                  />
                </Td>
                <Td muted>{fmtDay(u.lastActiveAt)}</Td>
                <Td>
                  {u.daysInactive == null
                    ? <StatusPill tone="neutral" icon="clock">Never active</StatusPill>
                    : <StatusPill tone={u.daysInactive >= 45 ? 'danger' : 'warning'} icon="clock">
                        {u.daysInactive} days
                      </StatusPill>}
                </Td>
                <Td align="right">{u.commentCount}</Td>
                <Td>
                  {u.status === 'archived'
                    ? <StatusPill tone="neutral" icon="archive">Archived</StatusPill>
                    : <StatusPill tone="warning" icon="clock">Pending archival</StatusPill>}
                </Td>
                <Td align="right">
                  {u.status !== 'pending' ? '—' : (
                    <Button
                      size="sm"
                      variant="success"
                      icon="archive"
                      disabled={busy}
                      onClick={() => archive(u.clerkUserId)}
                    >
                      Approve archival
                    </Button>
                  )}
                </Td>
              </Row>
            );
          })}
        </Table>
        </Paged>
      )}

      {open && <TravelerDrawer traveler={open} onClose={() => setOpen(null)} />}
    </>
  );
}

// ─── Traveler Progress panel ──────────────────────────────────────────────────

// Read-only leaderboard — actions on accounts live in the other tabs.
const rankStyle = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  minWidth: 26, height: 26, borderRadius: radius.pill,
  background: t.sidebarBg, color: t.textSecondary,
  fontWeight: 700, fontSize: 12.5, padding: '0 8px',
  fontVariantNumeric: 'tabular-nums',
};

function TravelerProgressPanel() {
  const [rows,    setRows]    = useState([]);
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [search,  setSearch]  = useState('');
  const [onlyExplorers, setOnlyExplorers] = useState(false);
  const [open,    setOpen]    = useState(null);

  const load = async ({ quiet = false } = {}) => {
    if (!quiet) { setLoading(true); setError(null); }
    try {
      const data = await userProgressAPI.getAll();
      setRows(data?.leaderboard || []);
      setStats(data?.stats || null);
    } catch (err) {
      console.error('[TravelerProgress]', err);
      if (!quiet) { setError("Couldn't load traveler progress."); setRows([]); setStats(null); }
    }
    if (!quiet) setLoading(false);
  };

  useEffect(() => { load(); }, []);
  useLive(['progress', 'travelers'], () => load({ quiet: true }));

  // Filtering is derived, never stored — so rank always shows the real standing.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (onlyExplorers && r.spotsVisited === 0) return false;
      if (!q) return true;
      return [r.name, r.email, r.municipality].some(v => (v || '').toLowerCase().includes(q));
    });
  }, [rows, search, onlyExplorers]);
  const paged = usePaged(visible, `${search}|${onlyExplorers}`);

  const explorers = rows.filter(r => r.spotsVisited > 0).length;

  const v = n => (stats ? fmtNum(n) : loading ? '…' : '—');
  const strip = [
    { label: 'Travelers',       hue: 'teal',   value: v(stats?.totalUsers),  hint: 'with an account' },
    { label: 'Explorers',                       value: v(stats?.explorers),
      hint: stats?.totalUsers
        ? `${Math.round((stats.explorers / stats.totalUsers) * 100)}% have visited a spot`
        : null },
    { label: 'Active this week',                value: v(stats?.activeLast7),
      hint: stats ? `${fmtNum(stats.activeLast30)} this month` : null },
    { label: 'Spot visits',     hue: 'magenta', value: v(stats?.totalVisits),
      hint: stats ? `${stats.avgVisits} per traveler on average` : null },
    { label: 'Badges collected',                value: v(stats?.totalBadges) },
    { label: 'Towns finished',                  value: v(stats ? stats.totalTownBadges ?? 0 : null),
      hint: 'Town badges earned' },
  ];

  return (
    <>
      {error && <ErrorBanner onDismiss={() => setError(null)}>{error}</ErrorBanner>}

      <Toolbar>
        <FilterTabs
          label="Show"
          pending={loading}
          value={onlyExplorers ? 'explorers' : ''}
          onChange={val => setOnlyExplorers(val === 'explorers')}
          options={[
            { value: '',          label: 'All travelers',  count: rows.length },
            { value: 'explorers', label: 'Visited a spot', count: explorers },
          ]}
        />
        <SearchInput
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email or municipality…"
        />
      </Toolbar>

      {loading ? (
        <Loading label="Loading the traveler leaderboard…" cols={9} media="avatar" />
      ) : visible.length === 0 ? (
        <EmptyState
          icon="users"
          title={rows.length === 0 ? 'No travelers yet' : 'No travelers match'}
          subtitle={rows.length === 0
            ? 'Rankings appear once someone visits a spot.'
            : 'Try a different search or filter.'}
        />
      ) : (
        <Paged {...paged} label="Leaderboard pages">
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
          {paged.rows.map(r => (
            <Row key={r.clerkUserId} onOpen={() => setOpen(overviewOf(r))} label={`Overview of ${r.name}`}>
              <Td>
                <span style={{
                  ...rankStyle,
                  ...(MEDAL[r.rank] ? { background: MEDAL[r.rank], color: MEDAL_INK } : {}),
                }}>
                  {r.rank}
                </span>
              </Td>
              <Td>
                <TravelerCell
                  src={r.profileImage}
                  name={r.name}
                  email={r.email}
                  createdAt={r.createdAt}
                  pills={<>
                    {r.titleName && <StatusPill tone="info"   icon="star" >{r.titleName}</StatusPill>}
                    {r.isBanned  && <StatusPill tone="danger" icon="slash">Banned</StatusPill>}
                  </>}
                />
              </Td>
              <Td muted={!r.municipality}>{r.municipality || '—'}</Td>
              <Td align="right" strong>{fmtNum(r.points)}</Td>
              <Td align="right">{r.spotsVisited}</Td>
              <Td align="right">{r.badges}</Td>
              <Td align="right">{r.townsFinished ?? 0}</Td>
              <Td align="right">{r.missionsCompleted}</Td>
              <Td align="right" muted>{r.lastActiveAt ? timeAgo(r.lastActiveAt) : 'Never'}</Td>
            </Row>
          ))}
        </Table>
        </Paged>
      )}

      {open && <TravelerDrawer traveler={open} onClose={() => setOpen(null)} />}
    </>
  );
}

// ─── Default export ───────────────────────────────────────────────────────────

const TAB_META = {
  [TAB.ALL]:      { label: 'All Users' },
  [TAB.BANS]:     { label: 'Suspended & Banned' },
  [TAB.INACTIVE]: { label: 'Inactive' },
  [TAB.PROGRESS]: { label: 'Leaderboard' },
};

export default function UserManagement() {
  // ?tab= opens a tab straight away (the dashboard's Leaderboard and Ban
  // appeals links, and the old pages' addresses).
  const [params, setParams] = useSearchParams();
  const asked = params.get('tab');
  const tab = Object.values(TAB).includes(asked) ? asked : TAB.ALL;
  const setTab = (key) => setParams(key === TAB.ALL ? {} : { tab: key }, { replace: true });

  // One name for the page whichever tab is open, like the rail's link: the
  // heading and the browser tab used to change with every tab (mock defense
  // notes, 2026-10-23: "tab name … changing … but still in the same page").
  return (
    <Page>
      <PageHeader title="User Management" />

      <div style={tabBarStyle}>
        {Object.values(TAB).map(key => (
          <button key={key} style={tabStyle(tab === key)} onClick={() => setTab(key)}>
            {TAB_META[key].label}
          </button>
        ))}
      </div>

      {tab === TAB.ALL      && <AllUsersPanel />}
      {tab === TAB.BANS     && <BannedAccountsPanel />}
      {tab === TAB.INACTIVE && <InactiveUsersPanel />}
      {tab === TAB.PROGRESS && <TravelerProgressPanel />}
    </Page>
  );
}
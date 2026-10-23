import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { accountsAPI, systemAPI } from '../api/api';
import {
  Page, PageHeader, Toolbar, SearchInput, Button, StatusPill, Tag, Table, Th, Td, Avatar,
  Loading, EmptyState, ErrorBanner, pageStyles as s,
} from '../components/Layout';
import { AddAccountForm, StaffTable, HistoryList } from '../components/StaffAccounts';
import { notify, promptAction } from '../components/AppAlert';
import CredentialSlip from '../components/CredentialSlip';
import Pagination from '../components/Pagination';
import Drawer from '../components/Drawer';
import Icon from '../components/Icon';
import { theme as t, radius, type } from '../theme';
import { fmtDay, fmtNum, plural, timeAgo } from '../utils/format';
import { standingLabel } from '../utils/standing';
import { useLive, useLiveTick } from '../api/live';

/*
 * Accounts — the super admin's view of every account in the system (mock
 * defense 2026-10-21; the paper's "Account Management Supervision" and "Admin
 * Account Creation"):
 *   Staff     admins and moderators: make one (credential slip), reset a
 *             password, deactivate, move a moderator, see each account's history.
 *             A locked account of any role, super admins too, can be unlocked.
 *   Travelers every app account, paged and searchable, with when it joined, its
 *             standing, and an overview of one traveler.
 *   Archived  banned, inactive and self-deleted accounts, kept and hidden from
 *             everyone else; any of them can be restored (user request
 *             2026-10-23). A deleted one gets a new sign-in for the same email.
 *
 * Laid out from the user's reference (2026-10-23): the band counts both kinds,
 * a filter list on the left picks what the table shows. Links can open a view
 * directly: ?view=travelers, ?view=archived, ?status=firstSignIn, ?add=1 (the
 * dashboard's).
 */

const STAFF_ROLES = [
  { value: '',          label: 'All staff',    icon: 'users' },
  { value: 'superadmin', label: 'Super admins', icon: 'tool' },
  { value: 'admin',     label: 'Admins',       icon: 'shield' },
  { value: 'moderator', label: 'Moderators',   icon: 'map-pin' },
];
const STAFF_STATUSES = [
  { value: 'active',      label: 'Active',             icon: 'check' },
  { value: 'firstSignIn', label: 'Temporary password', icon: 'key' },
  { value: 'locked',      label: 'Locked',             icon: 'lock' },
  { value: 'deactivated', label: 'Deactivated',        icon: 'slash' },
];
const TRAVELER_STATUSES = [
  { value: '',          label: 'All travelers',    icon: 'users' },
  { value: 'active',    label: 'In good standing', icon: 'check' },
  { value: 'muted',     label: 'Muted',            icon: 'pause' },
  { value: 'suspended', label: 'Suspended',        icon: 'pause' },
  { value: 'banned',    label: 'Banned',           icon: 'slash' },
  { value: 'inactive',  label: 'Deactivated',      icon: 'clock' },
];
// A temporary password whose slip ran out still counts as "Temporary password".
const staffMatches = (a, status) => !status || a.status === status || (status === 'firstSignIn' && a.status === 'slipExpired');
const STANDING = {
  active:    { tone: 'success', icon: 'check',  label: 'Good standing' },
  muted:     { tone: 'warning', icon: 'pause',  label: 'Muted' },
  suspended: { tone: 'danger',  icon: 'pause',  label: 'Suspended' },
  banned:    { tone: 'danger',  icon: 'slash',  label: 'Banned' },
  inactive:  { tone: 'neutral', icon: 'clock',  label: 'Deactivated (inactive)' },
};
const Standing = ({ status }) => {
  const st = STANDING[status] || STANDING.active;
  return <StatusPill tone={st.tone} icon={st.icon}>{st.label}</StatusPill>;
};
const ARCHIVE_FILTERS = [
  { value: '',           label: 'All archived',            icon: 'archive' },
  { value: 'ban',        label: 'Banned',                  icon: 'slash' },
  { value: 'inactivity', label: 'Inactive',                icon: 'clock' },
  { value: 'deleted',    label: 'Deleted by the traveler', icon: 'user-minus' },
];
const ARCHIVED = {
  ban:        { tone: 'danger',  icon: 'slash',      label: 'Banned' },
  inactivity: { tone: 'neutral', icon: 'clock',      label: 'Inactive' },
  deleted:    { tone: 'neutral', icon: 'user-minus', label: 'Deleted by the traveler' },
};
const BLOCKED = {
  emailInUse: 'Their email has a newer account, made after this one was deleted.',
  noRecord:   'Nothing of this account was kept.',
};

/**
 * Asks for the reason and restores one archived account. `acc`: { id, name,
 * email, reason, signInDeleted, appealStatus }. Resolves true once restored.
 */
async function restoreArchived(acc) {
  const what = acc.signInDeleted
    ? `${acc.name} deleted their account, and its sign-in is gone for good. Restoring makes a new sign-in for ${acc.email}, with no password: they sign in with Google, or set a password with “Forgot password?” in the app. Their points, visits, badges and reviews come back with it. Only do this if they asked for their account back.`
    : acc.reason === 'ban'
      ? `${acc.name}’s ban is lifted: they can use the app again, and their reviews and place on the leaderboard show again.${acc.appealStatus === 'submitted' ? ' Their waiting appeal closes with it.' : ''}`
      : `${acc.name}’s account comes out of the archive: their reviews and place on the leaderboard show again.`;
  const note = await promptAction(what, {
    title: 'Restore this account?',
    label: 'Why it’s restored',
    placeholder: 'e.g. They emailed support and asked for it back',
    confirmText: 'Restore',
    tone: 'success',
    maxLength: 500,
  });
  if (note == null) return false;
  try {
    await accountsAPI.restore(acc.id, note);
    notify(acc.signInDeleted
      ? `${acc.name}’s account is back. Tell them to sign in with ${acc.email}: with Google, or with “Forgot password?” to set a password.`
      : `${acc.name}’s account is back.`, { tone: 'success', title: 'Restored' });
    return true;
  } catch (err) {
    notify(err?.response?.data?.message || 'Couldn’t reach the server. Try again.', { tone: 'danger' });
    return false;
  }
}

export default function Accounts() {
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState(['travelers', 'archived'].includes(params.get('view')) ? params.get('view') : 'staff');
  const [role, setRole] = useState('');
  const [staffStatus, setStaffStatus] = useState(STAFF_STATUSES.some((o) => o.value === params.get('status')) ? params.get('status') : '');
  const [travelerStatus, setTravelerStatus] = useState('');
  const [archiveReason, setArchiveReason] = useState('');
  const [adding, setAdding] = useState(params.get('add') === '1');

  // Staff: one list, filtered here.
  const [accounts, setAccounts] = useState([]);
  const [canMake, setCanMake] = useState([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [staffError, setStaffError] = useState('');
  // `quiet`: a live update — no spinner, and a failure keeps the list shown.
  const loadStaff = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) {
      setStaffLoading(true);
      setStaffError('');
    }
    try {
      const data = await accountsAPI.getStaff();
      setAccounts(data.accounts || []);
      setCanMake(data.canMake || []);
    } catch {
      if (!quiet) setStaffError('Couldn’t load the accounts.');
    }
    if (!quiet) setStaffLoading(false);
  }, []);

  // Travelers: paged on the server; the counts are one small ask per standing.
  const [travelerCounts, setTravelerCounts] = useState(null);
  const loadTravelerCounts = useCallback(async () => {
    const total = (status) => accountsAPI.getTravelers({ limit: 1, ...(status ? { status } : {}) }).then((d) => d.total).catch(() => null);
    const values = await Promise.all(TRAVELER_STATUSES.map((o) => total(o.value)));
    setTravelerCounts(Object.fromEntries(TRAVELER_STATUSES.map((o, i) => [o.value, values[i]])));
  }, []);

  // Archived: the counts come with any page of the list.
  const [archivedCounts, setArchivedCounts] = useState(null);
  const loadArchivedCounts = useCallback(async () => {
    try { setArchivedCounts((await accountsAPI.getArchived({ limit: 1 })).counts); } catch { /* the rail shows no numbers */ }
  }, []);

  useEffect(() => { loadStaff(); loadTravelerCounts(); loadArchivedCounts(); }, [loadStaff, loadTravelerCounts, loadArchivedCounts]);
  // Sign-ins, slips and account changes; sign-ups, standing, archiving and restores.
  useLive(['staff'], () => loadStaff({ quiet: true }));
  useLive(['travelers'], () => { loadTravelerCounts(); loadArchivedCounts(); });
  // The link's choices are read once; the address goes back to /accounts.
  useEffect(() => { if ([...params.keys()].length) setParams({}, { replace: true }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const showStaff = (r, st = '') => { setView('staff'); setRole(r); setStaffStatus(st); };
  const showTravelers = (st) => { setView('travelers'); setTravelerStatus(st); };
  const showArchived = (reason) => { setView('archived'); setArchiveReason(reason); };

  const nStaff = (fn) => (staffLoading ? null : accounts.filter(fn).length);
  const n = (v) => (v == null ? '…' : fmtNum(v));
  const onSlip = nStaff((a) => staffMatches(a, 'firstSignIn'));
  const inTrouble = travelerCounts && travelerCounts.suspended != null && travelerCounts.banned != null ? travelerCounts.suspended + travelerCounts.banned : null;
  const stats = [
    { label: 'Admins', hue: 'blue', value: n(nStaff((a) => a.role === 'admin')), hint: 'run spots, reviews and travelers', onClick: () => showStaff('admin'), current: view === 'staff' && role === 'admin' && !staffStatus },
    { label: 'Moderators', hue: 'blue', value: n(nStaff((a) => a.role === 'moderator')), hint: 'one per town', onClick: () => showStaff('moderator'), current: view === 'staff' && role === 'moderator' && !staffStatus },
    { label: 'Temporary password', hue: 'blue', value: n(onSlip), tone: onSlip ? 'warn' : undefined, hint: 'waiting for a first sign-in', onClick: () => showStaff('', 'firstSignIn'), current: view === 'staff' && staffStatus === 'firstSignIn' },
    { label: 'Deactivated staff', hue: 'blue', value: n(nStaff((a) => a.status === 'deactivated')), hint: 'kept, can’t sign in', onClick: () => showStaff('', 'deactivated'), current: view === 'staff' && staffStatus === 'deactivated' },
    { label: 'Travelers', hue: 'teal', value: n(travelerCounts?.['']), hint: 'every app account', onClick: () => showTravelers(''), current: view === 'travelers' && !travelerStatus },
    { label: 'Suspended or banned', hue: 'teal', value: n(inTrouble), tone: inTrouble ? 'warn' : undefined, hint: 'locked out of the app', onClick: () => showTravelers('suspended'), current: view === 'travelers' && (travelerStatus === 'suspended' || travelerStatus === 'banned') },
  ];

  return (
    <Page>
      <PageHeader
        title="Accounts"
        subtitle="Make admin and moderator accounts, reset their passwords or turn them off, look up any traveler, and restore archived accounts. Nothing is ever deleted."
        stats={stats}
        actions={canMake.length > 0 && <Button variant="primary" icon="user-plus" onClick={() => { showStaff(''); setAdding(true); }}>Add account</Button>}
      />

      <div className="sa-grid sa-rail-split">
        <aside className="sa-panel sa-filters" aria-label="Choose accounts">
          <div className="sa-filter-group" role="group" aria-label="Staff">
            <div className="sa-filter-label">Staff</div>
            {STAFF_ROLES.map((o) => (
              <button key={o.value || 'all'} type="button" className="sa-filter"
                aria-pressed={view === 'staff' && role === o.value && !staffStatus} onClick={() => showStaff(o.value)}>
                <Icon name={o.icon} size={15} /> {o.label}
                <span className="sa-filter-n">{n(nStaff((a) => !o.value || a.role === o.value))}</span>
              </button>
            ))}
          </div>
          <div className="sa-filter-group" role="group" aria-label="Staff by status">
            <div className="sa-filter-label">Staff status</div>
            {STAFF_STATUSES.map((o) => {
              const c = nStaff((a) => staffMatches(a, o.value));
              const flag = (o.value === 'firstSignIn' || o.value === 'locked') && c > 0;
              return (
                <button key={o.value} type="button" className="sa-filter"
                  aria-pressed={view === 'staff' && staffStatus === o.value} onClick={() => showStaff('', o.value)}>
                  <Icon name={o.icon} size={15} /> {o.label}
                  <span className={`sa-filter-n${flag ? ' flag' : ''}`}>{n(c)}</span>
                </button>
              );
            })}
          </div>
          <div className="sa-filter-group" role="group" aria-label="Travelers">
            <div className="sa-filter-label">Travelers</div>
            {TRAVELER_STATUSES.map((o) => (
              <button key={o.value || 'all'} type="button" className="sa-filter"
                aria-pressed={view === 'travelers' && travelerStatus === o.value} onClick={() => showTravelers(o.value)}>
                <Icon name={o.icon} size={15} /> {o.label}
                <span className="sa-filter-n">{travelerCounts ? n(travelerCounts[o.value]) : ''}</span>
              </button>
            ))}
          </div>
          <div className="sa-filter-group" role="group" aria-label="Archived accounts">
            <div className="sa-filter-label">Archived</div>
            {ARCHIVE_FILTERS.map((o) => (
              <button key={o.value || 'all'} type="button" className="sa-filter"
                aria-pressed={view === 'archived' && archiveReason === o.value} onClick={() => showArchived(o.value)}>
                <Icon name={o.icon} size={15} /> {o.label}
                <span className="sa-filter-n">{archivedCounts ? n(archivedCounts[o.value || 'all']) : ''}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="sa-col">
          {view === 'archived' ? (
            <ArchivedView reason={archiveReason} title={ARCHIVE_FILTERS.find((o) => o.value === archiveReason)?.label} />
          ) : view === 'staff' ? (
            <StaffView
              accounts={accounts.filter((a) => (!role || a.role === role) && staffMatches(a, staffStatus))}
              all={accounts}
              title={[STAFF_ROLES.find((o) => o.value === role)?.label, STAFF_STATUSES.find((o) => o.value === staffStatus)?.label].filter(Boolean).join(' · ')}
              canMake={canMake}
              loading={staffLoading}
              error={staffError}
              onDismissError={() => setStaffError('')}
              adding={adding}
              setAdding={setAdding}
              onMade={loadStaff}
              onChanged={(acc) => setAccounts((prev) => prev.map((a) => (a.id === acc.id ? acc : a)))}
              onUnlock={async (acc) => { await systemAPI.unlock({ kind: 'staff', id: acc.id }); await loadStaff({ quiet: true }); }}
            />
          ) : (
            <TravelersView status={travelerStatus} title={TRAVELER_STATUSES.find((o) => o.value === travelerStatus)?.label}
              onShowDeleted={() => showArchived('deleted')} />
          )}
        </div>
      </div>
    </Page>
  );
}

function StaffView({ accounts, all, title, canMake, loading, error, onDismissError, adding, setAdding, onMade, onChanged, onUnlock }) {
  const [search, setSearch] = useState('');
  const [slip, setSlip] = useState(null);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts.filter((a) => !q || [a.username, a.name, a.municipality].some((v) => (v || '').toLowerCase().includes(q)));
  }, [accounts, search]);

  return (
    <>
      {error && <ErrorBanner onDismiss={onDismissError}>{error}</ErrorBanner>}

      {adding && (
        <AddAccountForm
          roles={canMake}
          accounts={all}
          onCancel={() => setAdding(false)}
          onMade={(data) => { setAdding(false); setSlip(data); onMade(); }}
        />
      )}

      <Toolbar>
        <span style={a.scope}>{title || 'All staff'} · {fmtNum(visible.length)}</span>
        <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by username or municipality…" />
      </Toolbar>

      {loading ? <Loading label="Loading accounts…" />
        : visible.length === 0 ? <EmptyState icon="users" title="No accounts match" subtitle="Try another filter or search." />
          : (
            <StaffTable
              caption="Staff accounts"
              accounts={visible}
              canManage={(acc) => canMake.includes(acc.role)}
              onChanged={onChanged}
              onUnlock={onUnlock}
            />
          )}

      {slip && (
        <CredentialSlip kind="new" account={slip.account} tempPassword={slip.tempPassword}
          expiresAt={slip.tempPasswordExpiresAt} onClose={() => setSlip(null)} />
      )}
    </>
  );
}

const PAGE_SIZE = 25;

function TravelersView({ status, title, onShowDeleted }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);

  // A new filter from the list starts at the first page.
  useEffect(() => { setPage(1); }, [status]);

  // Types settle for a moment before the list is asked again.
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(query.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // New sign-ups, standing, points and last-active times as they change. A
  // failed live reload keeps the list without an error.
  const changed = useLiveTick(['travelers', 'progress']);
  const seen = useRef(changed);
  useEffect(() => {
    let live = true;
    const quiet = seen.current !== changed;
    seen.current = changed;
    accountsAPI.getTravelers({ page, limit: PAGE_SIZE, ...(status ? { status } : {}), ...(search ? { q: search } : {}) })
      .then((d) => { if (live) { setData(d); setError(''); } })
      .catch(() => { if (live && !quiet) setError('Couldn’t load the travelers.'); });
    return () => { live = false; };
  }, [page, status, search, changed]);

  return (
    <>
      <Toolbar>
        <span style={a.scope}>{title || 'All travelers'}{data ? ` · ${fmtNum(data.total)}` : ''}</span>
        <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, email or municipality…" />
      </Toolbar>

      {error && <ErrorBanner onDismiss={() => setError('')}>{error}</ErrorBanner>}

      {!data ? <Loading label="Loading travelers…" />
        : data.travelers.length === 0 ? <EmptyState icon="users" title="No travelers match" subtitle="Try another filter or search." />
          : (
            <>
              <Table
                caption="Traveler accounts"
                head={<>
                  <Th>Traveler</Th>
                  <Th>Lives in</Th>
                  <Th>Joined</Th>
                  <Th>Last active</Th>
                  <Th align="right">Points</Th>
                  <Th>Standing</Th>
                  <Th align="right" />
                </>}
              >
                {data.travelers.map((u) => (
                  <tr key={u.id}>
                    <Td>
                      <div style={s.person}>
                        <Avatar src={u.profileImage} name={u.name} size={32} />
                        <div style={{ minWidth: 0 }}>
                          <div style={s.personName}>{u.name}</div>
                          <div style={s.personSub}>{u.email}</div>
                        </div>
                      </div>
                    </Td>
                    <Td muted={!u.municipality}>{u.municipality || '—'}</Td>
                    <Td style={{ whiteSpace: 'nowrap' }}><span className="sa-mono">{fmtDay(u.createdAt)}</span></Td>
                    <Td muted style={{ whiteSpace: 'nowrap' }}>{u.lastActiveAt ? <span className="sa-mono">{timeAgo(u.lastActiveAt)}</span> : '—'}</Td>
                    <Td align="right">{fmtNum(u.points)}</Td>
                    <Td>
                      <div style={s.pillStack}>
                        <Standing status={u.status} />
                        {standingLabel(u) && <span style={s.itemDate}>{standingLabel(u)}</span>}
                      </div>
                    </Td>
                    <Td align="right"><Button size="sm" onClick={() => setOpen(u)}>Overview</Button></Td>
                  </tr>
                ))}
              </Table>
              <div style={a.footer}>
                <span style={s.itemDate}>
                  {fmtNum(data.total)} traveler{data.total === 1 ? '' : 's'}
                  {data.deletedKept > 0 && <> · <button type="button" style={a.link} onClick={onShowDeleted}>
                    {fmtNum(data.deletedKept)} deleted account{data.deletedKept === 1 ? '' : 's'} kept in the archive
                  </button></>}
                </span>
                <Pagination page={data.page} pages={data.pages} onChange={setPage} label="Traveler pages" />
              </div>
            </>
          )}

      {open && <TravelerDrawer traveler={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function ArchivedView({ reason, title }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState('');

  useEffect(() => { setPage(1); }, [reason]);
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(query.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Bans, archiving, deletions and restores, from here or anywhere else.
  const changed = useLiveTick(['travelers']);
  const seen = useRef(changed);
  useEffect(() => {
    let live = true;
    const quiet = seen.current !== changed;
    seen.current = changed;
    accountsAPI.getArchived({ page, limit: PAGE_SIZE, ...(reason ? { reason } : {}), ...(search ? { q: search } : {}) })
      .then((d) => { if (live) { setData(d); setError(''); } })
      .catch(() => { if (live && !quiet) setError('Couldn’t load the archived accounts.'); });
    return () => { live = false; };
  }, [page, reason, search, changed]);

  const restore = async (acc) => {
    setBusy(acc.id);
    // The row leaves the list with the live update that follows.
    await restoreArchived(acc);
    setBusy('');
  };

  return (
    <>
      <Toolbar>
        <span style={a.scope}>{title || 'All archived'}{data ? ` · ${fmtNum(data.total)}` : ''}</span>
        <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or email…" />
      </Toolbar>

      {error && <ErrorBanner onDismiss={() => setError('')}>{error}</ErrorBanner>}

      {!data ? <Loading label="Loading archived accounts…" />
        : data.archived.length === 0 ? <EmptyState icon="archive" title="Nothing archived here" subtitle="Banned, inactive and deleted accounts show here, kept and hidden." />
          : (
            <>
              <Table
                caption="Archived accounts"
                head={<>
                  <Th>Traveler</Th>
                  <Th>Why</Th>
                  <Th>Archived</Th>
                  <Th>Kept</Th>
                  <Th align="right" />
                </>}
              >
                {data.archived.map((acc) => {
                  const why = ARCHIVED[acc.reason] || ARCHIVED.inactivity;
                  return (
                    <tr key={acc.id}>
                      <Td>
                        <div style={s.person}>
                          <Avatar src={acc.profileImage} name={acc.name} size={32} />
                          <div style={{ minWidth: 0 }}>
                            <div style={s.personName}>{acc.name}</div>
                            <div style={s.personSub}>{acc.email}</div>
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <div style={s.pillStack}>
                          <StatusPill tone={why.tone} icon={why.icon}>{why.label}</StatusPill>
                          {acc.signInDeleted && acc.reason !== 'deleted' && <Tag icon="user-minus">Sign-in deleted too</Tag>}
                          {acc.banReason && <span style={{ ...s.itemDate, ...a.clip }} title={acc.banReason}>{acc.banReason}</span>}
                          {acc.appealStatus === 'submitted' && <span style={{ ...s.itemDate, color: t.warning }}>Appeal waiting</span>}
                          {acc.blocked && <span style={{ ...s.itemDate, ...a.blocked }}>Can’t be restored: {BLOCKED[acc.blocked].toLowerCase()}</span>}
                        </div>
                      </Td>
                      <Td style={{ whiteSpace: 'nowrap' }}>
                        <div className="sa-mono" style={{ fontSize: 13 }}>{fmtDay(acc.archivedAt)}</div>
                        <div style={s.itemDate}>{acc.createdAt ? <>joined <span className="sa-mono">{fmtDay(acc.createdAt)}</span></> : 'join date unknown'}</div>
                      </Td>
                      <Td muted>
                        <div style={a.kept}>
                          <span style={{ color: t.textPrimary, fontWeight: 600 }}>{plural(acc.points, 'point')}</span>
                          <span>{plural(acc.counts.visits, 'visit')}</span>
                          <span>{plural(acc.counts.reviews, 'review')}</span>
                          <span>{plural(acc.counts.badges, 'badge')}</span>
                        </div>
                      </Td>
                      <Td align="right">
                        <Button size="sm" variant="success" icon="rotate-ccw" style={{ whiteSpace: 'nowrap' }}
                          disabled={busy === acc.id || !!acc.blocked}
                          title={acc.blocked ? BLOCKED[acc.blocked] : undefined}
                          aria-label={`Restore the account of ${acc.name}`}
                          onClick={() => restore(acc)}>
                          {busy === acc.id ? 'Restoring…' : 'Restore'}
                        </Button>
                      </Td>
                    </tr>
                  );
                })}
              </Table>
              <div style={a.footer}>
                <span style={s.itemDate}>
                  {fmtNum(data.total)} archived account{data.total === 1 ? '' : 's'}. Each is kept for good and hidden from
                  the leaderboard, reviews and ratings until it’s restored.
                </span>
                <Pagination page={data.page} pages={data.pages} onChange={setPage} label="Archived pages" />
              </div>
            </>
          )}
    </>
  );
}

function TravelerDrawer({ traveler, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  // Kept current while open; a failed live reload keeps what's shown.
  const changed = useLiveTick(['travelers', 'progress', 'reviews']);
  const seen = useRef(changed);
  useEffect(() => {
    let live = true;
    const quiet = seen.current !== changed;
    seen.current = changed;
    accountsAPI.getTraveler(traveler.id)
      .then((d) => { if (live) setData(d); })
      .catch(() => { if (live && !quiet) setError('Couldn’t load this traveler.'); });
    return () => { live = false; };
  }, [traveler.id, changed]);

  const u = data?.traveler;
  // The live update that follows shows the new standing.
  const [restoring, setRestoring] = useState(false);
  const restore = async () => {
    setRestoring(true);
    await restoreArchived({ id: u.id, name: u.name, email: u.email, reason: u.archiveReason, signInDeleted: false });
    setRestoring(false);
  };

  return (
    <Drawer title={traveler.name} subtitle={traveler.email} onClose={onClose}>
      {error ? <p style={{ color: t.danger }}>{error}</p> : !u ? <Loading label="Loading…" /> : (
        <div style={a.stack}>
          <div><Standing status={u.status} /></div>
          {u.archiveReason && (
            <div style={a.archived}>
              <span style={{ minWidth: 0 }}>
                <strong style={{ color: t.textPrimary }}>In the archive</strong> since <span className="sa-mono">{fmtDay(u.archivedAt)}</span>
                {' '}({(ARCHIVED[u.archiveReason]?.label || u.archiveReason).toLowerCase()}): hidden from the leaderboard, reviews and ratings.
              </span>
              <Button size="sm" variant="success" icon="rotate-ccw" disabled={restoring} onClick={restore}>
                {restoring ? 'Restoring…' : 'Restore'}
              </Button>
            </div>
          )}
          <dl style={a.facts}>
            {[
              ['Joined', fmtDay(u.createdAt)],
              ['Last active', u.lastActiveAt ? timeAgo(u.lastActiveAt) : '—'],
              ['Lives in', u.municipality || '—'],
              ['Points', fmtNum(u.points)],
              ['Spots visited', fmtNum(u.counts.visits)],
              ['Reviews', fmtNum(u.counts.reviews)],
              ['Spot badges', fmtNum(u.counts.badges)],
              ['Days active', fmtNum(u.counts.activeDays)],
            ].map(([k, v]) => (
              <div key={k} style={a.fact}><dt style={a.dt}>{k}</dt><dd style={a.dd}>{v}</dd></div>
            ))}
          </dl>

          {(u.warningHistory.length > 0 || u.suspensionHistory.length > 0) && (
            <section>
              <h3 style={a.h3}>Record</h3>
              <ul style={a.record}>
                {u.warningHistory.map((w, i) => (
                  <li key={`w${i}`}>Warning {i + 1}, {fmtDay(w.issuedAt)}{w.reason ? `: ${w.reason}` : ''}</li>
                ))}
                {u.suspensionHistory.map((x, i) => (
                  <li key={`s${i}`}>Suspension {i + 1}, {fmtDay(x.issuedAt)}{x.reason ? `: ${x.reason}` : ''}</li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3 style={a.h3}>Actions on this account</h3>
            <HistoryList entries={data.entries} />
          </section>
          <p style={a.note}>Days active are counted from 21 Oct 2026, when the system started keeping them.</p>
        </div>
      )}
    </Drawer>
  );
}

const a = {
  scope:  { fontSize: 15, fontWeight: 700, color: t.textPrimary, whiteSpace: 'nowrap' },
  footer: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  stack:  { display: 'flex', flexDirection: 'column', gap: 18 },
  facts:  { margin: 0, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 },
  fact:   { padding: '10px 12px', borderRadius: radius.md, background: t.sidebarBg, border: `1px solid ${t.border}` },
  dt:     { ...type.label, color: t.textMuted },
  dd:     { margin: '4px 0 0', fontSize: 15, fontWeight: 600, color: t.textPrimary, ...type.num },
  h3:     { fontSize: 13, fontWeight: 700, color: t.textPrimary, margin: '0 0 10px' },
  record: { margin: 0, paddingLeft: 18, fontSize: 13, color: t.textSecondary, lineHeight: 1.6 },
  note:   { fontSize: 12, color: t.textMuted, margin: 0 },
  link:   { padding: 0, border: 'none', background: 'none', font: 'inherit', color: t.brand, textDecoration: 'underline', cursor: 'pointer' },
  clip:   { maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  blocked: { maxWidth: 210, color: t.textSecondary, lineHeight: 1.35 },
  kept:   { display: 'flex', flexDirection: 'column', gap: 1, fontSize: 13, whiteSpace: 'nowrap' },
  archived: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: radius.md, background: t.sidebarBg, border: `1px solid ${t.border}`, fontSize: 13, color: t.textSecondary, lineHeight: 1.5 },
};

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { accountsAPI, systemAPI } from '../api/api';
import {
  Page, PageHeader, Toolbar, SearchInput, Button, StatusPill, Tag, Table, Th, Td, Row, Avatar,
  Loading, EmptyState, ErrorBanner, pageStyles as s,
} from '../components/Layout';
import { AddAccountForm, StaffTable } from '../components/StaffAccounts';
import { notify, confirmAction, promptAction } from '../components/AppAlert';
import CredentialSlip from '../components/CredentialSlip';
import Pagination, { PAGE_SIZE, Paged, usePaged } from '../components/Pagination';
import { Bone } from '../components/Skeleton';
import Drawer from '../components/Drawer';
import TravelerDrawer, { Standing } from '../components/TravelerDrawer';
import { Facts, DetailSection, DetailText, detailStyles as d } from '../components/Details';
import Icon from '../components/Icon';
import { theme as t } from '../theme';
import { fmtDateTime, fmtDay, fmtNum, plural, timeAgo } from '../utils/format';
import { standingLabel } from '../utils/standing';
import { useLive, useLiveTick } from '../api/live';

/*
 * Accounts — the super admin's view of every account in the system (mock
 * defense 2026-10-21; the paper's "Account Management Supervision" and "Admin
 * Account Creation"):
 *   Staff     admins and moderators: make one (credential slip), reset a
 *             password, delete (to the archive), move a moderator, see each
 *             account's history.
 *   Travelers every app account, paged and searchable, with when it joined, its
 *             standing, and an overview of one traveler.
 *   Locked    every account locked by wrong passwords: staff of any role, super
 *             admins too, and travelers (Clerk's lock). Unlock one or all (user
 *             rule 2026-10-23; moved here from the System page's tools, user
 *             2026-10-23). A "Locked" line under Staff status and under
 *             Travelers; all of them from the band's Locked accounts box.
 *   Archived  banned, inactive and self-deleted accounts, kept and hidden from
 *             everyone else; any of them can be restored (user request
 *             2026-10-23). A deleted one gets a new sign-in for the same email.
 *             Deleted staff too (user rule 2026-10-24), with Restore.
 *
 * Laid out from the user's reference (2026-10-23): the band counts both kinds,
 * a filter list on the left picks what the table shows. Links can open a view
 * directly: ?view=travelers, ?view=locked, ?view=archived, ?status=firstSignIn,
 * ?add=1 (the dashboard's).
 */

const STAFF_ROLES = [
  { value: '',          label: 'All staff',    icon: 'users' },
  { value: 'superadmin', label: 'Super admins', icon: 'tool' },
  { value: 'admin',     label: 'Admins',       icon: 'shield' },
  { value: 'moderator', label: 'Moderators',   icon: 'map-pin' },
];
// The filter list (the user's marked-up screenshot, 2026-10-23): no Locked
// group of its own, a "Locked" line under Staff status and under Travelers
// instead (every locked account at once is the band's Locked accounts box).
// Deleted staff leave the staff lists for Archived → Deleted staff; travelers'
// "In good standing" is gone (Archived → Inactive is the inactive ones).
const STAFF_STATUSES = [
  { value: 'active',      label: 'Active',             icon: 'check' },
  { value: 'firstSignIn', label: 'Temporary password', icon: 'key' },
];
const TRAVELER_STATUSES = [
  { value: '',          label: 'All travelers',    icon: 'users' },
  { value: 'muted',     label: 'Muted',            icon: 'pause' },
  { value: 'suspended', label: 'Suspended',        icon: 'pause' },
  { value: 'banned',    label: 'Banned',           icon: 'slash' },
];
// A temporary password whose slip ran out still counts as "Temporary password".
const staffMatches = (a, status) => !status || a.status === status || (status === 'firstSignIn' && a.status === 'slipExpired');
const LOCKED_FILTERS = [
  { value: '',         label: 'Locked accounts' },
  { value: 'staff',    label: 'Locked staff' },
  { value: 'traveler', label: 'Locked travelers' },
];
const lockedMatches = (acc, kind) => !kind || acc.kind === kind;
const LOCKED_ROLE = { superadmin: 'Super admin', admin: 'Admin', moderator: 'Moderator', traveler: 'Traveler' };
const ARCHIVE_FILTERS = [
  { value: '',           label: 'All archived',            icon: 'archive' },
  { value: 'ban',        label: 'Banned',                  icon: 'slash' },
  { value: 'inactivity', label: 'Inactive',                icon: 'clock' },
  { value: 'deleted',    label: 'Deleted by the traveler', icon: 'user-minus' },
  { value: 'staff',      label: 'Deleted staff',           icon: 'trash' },
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
const APPEAL_WORD = { submitted: 'waiting for a decision', approved: 'approved', rejected: 'rejected' };

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
  const [view, setView] = useState(['travelers', 'locked', 'archived'].includes(params.get('view')) ? params.get('view') : 'staff');
  const [role, setRole] = useState('');
  const [staffStatus, setStaffStatus] = useState(STAFF_STATUSES.some((o) => o.value === params.get('status')) ? params.get('status') : '');
  const [travelerStatus, setTravelerStatus] = useState('');
  const [lockedKind, setLockedKind] = useState('');
  const [archiveReason, setArchiveReason] = useState('');
  const [adding, setAdding] = useState(params.get('add') === '1');

  // Staff: one list, filtered here; the deleted ones are the archive's.
  const [accounts, setAccounts] = useState([]);
  const [deletedStaff, setDeletedStaff] = useState([]);
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
      const [data, deleted] = await Promise.all([accountsAPI.getStaff(), accountsAPI.getStaff({ archived: 1 })]);
      setAccounts(data.accounts || []);
      setDeletedStaff(deleted.accounts || []);
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

  // Locked: one short list, staff from the database and travelers from Clerk.
  const [locked, setLocked] = useState(null);
  const [lockedError, setLockedError] = useState('');
  const loadLocked = useCallback(async ({ quiet = false } = {}) => {
    try {
      setLocked(await systemAPI.locked());
      setLockedError('');
    } catch {
      if (!quiet) setLockedError('Couldn’t load the locked accounts.');
    }
  }, []);

  // Archived: the counts come with any page of the list.
  const [archivedCounts, setArchivedCounts] = useState(null);
  const loadArchivedCounts = useCallback(async () => {
    try { setArchivedCounts((await accountsAPI.getArchived({ limit: 1 })).counts); } catch { /* the rail shows no numbers */ }
  }, []);

  useEffect(() => { loadStaff(); loadTravelerCounts(); loadLocked(); loadArchivedCounts(); }, [loadStaff, loadTravelerCounts, loadLocked, loadArchivedCounts]);
  // Sign-ins, lockouts, unlocks, slips and account changes; sign-ups,
  // standing, archiving and restores.
  useLive(['staff'], () => { loadStaff({ quiet: true }); loadLocked({ quiet: true }); });
  useLive(['travelers'], () => { loadTravelerCounts(); loadArchivedCounts(); });
  // The link's choices are read once; the address goes back to /accounts.
  useEffect(() => { if ([...params.keys()].length) setParams({}, { replace: true }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const showStaff = (r, st = '') => { setView('staff'); setRole(r); setStaffStatus(st); };
  const showTravelers = (st) => { setView('travelers'); setTravelerStatus(st); };
  const showLocked = (kind) => { setView('locked'); setLockedKind(kind); };
  const showArchived = (reason) => { setView('archived'); setArchiveReason(reason); };

  const nStaff = (fn) => (staffLoading ? null : accounts.filter(fn).length);
  const n = (v) => (v == null ? '…' : fmtNum(v));
  // The filter list's counts: a bone until they load (the strip draws its '…' as one).
  const nList = (v) => (v == null ? <Bone inline w={18} h={11} /> : fmtNum(v));
  // The "Locked" line under Staff status or Travelers. Flagged while any are
  // locked; "—" when Clerk didn't say which travelers are.
  const lockedLine = (kind) => {
    const c = locked ? locked.accounts.filter((acc) => lockedMatches(acc, kind)).length : null;
    const unknown = kind === 'traveler' && locked?.travelersUnavailable;
    return (
      <button type="button" className="sa-filter"
        aria-pressed={view === 'locked' && lockedKind === kind} onClick={() => showLocked(kind)}>
        <Icon name="lock" size={15} /> Locked
        <span className={`sa-filter-n${c && !unknown ? ' flag' : ''}`}>{unknown ? '—' : nList(c)}</span>
      </button>
    );
  };
  // The Archived lines: travelers from the archive's counts, plus deleted staff.
  const archivedN = (value) => {
    if (value === 'staff') return nList(staffLoading ? null : deletedStaff.length);
    if (!archivedCounts) return '';
    return n(value ? archivedCounts[value] : staffLoading ? null : archivedCounts.all + deletedStaff.length);
  };
  // A deleted or restored account moves between the staff list and the archive.
  const placeStaff = (acc) => {
    const put = (belongs) => (prev) => {
      if (!belongs) return prev.filter((a) => a.id !== acc.id);
      return prev.some((a) => a.id === acc.id) ? prev.map((a) => (a.id === acc.id ? acc : a)) : [...prev, acc];
    };
    setAccounts(put(acc.active));
    setDeletedStaff(put(!acc.active));
  };
  const onSlip = nStaff((a) => staffMatches(a, 'firstSignIn'));
  const inTrouble = travelerCounts && travelerCounts.suspended != null && travelerCounts.banned != null ? travelerCounts.suspended + travelerCounts.banned : null;
  const nLocked = locked?.accounts.length;
  // Six figures (the strip folds six to three on a tablet): Locked took
  // the old Deactivated staff figure's place (deleted staff are in the archive).
  const stats = [
    { label: 'Admins', hue: 'blue', value: n(nStaff((a) => a.role === 'admin')), hint: 'run spots, reviews and travelers', onClick: () => showStaff('admin'), current: view === 'staff' && role === 'admin' && !staffStatus },
    { label: 'Moderators', hue: 'blue', value: n(nStaff((a) => a.role === 'moderator')), hint: 'one per municipality', onClick: () => showStaff('moderator'), current: view === 'staff' && role === 'moderator' && !staffStatus },
    { label: 'Temporary password', hue: 'blue', value: n(onSlip), tone: onSlip ? 'warn' : undefined, hint: 'waiting for a first sign-in', onClick: () => showStaff('', 'firstSignIn'), current: view === 'staff' && staffStatus === 'firstSignIn' },
    { label: 'Travelers', hue: 'teal', value: n(travelerCounts?.['']), hint: 'every app account', onClick: () => showTravelers(''), current: view === 'travelers' && !travelerStatus },
    { label: 'Suspended or banned', hue: 'teal', value: n(inTrouble), tone: inTrouble ? 'warn' : undefined, hint: 'locked out of the app', onClick: () => showTravelers('suspended'), current: view === 'travelers' && (travelerStatus === 'suspended' || travelerStatus === 'banned') },
    { label: 'Locked accounts', hue: 'blue', value: n(nLocked), tone: nLocked ? 'warn' : undefined,
      hint: nLocked ? locked.accounts.map((acc) => acc.label).join(', ') : 'too many wrong passwords', onClick: () => showLocked(''), current: view === 'locked' && !lockedKind },
  ];

  return (
    <Page>
      <PageHeader
        title="Accounts"
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
                <span className="sa-filter-n">{nList(nStaff((a) => !o.value || a.role === o.value))}</span>
              </button>
            ))}
          </div>
          <div className="sa-filter-group" role="group" aria-label="Staff by status">
            <div className="sa-filter-label">Staff status</div>
            {STAFF_STATUSES.map((o) => {
              const c = nStaff((a) => staffMatches(a, o.value));
              const flag = o.value === 'firstSignIn' && c > 0;
              return (
                <button key={o.value} type="button" className="sa-filter"
                  aria-pressed={view === 'staff' && staffStatus === o.value} onClick={() => showStaff('', o.value)}>
                  <Icon name={o.icon} size={15} /> {o.label}
                  <span className={`sa-filter-n${flag ? ' flag' : ''}`}>{nList(c)}</span>
                </button>
              );
            })}
            {lockedLine('staff')}
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
            {lockedLine('traveler')}
          </div>
          <div className="sa-filter-group" role="group" aria-label="Archived accounts">
            <div className="sa-filter-label">Archived</div>
            {ARCHIVE_FILTERS.map((o) => (
              <button key={o.value || 'all'} type="button" className="sa-filter"
                aria-pressed={view === 'archived' && archiveReason === o.value} onClick={() => showArchived(o.value)}>
                <Icon name={o.icon} size={15} /> {o.label}
                <span className="sa-filter-n">{archivedN(o.value)}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="sa-col">
          {view === 'archived' ? (
            <>
              {(archiveReason === '' || archiveReason === 'staff') && (
                <DeletedStaffView accounts={deletedStaff} loading={staffLoading} canMake={canMake} onChanged={placeStaff}
                  hideWhenEmpty={archiveReason === ''} />
              )}
              {archiveReason !== 'staff' && (
                <ArchivedView reason={archiveReason} title={archiveReason ? ARCHIVE_FILTERS.find((o) => o.value === archiveReason)?.label : 'Archived travelers'} />
              )}
            </>
          ) : view === 'locked' ? (
            <LockedView
              locked={locked}
              kind={lockedKind}
              title={LOCKED_FILTERS.find((o) => o.value === lockedKind)?.label}
              error={lockedError}
              onDismissError={() => setLockedError('')}
              reload={loadLocked}
              onUnlocked={() => Promise.all([loadLocked({ quiet: true }), loadStaff({ quiet: true })])}
            />
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
              onChanged={placeStaff}
              onUnlock={async (acc) => { await systemAPI.unlock({ kind: 'staff', id: acc.id }); await Promise.all([loadStaff({ quiet: true }), loadLocked({ quiet: true })]); }}
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
        <span style={a.scope}>{title || 'All staff'} · {loading ? <Bone inline w={20} h={12} /> : fmtNum(visible.length)}</span>
        <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by username or municipality…" />
      </Toolbar>

      {loading ? <Loading label="Loading accounts…" cols={5} media="avatar" />
        : visible.length === 0 ? <EmptyState icon="users" title="No accounts match" subtitle="Try another filter or search." />
          : (
            <StaffTable
              caption="Staff accounts"
              accounts={visible}
              canManage={(acc) => canMake.includes(acc.role)}
              canReset
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

/*
 * Deleted admin and moderator accounts (user rule 2026-10-24): Delete moves a
 * staff account here, kept with its history, and Restore lets it sign in
 * again. Under All archived it shows only when there are some.
 */
function DeletedStaffView({ accounts, loading, canMake, onChanged, hideWhenEmpty }) {
  if (hideWhenEmpty && (loading || !accounts.length)) return null;
  return (
    <>
      <Toolbar>
        <span style={a.scope}>Deleted staff · {loading ? <Bone inline w={20} h={12} /> : fmtNum(accounts.length)}</span>
      </Toolbar>
      {loading ? <Loading label="Loading deleted staff…" cols={5} media="avatar" />
        : accounts.length === 0 ? <EmptyState icon="archive" title="No deleted staff" subtitle="An admin or moderator account that’s deleted shows here, kept with its history, until it’s restored." />
          : (
            <StaffTable
              caption="Deleted staff accounts"
              accounts={accounts}
              canManage={(acc) => canMake.includes(acc.role)}
              onChanged={onChanged}
            />
          )}
    </>
  );
}

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

      {!data ? <Loading label="Loading travelers…" cols={7} media="avatar" />
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
                  <Row key={u.id} onOpen={() => setOpen(u)} label={`Overview of ${u.name}`}>
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
                  </Row>
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

      {open && (
        <TravelerDrawer traveler={open} onClose={() => setOpen(null)}
          archivedAction={(u) => <RestoreButton acc={{ id: u.id, name: u.name, email: u.email, reason: u.archiveReason, signInDeleted: false }} />} />
      )}
    </>
  );
}

/*
 * Every account locked by wrong passwords, with Unlock on each and Unlock all.
 * A traveler's lock happens in Clerk and sends no live update, hence Check
 * again. `reload({ quiet })` asks for the list again; `onUnlocked` after an
 * unlock (the staff rows change too).
 */
function LockedView({ locked, kind, title, error, onDismissError, reload, onUnlocked }) {
  const [busy, setBusy] = useState('');
  const all = locked?.accounts || [];
  const shown = all.filter((acc) => lockedMatches(acc, kind));
  const paged = usePaged(shown, kind);

  const run = async (key, fn) => {
    setBusy(key);
    try { await fn(); } catch (err) {
      notify(err?.response?.data?.message || 'Couldn’t reach the server. Try again.', { tone: 'danger' });
    }
    setBusy('');
  };
  const unlock = (acc) => run(`${acc.kind}-${acc.id}`, async () => {
    await systemAPI.unlock(acc);
    notify(`${acc.label} can sign in again.`, { tone: 'success' });
    await onUnlocked();
  });
  const unlockAll = async () => {
    const ok = await confirmAction(`All ${all.length} can try their passwords again at once. Unlock them only if you know these were their own wrong tries.`, { title: 'Unlock every locked account?', confirmText: 'Unlock all' });
    if (ok) await unlockEvery();
  };
  const unlockEvery = () => run('all', async () => {
    const r = await systemAPI.unlockAll();
    notify(
      r.failed.length
        ? `Unlocked ${r.unlocked}. Clerk didn’t unlock ${r.failed.join(', ')}; try again.`
        : `Unlocked ${r.unlocked} account${r.unlocked === 1 ? '' : 's'}. They can sign in again.`,
      { tone: r.failed.length ? 'warning' : 'success' },
    );
    await onUnlocked();
  });

  const nobody = kind === 'traveler' ? 'No traveler is locked'
    : kind === 'staff' || locked?.travelersUnavailable ? 'No staff account is locked'
      : 'No account is locked';

  return (
    <>
      <Toolbar>
        <span style={a.scope}>{title || 'Locked accounts'}{locked ? ` · ${fmtNum(shown.length)}` : ''}</span>
        <div style={a.toolbarEnd}>
          {/* Unlock all frees every locked account, so it sits on the whole list only. */}
          {!kind && all.length > 1 && (
            <Button size="sm" icon="unlock" onClick={unlockAll} disabled={!!busy}>
              {busy === 'all' ? 'Unlocking…' : `Unlock all ${all.length}`}
            </Button>
          )}
          <Button size="sm" variant="subtle" icon="refresh-cw" onClick={() => run('check', reload)} disabled={busy === 'check'}>
            {busy === 'check' ? 'Checking…' : 'Check again'}
          </Button>
        </div>
      </Toolbar>

      {error && <ErrorBanner onDismiss={onDismissError}>{error}</ErrorBanner>}
      {locked?.travelersUnavailable && kind !== 'staff' && (
        <p style={a.warn} role="status">
          <Icon name="alert-circle" size={14} color={t.warning} /> Couldn’t ask Clerk which travelers are locked. Staff are shown; check again in a moment.
        </p>
      )}

      {!locked ? (!error && <Loading label="Loading locked accounts…" cols={4} media="avatar" />)
        : shown.length === 0 ? <EmptyState icon="unlock" title={nobody} subtitle="Accounts locked by wrong passwords show here until they’re unlocked or their lock runs out." />
          : (
            <Paged {...paged} label="Locked account pages">
            <Table
              caption="Locked accounts"
              head={<>
                <Th>Account</Th>
                <Th>Kind</Th>
                <Th>Locked until</Th>
                <Th align="right" />
              </>}
            >
              {paged.rows.map((acc) => (
                <tr key={`${acc.kind}-${acc.id}`}>
                  <Td>
                    <div style={s.person}>
                      <Avatar name={acc.label} size={32} />
                      <div style={{ minWidth: 0 }}>
                        <div style={s.personName}>{acc.label}</div>
                        {(acc.kind === 'traveler' ? acc.email : acc.municipality) && (
                          <div style={s.personSub}>{acc.kind === 'traveler' ? acc.email : acc.municipality}</div>
                        )}
                      </div>
                    </div>
                  </Td>
                  <Td>{LOCKED_ROLE[acc.role] || acc.role}</Td>
                  <Td muted style={{ whiteSpace: 'nowrap' }}>
                    {acc.lockedUntil ? <span className="sa-mono">{fmtDateTime(acc.lockedUntil)}</span> : 'Until it’s unlocked'}
                  </Td>
                  <Td align="right">
                    <Button size="sm" variant="success" icon="unlock" style={{ whiteSpace: 'nowrap' }}
                      disabled={busy === `${acc.kind}-${acc.id}` || busy === 'all'}
                      aria-label={`Unlock ${acc.label}`}
                      onClick={() => unlock(acc)}>
                      {busy === `${acc.kind}-${acc.id}` ? 'Unlocking…' : 'Unlock'}
                    </Button>
                  </Td>
                </tr>
              ))}
            </Table>
            </Paged>
          )}

      <p style={{ ...s.itemDate, margin: 0 }}>
        Five wrong passwords lock any account for a while: a super admin, admin or moderator here in the console, a
        traveler in the app. Unlock one once you know it was them.
      </p>
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
  const [open, setOpen] = useState(null);

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

      {!data ? <Loading label="Loading archived accounts…" cols={5} media="avatar" />
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
                    <Row key={acc.id} onOpen={() => setOpen(acc)} label={`Details of ${acc.name}`}>
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
                    </Row>
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

      {open && <ArchivedDrawer acc={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/** Restore, beside an archived account's details; `onRestored` once it's back. */
function RestoreButton({ acc, onRestored }) {
  const [busy, setBusy] = useState(false);
  const restore = async () => {
    setBusy(true);
    const ok = await restoreArchived(acc);
    setBusy(false);
    if (ok) onRestored?.();
  };
  return (
    <Button size="sm" variant="success" icon="rotate-ccw" style={{ whiteSpace: 'nowrap' }} disabled={busy} onClick={restore}>
      {busy ? 'Restoring…' : 'Restore'}
    </Button>
  );
}

/*
 * One archived account. While its User record is still in the app (banned,
 * inactive), the traveler's full overview with the archive's own details on
 * top; a deleted sign-in has only what the archive kept, so that is shown.
 */
function ArchivedDrawer({ acc, onClose }) {
  const why = ARCHIVED[acc.reason] || ARCHIVED.inactivity;
  const archiveDetails = (
    <>
      {acc.banReason && <DetailSection title="Why they were banned"><DetailText>{acc.banReason}</DetailText></DetailSection>}
      {acc.appealStatus && acc.appealStatus !== 'none' && (
        <p style={{ ...d.note, color: acc.appealStatus === 'submitted' ? t.warning : t.textMuted }}>
          Appeal {APPEAL_WORD[acc.appealStatus] || acc.appealStatus}{acc.appealedAt ? `, sent ${fmtDay(acc.appealedAt)}` : ''}.
        </p>
      )}
      {acc.blocked && <p style={{ ...d.note, color: t.textSecondary }}>Can’t be restored: {BLOCKED[acc.blocked].toLowerCase()}</p>}
    </>
  );

  if (!acc.signInDeleted && !acc.blocked) {
    return (
      <TravelerDrawer traveler={acc} onClose={onClose}
        archivedAction={() => <RestoreButton acc={acc} onRestored={onClose} />}>
        {archiveDetails}
      </TravelerDrawer>
    );
  }
  return (
    <Drawer title={acc.name} subtitle={acc.email} onClose={onClose}>
      <div style={d.stack}>
        <div style={d.strip}>
          <span style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <StatusPill tone={why.tone} icon={why.icon}>{why.label}</StatusPill>
            {acc.signInDeleted && acc.reason !== 'deleted' && <Tag icon="user-minus">Sign-in deleted too</Tag>}
          </span>
          {!acc.blocked && <RestoreButton acc={acc} onRestored={onClose} />}
        </div>
        <Facts items={[
          ['Archived', fmtDay(acc.archivedAt)],
          ['Sign-in deleted', acc.accountDeletedAt ? fmtDay(acc.accountDeletedAt) : null],
          ['Joined', acc.createdAt ? fmtDay(acc.createdAt) : 'Unknown'],
          ['Last active', acc.lastActiveAt ? timeAgo(acc.lastActiveAt) : '—'],
          ['Lived in', acc.municipality || '—'],
          ['Points', fmtNum(acc.points)],
          ['Spots visited', fmtNum(acc.counts.visits)],
          ['Reviews', fmtNum(acc.counts.reviews)],
          ['Spot badges', fmtNum(acc.counts.badges)],
        ]} />
        {archiveDetails}
        <p style={d.note}>
          Kept for good and hidden from the leaderboard, reviews and ratings until it’s restored.
          {acc.signInDeleted && !acc.blocked && ' Restoring makes a new sign-in for the same email.'}
        </p>
      </div>
    </Drawer>
  );
}

const a = {
  scope:  { fontSize: 15, fontWeight: 700, color: t.textPrimary, whiteSpace: 'nowrap' },
  footer: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  toolbarEnd: { marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' },
  warn:   { display: 'flex', alignItems: 'flex-start', gap: 6, margin: 0, fontSize: 13, color: t.textSecondary, lineHeight: 1.45 },
  link:   { padding: 0, border: 'none', background: 'none', font: 'inherit', color: t.brand, textDecoration: 'underline', cursor: 'pointer' },
  clip:   { maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  blocked: { maxWidth: 210, color: t.textSecondary, lineHeight: 1.35 },
  kept:   { display: 'flex', flexDirection: 'column', gap: 1, fontSize: 13, whiteSpace: 'nowrap' },
};

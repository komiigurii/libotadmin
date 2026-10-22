import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { accountsAPI } from '../api/api';
import {
  Page, PageHeader, Toolbar, SearchInput, Button, StatusPill, Table, Th, Td, Avatar,
  Loading, EmptyState, ErrorBanner, pageStyles as s,
} from '../components/Layout';
import { AddAccountForm, StaffTable, HistoryList } from '../components/StaffAccounts';
import CredentialSlip from '../components/CredentialSlip';
import Pagination from '../components/Pagination';
import Drawer from '../components/Drawer';
import Icon from '../components/Icon';
import { theme as t, radius, type } from '../theme';
import { fmtDay, fmtNum, timeAgo } from '../utils/format';
import { standingLabel } from '../utils/standing';
import { useLive, useLiveTick } from '../api/live';

/*
 * Accounts — the super admin's view of every account in the system (mock
 * defense 2026-10-21; the paper's "Account Management Supervision" and "Admin
 * Account Creation"):
 *   Staff     admins and moderators: make one (credential slip), reset a
 *             password, deactivate, move a moderator, see each account's history.
 *   Travelers every app account, paged and searchable, with when it joined, its
 *             standing, and an overview of one traveler.
 *
 * Laid out from the user's reference (2026-10-23): the band counts both kinds,
 * a filter list on the left picks what the table shows. Links can open a view
 * directly: ?view=travelers, ?status=firstSignIn, ?add=1 (the dashboard's).
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

export default function Accounts() {
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState(params.get('view') === 'travelers' ? 'travelers' : 'staff');
  const [role, setRole] = useState('');
  const [staffStatus, setStaffStatus] = useState(STAFF_STATUSES.some((o) => o.value === params.get('status')) ? params.get('status') : '');
  const [travelerStatus, setTravelerStatus] = useState('');
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

  useEffect(() => { loadStaff(); loadTravelerCounts(); }, [loadStaff, loadTravelerCounts]);
  // Sign-ins, slips and account changes; sign-ups and standing.
  useLive(['staff'], () => loadStaff({ quiet: true }));
  useLive(['travelers'], loadTravelerCounts);
  // The link's choices are read once; the address goes back to /accounts.
  useEffect(() => { if ([...params.keys()].length) setParams({}, { replace: true }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const showStaff = (r, st = '') => { setView('staff'); setRole(r); setStaffStatus(st); };
  const showTravelers = (st) => { setView('travelers'); setTravelerStatus(st); };

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
        subtitle="Make admin and moderator accounts, reset their passwords or turn them off, and look up any traveler. Nothing is ever deleted."
        stats={stats}
        actions={<>
          <Button icon="refresh-cw" onClick={() => { loadStaff(); loadTravelerCounts(); }}>Refresh</Button>
          {canMake.length > 0 && <Button variant="primary" icon="user-plus" onClick={() => { showStaff(''); setAdding(true); }}>Add account</Button>}
        </>}
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
        </aside>

        <div className="sa-col">
          {view === 'staff' ? (
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
            />
          ) : (
            <TravelersView status={travelerStatus} title={TRAVELER_STATUSES.find((o) => o.value === travelerStatus)?.label} />
          )}
        </div>
      </div>
    </Page>
  );
}

function StaffView({ accounts, all, title, canMake, loading, error, onDismissError, adding, setAdding, onMade, onChanged }) {
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

function TravelersView({ status, title }) {
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
                  {data.deletedKept > 0 && ` · ${fmtNum(data.deletedKept)} deleted account${data.deletedKept === 1 ? '' : 's'} kept hidden`}
                </span>
                <Pagination page={data.page} pages={data.pages} onChange={setPage} label="Traveler pages" />
              </div>
            </>
          )}

      {open && <TravelerDrawer traveler={open} onClose={() => setOpen(null)} />}
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
  return (
    <Drawer title={traveler.name} subtitle={traveler.email} onClose={onClose}>
      {error ? <p style={{ color: t.danger }}>{error}</p> : !u ? <Loading label="Loading…" /> : (
        <div style={a.stack}>
          <div><Standing status={u.status} /></div>
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
};

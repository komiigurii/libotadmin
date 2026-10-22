import { useEffect, useMemo, useState } from 'react';
import { accountsAPI } from '../api/api';
import {
  Page, PageHeader, Toolbar, SearchInput, Button, FilterTabs, StatusPill, Table, Th, Td, Avatar,
  Loading, EmptyState, ErrorBanner, pageStyles as s,
} from '../components/Layout';
import { AddAccountForm, StaffTable, HistoryList } from '../components/StaffAccounts';
import CredentialSlip from '../components/CredentialSlip';
import Pagination from '../components/Pagination';
import Drawer from '../components/Drawer';
import { theme as t, radius, type } from '../theme';
import { fmtDay, fmtNum, timeAgo } from '../utils/format';
import { standingLabel } from '../utils/standing';

/*
 * Accounts — the super admin's view of every account in the system (mock
 * defense 2026-10-21; the paper's "Account Management Supervision" and "Admin
 * Account Creation"). Two tabs:
 *   Staff     admins and moderators: make one (credential slip), reset a
 *             password, deactivate, move a moderator, see each account's history.
 *   Travelers every app account, paged and searchable, with when it joined, its
 *             standing, and an overview of one traveler.
 */

const STAFF_ROLES = [
  { value: '',          label: 'All' },
  { value: 'admin',     label: 'Admins' },
  { value: 'moderator', label: 'Moderators' },
  { value: 'superadmin', label: 'Super admins' },
];
const STAFF_STATUSES = [
  { value: '',            label: 'Any status' },
  { value: 'active',      label: 'Active' },
  { value: 'firstSignIn', label: 'Temporary password' },
  { value: 'deactivated', label: 'Deactivated' },
];
const TRAVELER_STATUSES = [
  { value: '',          label: 'All' },
  { value: 'active',    label: 'In good standing' },
  { value: 'muted',     label: 'Muted' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'banned',    label: 'Banned' },
  { value: 'inactive',  label: 'Deactivated' },
];
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
  const [tab, setTab] = useState('staff');
  return (
    <Page wide>
      <PageHeader
        title="Accounts"
        subtitle="Every account in the system. Make admin and moderator accounts, reset their passwords or turn them off, and look up any traveler. Nothing is ever deleted."
      />
      <FilterTabs
        label="Kind of account"
        value={tab}
        onChange={setTab}
        options={[{ value: 'staff', label: 'Admins & moderators' }, { value: 'travelers', label: 'Travelers' }]}
      />
      {tab === 'staff' ? <StaffTab /> : <TravelersTab />}
    </Page>
  );
}

function StaffTab() {
  const [accounts, setAccounts] = useState([]);
  const [canMake, setCanMake] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [slip, setSlip] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await accountsAPI.getStaff();
      setAccounts(data.accounts || []);
      setCanMake(data.canMake || []);
    } catch {
      setError('Couldn’t load the accounts.');
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts.filter((a) => (!role || a.role === role)
      && (!status || a.status === status || (status === 'firstSignIn' && a.status === 'slipExpired'))
      && (!q || [a.username, a.name, a.municipality].some((v) => (v || '').toLowerCase().includes(q))));
  }, [accounts, role, status, search]);

  const count = (r) => accounts.filter((a) => !r || a.role === r).length;
  const replace = (acc) => setAccounts((prev) => prev.map((a) => (a.id === acc.id ? acc : a)));

  return (
    <>
      <Toolbar>
        <FilterTabs label="Role" value={role} onChange={setRole} options={STAFF_ROLES.map((o) => ({ ...o, count: count(o.value) }))} />
        <FilterTabs label="Status" value={status} onChange={setStatus} options={STAFF_STATUSES} />
        <div style={{ flex: 1 }} />
        <Button icon="refresh-cw" onClick={load} disabled={loading}>Refresh</Button>
        {!adding && canMake.length > 0 && <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>Add account</Button>}
      </Toolbar>

      {error && <ErrorBanner onDismiss={() => setError('')}>{error}</ErrorBanner>}

      {adding && (
        <AddAccountForm
          roles={canMake}
          accounts={accounts}
          onCancel={() => setAdding(false)}
          onMade={(data) => { setAdding(false); setSlip(data); load(); }}
        />
      )}

      {accounts.length > 0 && (
        <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by username or municipality…" />
      )}

      {loading ? <Loading label="Loading accounts…" />
        : visible.length === 0 ? <EmptyState icon="users" title="No accounts match" subtitle="Try another filter." />
          : (
            <StaffTable
              caption="Admin and moderator accounts"
              accounts={visible}
              canManage={(a) => canMake.includes(a.role)}
              onChanged={replace}
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

function TravelersTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);

  // Types settle for a moment before the list is asked again.
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(query.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let live = true;
    accountsAPI.getTravelers({ page, limit: PAGE_SIZE, ...(status ? { status } : {}), ...(search ? { q: search } : {}) })
      .then((d) => { if (live) { setData(d); setError(''); } })
      .catch(() => { if (live) setError('Couldn’t load the travelers.'); });
    return () => { live = false; };
  }, [page, status, search]);

  return (
    <>
      <Toolbar>
        <FilterTabs label="Standing" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={TRAVELER_STATUSES} />
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
                    <Td>{fmtDay(u.createdAt)}</Td>
                    <Td muted>{u.lastActiveAt ? timeAgo(u.lastActiveAt) : '—'}</Td>
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
  useEffect(() => {
    let live = true;
    accountsAPI.getTraveler(traveler.id)
      .then((d) => { if (live) setData(d); })
      .catch(() => { if (live) setError('Couldn’t load this traveler.'); });
    return () => { live = false; };
  }, [traveler.id]);

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

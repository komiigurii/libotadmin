import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { activityAPI } from '../api/api';
import { useLiveTick } from '../api/live';
import {
  Page, PageHeader, Toolbar, SearchInput, Table, Th, Td, Row,
  Loading, EmptyState, ErrorBanner, pageStyles as s,
} from '../components/Layout';
import Pagination from '../components/Pagination';
import Drawer from '../components/Drawer';
import { Facts, DetailSection, DetailText, detailStyles as d } from '../components/Details';
import { theme as t } from '../theme';
import { fmtDateTime, fmtNum } from '../utils/format';
import { actionLabel, ACTION_GROUPS, GROUP_HUE, MIX_ORDER, groupOf } from '../utils/activity';

/*
 * Activity Log — the super admin's record of what happened in the panel (mock
 * defense 2026-10-21; the paper's "monitor account activity logs"): sign-ins
 * and failed ones, accounts made, reset, deactivated or moved, and actions on
 * travelers. Newest first. Never holds a password.
 *
 * The band (2026-10-23) counts each kind and filters by it; the bar under the
 * counts is each kind's share of everything logged, in the same hues as the
 * tags in the table. Rows are grouped by day; a row opens the whole entry.
 */

const PAGE_SIZE = 10;
const ROLE = { superadmin: 'Super admin', admin: 'Admin', moderator: 'Moderator' };
const TZ = 'Asia/Manila';

const dayKey = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ });
function dayTitle(iso) {
  const key = dayKey(iso);
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString());
  const date = new Date(iso).toLocaleDateString('en-PH', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  return key === today ? ['Today', date] : key === yesterday ? ['Yesterday', date] : [date, ''];
}
const clock = (iso) => new Date(iso).toLocaleTimeString('en-PH', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

export default function ActivityLog() {
  const [data, setData] = useState(null);
  const [counts, setCounts] = useState(null);
  const [error, setError] = useState('');
  const [group, setGroup] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => { setSearch(query.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // New entries appear as staff work; a failed live reload keeps the page.
  const changed = useLiveTick(['activity']);
  const seen = useRef(changed);
  useEffect(() => {
    let live = true;
    const quiet = seen.current !== changed;
    seen.current = changed;
    activityAPI.get({ page, limit: PAGE_SIZE, ...(group ? { action: group } : {}), ...(search ? { q: search } : {}) })
      .then((d) => { if (live) { setData(d); setError(''); } })
      .catch(() => { if (live && !quiet) setError('Couldn’t load the activity log.'); });
    return () => { live = false; };
  }, [page, group, search, changed]);

  // Each kind's total: one small ask each.
  const loadCounts = useCallback(async () => {
    const total = (action) => activityAPI.get({ limit: 1, ...(action ? { action } : {}) }).then((d) => d.total).catch(() => null);
    const values = await Promise.all(ACTION_GROUPS.map((g) => total(g.value)));
    setCounts(Object.fromEntries(ACTION_GROUPS.map((g, i) => [g.value, values[i]])));
  }, []);
  useEffect(() => { loadCounts(); }, [loadCounts, changed]);

  const pick = (g) => { setGroup(g); setPage(1); };
  const n = (v) => (v == null ? '…' : fmtNum(v));
  const label = (g) => ACTION_GROUPS.find((x) => x.value === g)?.label || g;
  const stats = [
    { label: 'Everything', value: n(counts?.['']), hint: 'logged since the log began', onClick: () => pick(''), current: !group },
    ...MIX_ORDER.map((g) => ({
      label: label(g), hue: GROUP_HUE[g], value: n(counts?.[g]),
      hint: counts?.[''] && counts?.[g] != null ? `${Math.round((counts[g] / counts['']) * 100)}% of everything` : ' ',
      onClick: () => pick(g), current: group === g,
    })),
  ];

  const mixTotal = counts ? MIX_ORDER.reduce((sum, g) => sum + (counts[g] || 0), 0) : 0;
  const mix = counts && mixTotal > 0 && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="sa-mix" role="img"
        aria-label={`Share of everything logged: ${MIX_ORDER.map((g) => `${label(g)} ${Math.round(((counts[g] || 0) / mixTotal) * 100)}%`).join(', ')}`}>
        {MIX_ORDER.filter((g) => counts[g]).map((g) => (
          <span key={g} style={{ flexGrow: counts[g], background: `var(--k-${GROUP_HUE[g]})` }} title={`${label(g)}: ${fmtNum(counts[g])}`} />
        ))}
      </div>
    </div>
  );

  // Rows of this page under a heading for each day.
  const days = [];
  for (const e of data?.entries || []) {
    const k = dayKey(e.at);
    if (!days.length || days[days.length - 1].key !== k) days.push({ key: k, at: e.at, rows: [] });
    days[days.length - 1].rows.push(e);
  }

  return (
    <Page>
      <PageHeader
        title="Activity Log"
        stats={stats}
      >
        {mix}
      </PageHeader>

      <Toolbar>
        <span style={x.scope}>{group ? label(group) : 'Everything'}{data ? ` · ${fmtNum(data.total)} entries` : ''}</span>
        <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by username or what was done…" />
      </Toolbar>

      {error && <ErrorBanner onDismiss={() => setError('')}>{error}</ErrorBanner>}

      {!data ? <Loading label="Loading the activity log…" cols={4} />
        : data.entries.length === 0 ? <EmptyState icon="history" title="Nothing here yet" subtitle="Activity shows up as people use the console." />
          : (
            <>
              <Table
                caption="Activity log"
                head={<><Th width={110}>Time</Th><Th width={200}>Who</Th><Th width={220}>What</Th><Th>Details</Th></>}
              >
                {days.map((d) => {
                  const [title, date] = dayTitle(d.at);
                  return (
                    <Fragment key={d.key}>
                      <tr>
                        <td colSpan={4} style={x.dayRow}>
                          <strong style={{ color: t.textPrimary, marginRight: 10 }}>{title}</strong>
                          {date && <span style={{ color: t.textSecondary }}>{date}</span>}
                          <span style={x.dayCount}>{fmtNum(d.rows.length)} on this page</span>
                        </td>
                      </tr>
                      {d.rows.map((e) => {
                        const act = actionLabel(e.action);
                        const g = groupOf(e.action);
                        return (
                          <Row key={e._id} onOpen={() => setOpen(e)} label={`${act.label}, ${fmtDateTime(e.at)}`}>
                            <Td><time className="sa-mono" dateTime={e.at} title={fmtDateTime(e.at)} style={{ color: t.textSecondary }}>{clock(e.at)}</time></Td>
                            <Td>
                              {e.actor?.username
                                ? <div><div style={s.personName}>{e.actor.username}</div><div style={s.personSub}>{ROLE[e.actor.role] || e.actor.role}</div></div>
                                : <span style={s.itemDate}>Someone signing in</span>}
                            </Td>
                            <Td>
                              <span style={x.what}>
                                <span className="sa-swatch" style={{ background: `var(--s-${GROUP_HUE[g] || 'slate'})` }} aria-hidden="true" />
                                {act.label}
                              </span>
                            </Td>
                            <Td><span style={{ ...s.clampCell, maxWidth: 'none' }} title={e.summary}>{e.summary || e.target?.label || '—'}</span></Td>
                          </Row>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </Table>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={s.itemDate}>{fmtNum(data.total)} entr{data.total === 1 ? 'y' : 'ies'} · {PAGE_SIZE} a page</span>
                <Pagination page={data.page} pages={data.pages} onChange={setPage} label="Activity log pages" />
              </div>
            </>
          )}

      {open && <EntryDrawer e={open} onClose={() => setOpen(null)} />}
    </Page>
  );
}

const TARGET = { account: 'Staff account', traveler: 'Traveler', spot: 'Spot', request: 'Request', system: 'System', ticket: 'Ticket' };
const DETAIL_NAME = {
  note: 'Note', reason: 'Reason', message: 'Message shown', summary: 'What was done', fields: 'Fields changed',
  from: 'From', to: 'To', role: 'Kind of account', roles: 'Roles', municipality: 'Municipality',
  signOutMinutes: 'Signed out after (minutes)', formerClerkUserId: 'Former sign-in',
};
const detailName = (k) => DETAIL_NAME[k] || k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
const detailValue = (v) => (Array.isArray(v) ? v.join(', ') : v && typeof v === 'object' ? JSON.stringify(v) : String(v));

// One entry whole: who, when to the second, what it was about, and the
// details the server kept with it (short ones as facts, long text in full).
function EntryDrawer({ e, onClose }) {
  const act = actionLabel(e.action);
  const details = Object.entries(e.details || {}).filter(([, v]) => v != null && v !== '');
  const isLong = (v) => typeof v === 'string' && v.length > 40;
  return (
    <Drawer title={act.label} subtitle={fmtDateTime(e.at)} onClose={onClose}>
      <div style={d.stack}>
        <Facts items={[
          ['Who', e.actor?.username ? `${e.actor.username}${e.actor.role ? ` (${ROLE[e.actor.role] || e.actor.role})` : ''}` : 'Someone signing in'],
          ['Kind', ACTION_GROUPS.find((x) => x.value === groupOf(e.action))?.label || null],
          ['About', e.target?.label ? `${e.target.label}${TARGET[e.target.type] ? ` · ${TARGET[e.target.type]}` : ''}` : null],
          ['IP address', e.ip || null],
          ...details.filter(([, v]) => !isLong(v)).map(([k, v]) => [detailName(k), detailValue(v)]),
        ]} />
        {e.summary && <DetailSection title="What happened"><DetailText>{e.summary}</DetailText></DetailSection>}
        {details.filter(([, v]) => isLong(v)).map(([k, v]) => (
          <DetailSection key={k} title={detailName(k)}><DetailText>{v}</DetailText></DetailSection>
        ))}
      </div>
    </Drawer>
  );
}

const x = {
  scope:    { fontSize: 15, fontWeight: 700, color: t.textPrimary, whiteSpace: 'nowrap' },
  dayRow:   { padding: '9px 16px', background: t.sidebarBg, borderBottom: `1px solid ${t.divider}`, display: 'table-cell', fontSize: 14 },
  dayCount: { marginLeft: 12, fontSize: 13, color: t.textMuted, fontVariantNumeric: 'tabular-nums' },
  what:     { display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700, color: t.textPrimary, whiteSpace: 'nowrap' },
};

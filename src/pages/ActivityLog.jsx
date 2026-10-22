import { useEffect, useState } from 'react';
import { activityAPI } from '../api/api';
import {
  Page, PageHeader, Toolbar, SearchInput, FilterTabs, StatusPill, Table, Th, Td,
  Loading, EmptyState, ErrorBanner, pageStyles as s,
} from '../components/Layout';
import Pagination from '../components/Pagination';
import { fmtDateTime, fmtNum } from '../utils/format';
import { actionLabel, ACTION_GROUPS } from '../utils/activity';

/*
 * Activity Log — the super admin's record of what happened in the panel (mock
 * defense 2026-10-21; the paper's "monitor account activity logs"): sign-ins
 * and failed ones, accounts made, reset, deactivated or moved, and actions on
 * travelers. Newest first. Never holds a password.
 */

const PAGE_SIZE = 30;
const ROLE = { superadmin: 'Super admin', admin: 'Admin', moderator: 'Moderator' };

export default function ActivityLog() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [group, setGroup] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => { setSearch(query.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let live = true;
    activityAPI.get({ page, limit: PAGE_SIZE, ...(group ? { action: group } : {}), ...(search ? { q: search } : {}) })
      .then((d) => { if (live) { setData(d); setError(''); } })
      .catch(() => { if (live) setError('Couldn’t load the activity log.'); });
    return () => { live = false; };
  }, [page, group, search]);

  return (
    <Page wide>
      <PageHeader
        title="Activity Log"
        count={data?.total}
        subtitle="Who did what in the console, newest first: sign-ins, account changes and actions on travelers."
      />
      <Toolbar>
        <FilterTabs label="Kind of activity" value={group} onChange={(v) => { setGroup(v); setPage(1); }} options={ACTION_GROUPS} />
        <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by username or what was done…" />
      </Toolbar>

      {error && <ErrorBanner onDismiss={() => setError('')}>{error}</ErrorBanner>}

      {!data ? <Loading label="Loading the activity log…" />
        : data.entries.length === 0 ? <EmptyState icon="history" title="Nothing here yet" subtitle="Activity shows up as people use the console." />
          : (
            <>
              <Table
                caption="Activity log"
                head={<><Th>When</Th><Th>What</Th><Th>Details</Th><Th>By</Th></>}
              >
                {data.entries.map((e) => {
                  const act = actionLabel(e.action);
                  return (
                    <tr key={e._id}>
                      <Td muted style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(e.at)}</Td>
                      <Td><StatusPill tone={act.tone} icon={act.icon}>{act.label}</StatusPill></Td>
                      <Td>
                        <span style={s.clampCell} title={e.summary}>{e.summary || e.target?.label || '—'}</span>
                      </Td>
                      <Td>
                        {e.actor?.username
                          ? <div><div style={s.personName}>{e.actor.username}</div><div style={s.personSub}>{ROLE[e.actor.role] || e.actor.role}</div></div>
                          : <span style={s.itemDate}>Someone signing in</span>}
                      </Td>
                    </tr>
                  );
                })}
              </Table>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={s.itemDate}>{fmtNum(data.total)} entr{data.total === 1 ? 'y' : 'ies'}</span>
                <Pagination page={data.page} pages={data.pages} onChange={setPage} label="Activity log pages" />
              </div>
            </>
          )}
    </Page>
  );
}

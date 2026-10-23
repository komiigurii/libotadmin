import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationsAPI } from '../api/api';
import { Page, PageHeader, Button, Loading, EmptyState, ErrorBanner, Table, Th, Td } from '../components/Layout';
import Pagination from '../components/Pagination';
import { publishHeartbeat, useHeartbeat } from '../auth/heartbeat';
import { useLive } from '../api/live';
import { isAdminOnly, isSuperAdmin } from '../auth/roles';
import { theme as t } from '../theme';
import { fmtDateTime, fmtNum, timeAgo } from '../utils/format';
import { noticeKind } from '../utils/notificationKinds';

/*
 * Notifications — the bell, for every role (mock defense 2026-10-21): the
 * system going into maintenance or an update coming, changes someone made to
 * your account, and answers to the tickets you sent. The bell's dropdown in
 * the top bar shows the newest; this page is the whole list ("See all").
 */

export default function Notifications() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);

  const load = async (p = page) => {
    try {
      const d = await notificationsAPI.get({ page: p, limit: 20 });
      setData(d);
      setError('');
      publishHeartbeat({ unread: d.unread });
    } catch {
      setError('Couldn’t load your notifications.');
    }
  };
  useEffect(() => { load(page); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps
  // A new notice, or one read in another window.
  useLive(['notifications'], () => load(page));

  const open = async (n) => {
    if (!n.readAt) {
      try {
        const { unread } = await notificationsAPI.read(n._id);
        publishHeartbeat({ unread });
        setData((d) => ({ ...d, unread, notifications: d.notifications.map((x) => (x._id === n._id ? { ...x, readAt: new Date().toISOString() } : x)) }));
      } catch { /* the list still works */ }
    }
    if (n.link) navigate(n.link);
  };

  const readAll = async () => {
    try {
      await notificationsAPI.readAll();
      publishHeartbeat({ unread: 0 });
      load(page);
    } catch {
      setError('Couldn’t mark them read. Try again.');
    }
  };

  const superAdmin = isSuperAdmin();
  const admin = isAdminOnly();
  const beat = useHeartbeat();
  // Most of the super admin's bell is tickets, so the strip says how many
  // still wait (the rail's Tickets badge, from the heartbeat); an admin's,
  // how many requests wait in the Approval Queue (Spot Management's badge).
  const stats = [
    { label: 'Unread', value: data ? fmtNum(data.unread) : '…', tone: data?.unread ? 'warn' : 'good', hint: data?.unread ? 'marked with a dot below' : 'you’re up to date' },
    { label: 'All notifications', value: data ? fmtNum(data.total) : '…', hint: 'kept in your bell' },
    ...(superAdmin ? [{ label: 'Tickets waiting', hue: 'marigold', to: '/tickets', value: beat?.openTickets != null ? fmtNum(beat.openTickets) : '…', hint: 'open or being worked on' }] : []),
    ...(admin ? [{ label: 'Waiting for approval', to: '/spots/approvals', value: beat?.pendingApprovals != null ? fmtNum(beat.pendingApprovals) : '…', tone: beat?.pendingApprovals ? 'warn' : undefined, hint: 'in the Approval Queue' }] : []),
  ];

  return (
    <Page>
      <PageHeader
        title="Notifications"
        count={data?.unread || undefined}
        subtitle={superAdmin
          ? 'New tickets and password requests, locked accounts, maintenance and updates, and changes to your account.'
          : 'Maintenance and updates, changes to your account, and answers to your tickets.'}
        stats={stats}
        actions={data?.unread > 0 && <Button icon="check" onClick={readAll}>Mark all read</Button>}
      />
      {error && <ErrorBanner onDismiss={() => setError('')}>{error}</ErrorBanner>}
      {!data ? <Loading label="Loading notifications…" />
        : data.notifications.length === 0 ? <EmptyState icon="bell" title="Nothing yet" subtitle="You’ll be told here when something needs you." />
          : (
            // One dense table, a row per notice.
            <>
              <Table caption="Notifications" head={<><Th width={160}>Kind</Th><Th>Notification</Th><Th width={130}>When</Th><Th width={90} align="right" /></>}>
                {data.notifications.map((n) => {
                  const k = noticeKind(n.kind);
                  const unread = !n.readAt;
                  return (
                    <tr key={n._id} onClick={() => open(n)} style={{ cursor: 'pointer' }}>
                      <Td>
                        <span style={x.kind}>
                          <span className="sa-swatch" style={{ background: `var(--s-${k.hue})` }} aria-hidden="true" />
                          {k.label}
                        </span>
                      </Td>
                      <Td>
                        <div style={{ ...x.title, display: 'flex', alignItems: 'center', gap: 8, fontWeight: unread ? 700 : 600 }}>
                          {unread && <span style={{ ...x.dot, marginTop: 0 }} aria-hidden="true" />}
                          {unread && <span className="visually-hidden">Unread: </span>}
                          {n.title}
                        </div>
                        {n.body && <div style={{ ...x.body, marginTop: 2 }}>{n.body}</div>}
                      </Td>
                      <Td muted><span className="sa-mono" title={fmtDateTime(n.createdAt)}>{timeAgo(n.createdAt)}</span></Td>
                      <Td align="right">
                        {(n.link || unread) && (
                          <Button size="sm" onClick={(e) => { e.stopPropagation(); open(n); }} aria-label={`${n.link ? 'Open' : 'Mark read'}: ${n.title}`}>
                            {n.link ? 'Open' : 'Mark read'}
                          </Button>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </Table>
              {data.pages > 1 && <Pagination page={data.page} pages={data.pages} onChange={setPage} label="Notification pages" />}
            </>
          )}
    </Page>
  );
}

const x = {
  kind: { display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700, color: t.textPrimary, whiteSpace: 'nowrap' },
  title: { fontSize: 14, color: t.textPrimary },
  body:  { display: 'block', fontSize: 13, color: t.textSecondary, lineHeight: 1.45, marginTop: 3, overflowWrap: 'anywhere' },
  dot:   { width: 8, height: 8, borderRadius: '50%', background: t.brand, flexShrink: 0, marginTop: 6 },
};

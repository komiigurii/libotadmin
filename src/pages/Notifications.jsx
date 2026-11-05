import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationsAPI } from '../api/api';
import { Page, PageHeader, Button, Loading, EmptyState, ErrorBanner, Table, Th, Td } from '../components/Layout';
import { PAGE_SIZE, Paged } from '../components/Pagination';
import { publishHeartbeat } from '../auth/heartbeat';
import { useLive } from '../api/live';
import { theme as t } from '../theme';
import { fmtDateTime, fmtNum, timeAgo } from '../utils/format';
import { noticeKind } from '../utils/notificationKinds';

/*
 * Notifications — the bell, for every role (mock defense 2026-10-21; since
 * 2026-11-05 it holds everything): what's pending for you, every action you and
 * your team take, the system going into maintenance or an update coming, changes
 * someone made to your account, and answers to the tickets you sent. The bell's
 * dropdown in the top bar shows the newest; this page is the whole list ("See all").
 */

export default function Notifications() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);

  const load = async (p = page) => {
    try {
      const d = await notificationsAPI.get({ page: p, limit: PAGE_SIZE });
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

  // Beside the two totals, what's pending for this account right now, counted
  // live by the server; each cell opens the page to deal with it.
  const stats = [
    { label: 'Unread', value: data ? fmtNum(data.unread) : '…', tone: data?.unread ? 'warn' : 'good', hint: data?.unread ? 'marked with a dot below' : 'you’re up to date' },
    { label: 'All notifications', value: data ? fmtNum(data.total) : '…', hint: 'kept in your bell' },
    ...(data?.waiting || []).map((w) => ({ label: w.label, value: fmtNum(w.count), to: w.link, tone: 'warn', hint: 'still pending' })),
  ];

  return (
    <Page>
      <PageHeader
        title="Notifications"
        count={data?.unread || undefined}
        subtitle="What’s pending for you, every action you and your team take, maintenance and updates, and changes to your account."
        stats={stats}
        actions={data?.unread > 0 && <Button icon="check" onClick={readAll}>Mark all read</Button>}
      />
      {error && <ErrorBanner onDismiss={() => setError('')}>{error}</ErrorBanner>}
      {!data ? <Loading label="Loading notifications…" cols={4} />
        : data.notifications.length === 0 ? <EmptyState icon="bell" title="Nothing yet" subtitle="You’ll be told here when something needs you." />
          : (
            // One dense table, a row per notice.
            <Paged page={data.page} pages={data.pages} total={data.total} count={data.notifications.length} onChange={setPage} label="Notification pages">
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
            </Paged>
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

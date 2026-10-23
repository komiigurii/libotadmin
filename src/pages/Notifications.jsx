import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationsAPI } from '../api/api';
import { Page, PageHeader, Button, Loading, EmptyState, ErrorBanner, Table, Th, Td, pageStyles as s } from '../components/Layout';
import Pagination from '../components/Pagination';
import Icon from '../components/Icon';
import { publishHeartbeat, useHeartbeat } from '../auth/heartbeat';
import { useLive } from '../api/live';
import { isSuperAdmin } from '../auth/roles';
import { theme as t, radius } from '../theme';
import { fmtDateTime, fmtNum, timeAgo } from '../utils/format';

/*
 * Notifications — the bell, for every role (mock defense 2026-10-21): the
 * system going into maintenance or an update coming, changes someone made to
 * your account, and answers to the tickets you sent.
 */

// `hue`: the kind's series hue in the super admin's console (superadmin.css).
const KIND = {
  maintenance: { icon: 'tool',          label: 'System',       hue: 'violet' },
  update:      { icon: 'sparkle',       label: 'Update',       hue: 'violet' },
  account:     { icon: 'shield',        label: 'Your account', hue: 'blue' },
  ticket:      { icon: 'message-square', label: 'Ticket',      hue: 'marigold' },
  request:     { icon: 'send',          label: 'Request',      hue: 'slate' },
};

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
  const beat = useHeartbeat();
  // Most of the super admin's bell is tickets, so the strip says how many
  // still wait (the rail's Tickets badge, from the heartbeat).
  const stats = superAdmin && [
    { label: 'Unread', value: data ? fmtNum(data.unread) : '…', tone: data?.unread ? 'warn' : 'good', hint: data?.unread ? 'marked with a dot below' : 'you’re up to date' },
    { label: 'All notifications', value: data ? fmtNum(data.total) : '…', hint: 'kept in your bell' },
    { label: 'Tickets waiting', hue: 'marigold', to: '/tickets', value: beat?.openTickets != null ? fmtNum(beat.openTickets) : '…', hint: 'open or being worked on' },
  ];

  return (
    <Page>
      <PageHeader
        title="Notifications"
        count={data?.unread || undefined}
        subtitle={superAdmin
          ? 'New tickets and password requests, locked accounts, maintenance and updates, and changes to your account.'
          : 'Maintenance and updates, changes to your account, and answers to your tickets.'}
        stats={stats || undefined}
        actions={data?.unread > 0 && <Button icon="check" onClick={readAll}>Mark all read</Button>}
      />
      {error && <ErrorBanner onDismiss={() => setError('')}>{error}</ErrorBanner>}
      {!data ? <Loading label="Loading notifications…" />
        : data.notifications.length === 0 ? <EmptyState icon="bell" title="Nothing yet" subtitle="You’ll be told here when something needs you." />
          : superAdmin ? (
            // The super admin's console: one dense table, a row per notice.
            <>
              <Table caption="Notifications" head={<><Th width={160}>Kind</Th><Th>Notification</Th><Th width={130}>When</Th><Th width={90} align="right" /></>}>
                {data.notifications.map((n) => {
                  const k = KIND[n.kind] || KIND.update;
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
          ) : (
            <>
              <ul style={x.list} aria-label="Notifications">
                {data.notifications.map((n) => {
                  const k = KIND[n.kind] || KIND.update;
                  const unread = !n.readAt;
                  return (
                    <li key={n._id}>
                      <button type="button" onClick={() => open(n)} style={{ ...x.item, ...(unread ? x.itemUnread : null) }}
                        aria-label={`${unread ? 'Unread: ' : ''}${n.title}`}>
                        <span style={{ ...x.icon, ...(unread ? x.iconUnread : null) }}><Icon name={k.icon} size={15} /></span>
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={x.top}>
                            <span style={{ ...x.title, fontWeight: unread ? 700 : 600 }}>{n.title}</span>
                            <span style={s.itemDate} title={fmtDateTime(n.createdAt)}>{timeAgo(n.createdAt)}</span>
                          </span>
                          {n.body && <span style={x.body}>{n.body}</span>}
                          <span style={x.meta}>{k.label}{n.link ? ' · open' : ''}</span>
                        </span>
                        {unread && <span style={x.dot} aria-hidden="true" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {data.pages > 1 && <Pagination page={data.page} pages={data.pages} onChange={setPage} label="Notification pages" />}
            </>
          )}
    </Page>
  );
}

const x = {
  kind: { display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700, color: t.textPrimary, whiteSpace: 'nowrap' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  item: {
    display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%', textAlign: 'left', cursor: 'pointer',
    padding: '14px 16px', borderRadius: radius.lg, background: t.cardBg,
    // Longhands, so the unread edge below swaps cleanly when it's read.
    borderWidth: 1, borderStyle: 'solid', borderColor: t.border,
    fontFamily: 'inherit', color: 'inherit',
  },
  itemUnread: { borderColor: t.brand },
  icon: { width: 32, height: 32, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0, background: t.sidebarBg, color: t.textSecondary },
  iconUnread: { background: t.brandSoft, color: t.brand },
  top:   { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  title: { fontSize: 14, color: t.textPrimary },
  body:  { display: 'block', fontSize: 13, color: t.textSecondary, lineHeight: 1.45, marginTop: 3, overflowWrap: 'anywhere' },
  meta:  { display: 'block', fontSize: 12, color: t.textMuted, marginTop: 5 },
  dot:   { width: 8, height: 8, borderRadius: '50%', background: t.brand, flexShrink: 0, marginTop: 6 },
};

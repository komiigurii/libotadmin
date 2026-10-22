import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationsAPI } from '../api/api';
import { Page, PageHeader, Button, Loading, EmptyState, ErrorBanner, pageStyles as s } from '../components/Layout';
import Pagination from '../components/Pagination';
import Icon from '../components/Icon';
import { publishHeartbeat } from '../auth/heartbeat';
import { theme as t, radius } from '../theme';
import { fmtDateTime, timeAgo } from '../utils/format';

/*
 * Notifications — the bell, for every role (mock defense 2026-10-21): the
 * system going into maintenance or an update coming, changes someone made to
 * your account, and answers to the tickets you sent.
 */

const KIND = {
  maintenance: { icon: 'tool',          label: 'System' },
  update:      { icon: 'sparkle',       label: 'Update' },
  account:     { icon: 'shield',        label: 'Your account' },
  ticket:      { icon: 'message-square', label: 'Ticket' },
  request:     { icon: 'send',          label: 'Request' },
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

  return (
    <Page>
      <PageHeader
        title="Notifications"
        count={data?.unread || undefined}
        subtitle="Maintenance and updates, changes to your account, and answers to your tickets."
        actions={data?.unread > 0 && <Button icon="check" onClick={readAll}>Mark all read</Button>}
      />
      {error && <ErrorBanner onDismiss={() => setError('')}>{error}</ErrorBanner>}
      {!data ? <Loading label="Loading notifications…" />
        : data.notifications.length === 0 ? <EmptyState icon="bell" title="Nothing yet" subtitle="You’ll be told here when something needs you." />
          : (
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

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { systemAPI, ticketsAPI, accountsAPI, activityAPI } from '../api/api';
import { Page, PageHeader, Card, ErrorBanner, Stat, Button, StatusPill, pageStyles } from '../components/Layout';
import UsageCharts from '../components/UsageCharts';
import Icon from '../components/Icon';
import { theme as t, radius, type } from '../theme';
import { fmtNum as fmt, plural, timeAgo } from '../utils/format';
import { actionLabel } from '../utils/activity';

/*
 * The super admin's dashboard. The super admin's console holds only the super
 * admin's own work (the user, 2026-10-22: "superadmin panel should only
 * contain superadmin functions") — the system, the staff's tickets and
 * accounts, the activity log — so this shows those, not spots or reviews:
 * the system's state, what's waiting on them, the staff accounts, what was
 * done lately, and how the app is used.
 */

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

async function load() {
  const [system, tickets, staff, travelers, activity, locked] = await Promise.allSettled([
    systemAPI.get(),
    ticketsAPI.list({ limit: 5, status: 'open' }),
    accountsAPI.getStaff(),
    accountsAPI.getTravelers({ limit: 1 }),
    activityAPI.get({ limit: 6 }),
    systemAPI.locked(),
  ]);
  const val = (r) => (r.status === 'fulfilled' ? r.value : null);
  return {
    system: val(system),
    tickets: val(tickets),
    staff: val(staff)?.accounts || null,
    travelers: val(travelers),
    activity: val(activity)?.entries || null,
    locked: val(locked),
    failed: [
      !val(system) && 'the system’s state',
      !val(tickets) && 'tickets',
      !val(staff) && 'staff accounts',
      !val(travelers) && 'travelers',
      !val(activity) && 'the activity log',
    ].filter(Boolean),
  };
}

export default function SuperAdminDashboard() {
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setData(await load());
    setRefreshing(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const loading = data === null;
  const sys = data?.system;
  const staff = data?.staff;
  const mods = staff?.filter((a) => a.role === 'moderator') || [];
  const admins = staff?.filter((a) => a.role === 'admin') || [];
  const onSlip = staff?.filter((a) => a.status === 'firstSignIn' || a.status === 'slipExpired').length ?? null;
  const openTickets = data?.tickets?.open ?? null;
  const passwordRequests = data?.tickets?.tickets?.filter((tk) => tk.category === 'passwordReset').length || 0;
  const reveal = (i) => ({ animationDelay: `${i * 70}ms` });

  const attention = [
    sys?.maintenance?.on && { icon: 'tool', label: 'Maintenance is on', detail: 'Travelers can’t use the app. End it when the work is done.', to: '/system', tone: 'warning', count: null },
    sys?.restrictedRoles?.length > 0 && { icon: 'pause', label: `${sys.restrictedRoles.map((r) => (r === 'admin' ? 'Admins' : 'Moderators')).join(' and ')} paused`, detail: 'They can’t use the console until you let them back in.', to: '/system', tone: 'warning', count: null },
    { icon: 'flag', label: 'Open tickets', detail: passwordRequests ? `${plural(passwordRequests, 'password request')} among them` : 'Problems admins and moderators reported', to: '/tickets', count: openTickets },
    { icon: 'lock', label: 'Locked accounts', detail: 'Too many wrong passwords', to: '/system', count: data?.locked ? data.locked.length : null },
    { icon: 'key', label: 'Waiting for a first sign-in', detail: 'Accounts still on their slip’s temporary password', to: '/accounts', count: onSlip },
  ].filter(Boolean);

  return (
    <Page>
      <div className="dash-reveal" style={reveal(0)}>
        <PageHeader
          title="Dashboard"
          subtitle={`${greeting()}. The system’s state, what’s waiting on you, the staff accounts, and how the app is used.`}
          actions={<Button icon="refresh-cw" onClick={refresh} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh'}</Button>}
        />
      </div>

      {data?.failed?.length > 0 && <ErrorBanner>Couldn’t load {data.failed.join(', ')}. Everything else below is current.</ErrorBanner>}

      <section aria-label="Key figures" className="dash-reveal"
        style={{ ...s.statGrid, ...reveal(1), opacity: refreshing && !loading ? 0.6 : 1, transition: 'opacity 0.2s' }}>
        <Stat label="System" to="/system" emphasis={sys?.maintenance?.on}
          value={loading ? '…' : !sys ? '—' : sys.maintenance.on ? 'Maintenance' : 'Open'}
          hint={sys?.maintenance?.on ? `since ${timeAgo(sys.maintenance.startedAt)}` : 'app, website and console'} />
        <Stat label="Open tickets" to="/tickets" emphasis={openTickets > 0} value={loading ? '…' : fmt(openTickets)}
          hint="from admins and moderators" />
        <Stat label="Staff accounts" to="/accounts" value={loading ? '…' : staff ? fmt(admins.length + mods.length) : '—'}
          hint={staff ? `${plural(admins.length, 'admin')} · ${plural(mods.length, 'moderator')}` : null} />
        <Stat label="Travelers" to="/accounts" value={loading ? '…' : fmt(data?.travelers?.total)}
          hint="every traveler account" />
      </section>

      <div className="dash-split" style={s.split}>
        <div className="dash-reveal" style={reveal(2)}>
          <Card style={s.card}>
            <h2 style={s.cardTitle}>Needs your attention</h2>
            <ul style={s.list}>
              {attention.map((r) => (
                <li key={r.label}>
                  <Link to={r.to} className="dash-link" style={s.row}>
                    <span style={{ ...s.rowIcon, ...(r.tone === 'warning' ? s.rowIconWarn : null) }}><Icon name={r.icon} size={16} /></span>
                    <span style={s.rowText}>
                      <span style={s.rowLabel}>{r.label}</span>
                      <span style={s.rowDetail}>{r.detail}</span>
                    </span>
                    {r.count === null ? (r.tone ? <StatusPill tone="warning" icon="alert-triangle">Now</StatusPill> : null)
                      : loading ? <span style={s.muted}>…</span>
                        : r.count === 0 ? <span style={s.clear}><Icon name="check" size={11} weight="bold" /> Clear</span>
                          : <span style={s.badge}>{fmt(r.count)}</span>}
                    <span className="dash-chevron" style={s.chevron}><Icon name="chevron-right" size={13} /></span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <div className="dash-reveal" style={reveal(3)}>
          <Card style={s.card}>
            <h2 style={s.cardTitle}>Quick actions</h2>
            <div style={s.actions}>
              {[
                { icon: 'plus', label: 'Make an account', to: '/accounts' },
                { icon: 'tool', label: 'Maintenance', to: '/system' },
                { icon: 'send', label: 'Update notice', to: '/system' },
                { icon: 'refresh-cw', label: 'Clear cache', to: '/system' },
              ].map((a) => (
                <Link key={a.label} to={a.to} className="dash-action" style={s.action}>
                  <Icon name={a.icon} size={15} color={t.brand} />
                  <span>{a.label}</span>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div className="dash-reveal" style={reveal(4)}>
        <UsageCharts />
      </div>

      <div className="dash-reveal" style={reveal(5)}>
        <Card style={s.card}>
          <div style={s.cardHead}>
            <h2 style={s.cardTitle}>Recent activity</h2>
            <Link to="/activity" style={s.cardLink}>Activity Log <Icon name="chevron-right" size={12} /></Link>
          </div>
          {loading ? <p style={s.muted}>Loading…</p>
            : !data.activity ? <p style={s.muted}>Couldn’t load the activity log.</p>
              : data.activity.length === 0 ? <p style={s.muted}>Nothing yet.</p>
                : (
                  <ul style={s.list}>
                    {data.activity.map((e) => {
                      const a = actionLabel(e.action);
                      return (
                        <li key={e._id} style={s.row}>
                          <span style={s.rowIcon}><Icon name={a.icon} size={15} /></span>
                          <span style={s.rowText}>
                            <span style={s.rowLabel}>{e.summary || a.label}</span>
                            <span style={s.rowDetail}>{e.actor?.username || 'Someone signing in'} · {timeAgo(e.at)}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
        </Card>
      </div>
    </Page>
  );
}

const s = {
  ...pageStyles,
  split: { display: 'grid', gridTemplateColumns: 'minmax(0, 1.55fr) minmax(0, 1fr)', gap: 18, alignItems: 'start' },
  card: { padding: 18 },
  cardHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 },
  cardTitle: { ...type.cardTitle, color: t.textPrimary, margin: '0 0 12px' },
  cardLink: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, fontWeight: 600, color: t.brand, textDecoration: 'none', whiteSpace: 'nowrap' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  row: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px', margin: '0 -10px', borderRadius: radius.md, color: 'inherit', textDecoration: 'none' },
  rowIcon: { width: 34, height: 34, borderRadius: radius.md, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.sidebarBg, color: t.textSecondary },
  rowIconWarn: { background: t.warningBg, color: t.warning },
  rowText: { display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 },
  rowLabel: { fontSize: 13.5, fontWeight: 600, color: t.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rowDetail: { fontSize: 12, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  chevron: { display: 'inline-flex', flexShrink: 0, color: t.textMuted },
  badge: { flexShrink: 0, fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: radius.pill, background: t.accentBg, color: t.textPrimary, border: `1px solid ${t.accent}` },
  clear: { flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: t.success },
  muted: { fontSize: 13, color: t.textMuted, margin: 0 },
  actions: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 },
  action: {
    display: 'flex', alignItems: 'center', gap: 9, padding: '11px 12px', borderRadius: radius.md,
    border: `1px solid ${t.border}`, background: t.sidebarBg, color: t.textPrimary,
    fontSize: 13, fontWeight: 600, textDecoration: 'none',
  },
};

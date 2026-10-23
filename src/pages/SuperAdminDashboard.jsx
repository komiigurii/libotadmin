import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { systemAPI, ticketsAPI, accountsAPI, activityAPI } from '../api/api';
import { Page, PageHeader, ErrorBanner, StatusPill } from '../components/Layout';
import UsageCharts from '../components/UsageCharts';
import Icon from '../components/Icon';
import { fmtNum as fmt, plural, timeAgo, fmtDateTime } from '../utils/format';
import { actionLabel, groupOf, GROUP_HUE } from '../utils/activity';
import { loadUsage, forgetUsage } from '../utils/usage';
import { useHealthSamples, pingVerdict, uptimeText, EVERY_MS } from '../utils/healthSamples';
import { useLive } from '../api/live';

/*
 * The super admin's dashboard. The super admin's console holds only the super
 * admin's own work (the user, 2026-10-22: "superadmin panel should only
 * contain superadmin functions"), so this shows those, not spots or reviews.
 *
 * Laid out from the user's reference console (2026-10-23): the band with a
 * stat strip, then two columns that fill the width. Left: what needs you, how
 * the app is used, what was done lately. Right: the server's health sampled
 * live, who on the staff signed in, and the everyday actions.
 *
 * Every figure is one the backend returns. The sparks in the strip are the
 * usage series (last 30 days); no other stat gets a trend it doesn't have.
 */

async function load() {
  const [system, tickets, staff, travelers, activity, locked, usage] = await Promise.allSettled([
    systemAPI.get(),
    ticketsAPI.list({ limit: 20, status: 'open' }),
    accountsAPI.getStaff(),
    accountsAPI.getTravelers({ limit: 1 }),
    activityAPI.get({ limit: 9 }),
    systemAPI.locked(),
    loadUsage(30),
  ]);
  const val = (r) => (r.status === 'fulfilled' ? r.value : null);
  return {
    at: new Date(),
    system: val(system),
    tickets: val(tickets),
    staff: val(staff)?.accounts || null,
    travelers: val(travelers),
    activity: val(activity)?.entries || null,
    locked: val(locked),
    usage: val(usage),
    failed: [
      !val(system) && 'the system’s state',
      !val(tickets) && 'tickets',
      !val(staff) && 'staff accounts',
      !val(travelers) && 'travelers',
      !val(activity) && 'the activity log',
      !val(usage) && 'the usage figures',
    ].filter(Boolean),
  };
}

const sum = (pts) => (pts || []).reduce((n, p) => n + p.count, 0);
const counts = (pts) => (pts || []).map((p) => p.count);

export default function SuperAdminDashboard() {
  const [data, setData] = useState(null);
  const health = useHealthSamples();

  const refresh = useCallback(async () => { setData(await load()); }, []);
  useEffect(() => { refresh(); }, [refresh]);
  // Live updates, no Refresh button. Seven requests a time, so at most every
  // 5 s however busy it gets.
  useLive(['system', 'tickets', 'staff', 'travelers', 'activity', 'progress', 'reviews'], () => { forgetUsage(); refresh(); }, { gap: 5000 });

  const loading = data === null;
  const sys = data?.system;
  const staff = data?.staff;
  const mods = staff?.filter((a) => a.role === 'moderator') || [];
  const admins = staff?.filter((a) => a.role === 'admin') || [];
  const onSlip = staff ? staff.filter((a) => a.status === 'firstSignIn' || a.status === 'slipExpired').length : null;
  // Waiting = not resolved yet, the same count as the rail's Tickets badge:
  // the backend's `open` (open + being worked on). `total` is this list's
  // filter, status open only, as the Tickets page's Open counts them.
  const waitingTickets = data?.tickets?.open ?? null;
  const openOnly = data?.tickets?.total ?? null;
  const ticketsHint = data?.tickets ? `${fmt(openOnly)} open · ${fmt(Math.max(0, waitingTickets - openOnly))} being worked on` : null;
  const passwordRequests = data?.tickets?.tickets?.filter((tk) => tk.category === 'passwordReset').length || 0;
  const lockedCount = data?.locked ? data.locked.accounts.length : null;
  const series = data?.usage?.series;
  const activeToday = series?.active?.length ? series.active[series.active.length - 1].count : null;

  const attention = [
    sys?.maintenance?.on && { icon: 'tool', label: 'Maintenance is on', detail: `Since ${timeAgo(sys.maintenance.startedAt)}. Admins and moderators can’t save. End it when the work is done.`, to: '/system', tone: 'warning', count: null },
    sys?.restrictedRoles?.length > 0 && { icon: 'pause', label: `${sys.restrictedRoles.map((r) => (r === 'admin' ? 'Admins' : 'Moderators')).join(' and ')} paused`, detail: 'They can’t use the console until you let them back in.', to: '/system', tone: 'warning', count: null },
    { icon: 'flag', hue: 'marigold', label: 'Tickets waiting', detail: ticketsHint ? `${ticketsHint}${passwordRequests ? `, ${plural(passwordRequests, 'password request')}` : ''}` : 'Problems admins and moderators reported', to: '/tickets', count: waitingTickets },
    { icon: 'lock', hue: 'blue', label: 'Locked accounts', detail: 'Staff and travelers with too many wrong passwords; unlock on the System page', to: '/system#tools', count: lockedCount },
    { icon: 'key', hue: 'blue', label: 'Waiting for a first sign-in', detail: 'Accounts still on their slip’s temporary password', to: '/accounts?status=firstSignIn', count: onSlip },
  ].filter(Boolean);
  const waiting = loading ? null
    : (waitingTickets || 0) + (lockedCount || 0) + (onSlip || 0) + (sys?.maintenance?.on ? 1 : 0) + (sys?.restrictedRoles?.length || 0);

  const stats = [
    { label: 'Needs attention', value: loading ? '…' : fmt(waiting), tone: waiting ? 'warn' : 'good',
      hint: loading ? null : waiting ? attention.filter((r) => r.count || r.count === null).map((r) => r.label.toLowerCase()).slice(0, 2).join(' · ') : 'Nothing waiting on you' },
    { label: 'Tickets waiting', hue: 'marigold', to: '/tickets', value: loading ? '…' : fmt(waitingTickets),
      hint: ticketsHint || 'from admins and moderators' },
    { label: 'Staff accounts', hue: 'blue', to: '/accounts', value: loading ? '…' : staff ? fmt(admins.length + mods.length) : '—',
      hint: staff ? `${plural(admins.length, 'admin')} · ${plural(mods.length, 'moderator')}` : null },
    { label: 'Travelers', hue: 'teal', to: '/accounts?view=travelers', value: loading ? '…' : fmt(data?.travelers?.total),
      hint: activeToday != null ? `${fmt(activeToday)} using the app today` : 'every traveler account', spark: counts(series?.active) },
    { label: 'Spot arrivals', hue: 'magenta', value: loading ? '…' : series ? fmt(sum(series.arrivals)) : '—',
      hint: 'in the last 30 days', spark: counts(series?.arrivals) },
    { label: 'Reviews', hue: 'orange', value: loading ? '…' : series ? fmt(sum(series.reviews)) : '—',
      hint: 'in the last 30 days', spark: counts(series?.reviews) },
  ];

  const lastPing = health.samples[health.samples.length - 1];
  const live = (
    <>
      <span>Refreshed <b className="sa-mono">{data ? fmtDateTime(data.at) : '…'}</b></span>
      {lastPing?.ok && <span>Database <b className="sa-mono">{lastPing.pingMs} ms</b></span>}
      {health.latest && <span>Server up <b className="sa-mono">{uptimeText(health.latest.uptimeSeconds)}</b></span>}
      <span>{sys?.maintenance?.on ? 'Maintenance is on' : 'App, website and console open'}</span>
    </>
  );

  return (
    <Page>
      <PageHeader
        title="Dashboard"
        live={live}
        stats={stats}
      />

      {data?.failed?.length > 0 && <ErrorBanner>Couldn’t load {data.failed.join(', ')}. Everything else is current.</ErrorBanner>}

      <div className="sa-grid sa-split sa-dash">
        <div className="sa-col">
          <section className="sa-panel sa-o-attention" aria-labelledby="dash-attention">
            <div className="sa-panel-head dark">
              <h2 id="dash-attention" className="sa-panel-title">Needs your attention</h2>
              <span className="sa-panel-meta">{loading ? '…' : waiting ? `${fmt(waiting)} waiting` : 'All clear'}</span>
            </div>
            <ul style={d.list}>
              {attention.map((r) => (
                <li key={r.label} style={d.li}>
                  <Link to={r.to} className="dash-link" style={d.row}>
                    <span style={{ ...d.rowIcon, ...(r.tone === 'warning' ? d.rowIconWarn : null) }}>
                      <Icon name={r.icon} size={17} />
                    </span>
                    <span style={d.rowText}>
                      <span style={d.rowLabel}>
                        {r.hue && <span className="sa-swatch" style={{ background: `var(--s-${r.hue})` }} aria-hidden="true" />}
                        {r.label}
                      </span>
                      <span style={d.rowDetail}>{r.detail}</span>
                    </span>
                    {r.count === null ? <StatusPill tone="warning" icon="alert-triangle">Now</StatusPill>
                      : loading ? <span style={d.muted}>…</span>
                        : r.count === 0 ? <span style={d.clear}><Icon name="check" size={12} weight="bold" /> Clear</span>
                          : <span style={d.badge}>{fmt(r.count)}</span>}
                    <span className="dash-chevron" style={d.chevron}><Icon name="chevron-right" size={14} /></span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <div className="sa-usage sa-o-usage"><UsageCharts /></div>

          <section className="sa-panel sa-o-activity" aria-labelledby="dash-activity">
            <div className="sa-panel-head dark">
              <h2 id="dash-activity" className="sa-panel-title">Recent activity</h2>
              <Link to="/activity">Activity Log <Icon name="chevron-right" size={13} /></Link>
            </div>
            {loading ? <p style={d.pad}>Loading…</p>
              : !data.activity ? <p style={d.pad}>Couldn’t load the activity log.</p>
                : data.activity.length === 0 ? <p style={d.pad}>Nothing yet.</p>
                  : (
                    <ol style={d.list} aria-label="Latest entries">
                      {data.activity.map((e) => {
                        const a = actionLabel(e.action);
                        const g = groupOf(e.action);
                        return (
                          <li key={e._id} className="sa-act-row">
                            <time className="sa-mono sa-act-time" dateTime={e.at} style={d.actTime} title={fmtDateTime(e.at)}>{timeAgo(e.at)}</time>
                            <span className="sa-act-what" style={d.actTag}>
                              <span className="sa-swatch" style={{ background: `var(--s-${GROUP_HUE[g] || 'slate'})` }} aria-hidden="true" />
                              {a.label}
                            </span>
                            <span className="sa-act-text">{e.summary || e.target?.label || '—'}</span>
                            <span className="sa-act-who">{e.actor?.username || 'Someone signing in'}</span>
                          </li>
                        );
                      })}
                    </ol>
                  )}
          </section>
        </div>

        <div className="sa-col">
          <HealthPanel health={health} maintenanceOn={!!sys?.maintenance?.on} />
          <StaffPanel staff={staff} loading={loading} />
          <SystemNotes sys={sys} loading={loading} />
          <section className="sa-panel" aria-labelledby="dash-actions">
            <div className="sa-panel-head"><h2 id="dash-actions" className="sa-panel-title">Quick actions</h2></div>
            <div style={d.actions}>
              {[
                { icon: 'user-plus', label: 'Add an account', to: '/accounts?add=1' },
                { icon: 'tool', label: 'Maintenance', to: '/system#maintenance' },
                { icon: 'send', label: 'Update notice', to: '/system#notices' },
                { icon: 'refresh-cw', label: 'Clear cache', to: '/system#tools' },
              ].map((a) => (
                <Link key={a.label} to={a.to} className="dash-action" style={d.action}>
                  <Icon name={a.icon} size={17} color="var(--brand)" />
                  <span>{a.label}</span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </Page>
  );
}

// ── The server's health, live ─────────────────────────────────────────────

function HealthPanel({ health, maintenanceOn }) {
  const { samples, latest, error } = health;
  const last = samples[samples.length - 1];
  const verdict = pingVerdict(last);
  const good = samples.filter((x) => x.ok && x.pingMs != null).map((x) => x.pingMs);
  const avg = good.length ? Math.round(good.reduce((a, b) => a + b, 0) / good.length) : null;
  const max = good.length ? Math.max(...good) : null;
  return (
    <section className="sa-panel sa-o-health" aria-labelledby="dash-health">
      <div className="sa-panel-head dark">
        <h2 id="dash-health" className="sa-panel-title">System health</h2>
        <span className="sa-panel-meta sa-mono">every {EVERY_MS / 1000} s</span>
      </div>
      <div style={d.healthTop}>
        <div style={{ minWidth: 0 }}>
          <div style={d.healthLabel}><Icon name="database" size={16} /> Database ping</div>
          <div style={{ marginTop: 6 }}><StatusPill tone={verdict.tone} icon={verdict.icon}>{verdict.word}</StatusPill></div>
        </div>
        <div style={d.bigNum}>
          {last?.ok && last.pingMs != null ? <>{last.pingMs}<span style={d.unit}>ms</span></> : '—'}
        </div>
      </div>
      <PingChart samples={samples} />
      <div style={d.healthFoot}>
        <span>This session, {plural(samples.length, 'check')}</span>
        <span className="sa-mono">{avg != null ? `avg ${avg} ms · max ${max} ms` : error || 'waiting for the first answer'}</span>
      </div>
      <dl style={d.facts}>
        <div style={d.fact}><dt style={d.factK}><Icon name="timer" size={15} /> Server up</dt><dd style={d.factV} className="sa-mono">{latest ? uptimeText(latest.uptimeSeconds) : '…'}</dd></div>
        <div style={d.fact}><dt style={d.factK}><Icon name="cpu" size={15} /> Memory</dt><dd style={d.factV} className="sa-mono">{latest ? `${latest.memoryMb.rss} MB` : '…'}</dd></div>
        <div style={d.fact}><dt style={d.factK}><Icon name="git-commit" size={15} /> Version</dt><dd style={d.factV} className="sa-mono">{latest ? latest.commit || 'local build' : '…'}</dd></div>
        <div style={d.fact}>
          <dt style={d.factK}><Icon name="tool" size={15} /> Maintenance</dt>
          <dd style={d.factV}>{maintenanceOn ? <StatusPill tone="warning" icon="tool">On</StatusPill> : <StatusPill tone="success" icon="check">Off</StatusPill>}</dd>
        </div>
      </dl>
    </section>
  );
}

// One slot per check, newest on the right, each slot a fixed 12 px however
// wide the panel is; slots not filled yet are faint ticks, so early in a
// session the chart reads as filling up, not as broken. A check the server
// didn't answer is a red notch. The dashed line is where "Quick" turns "Slow".
const SLOT = 12;
const PING_H = 64;

function PingChart({ samples }) {
  const ref = useRef(null);
  const [W, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setW(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = PING_H;
  const slots = Math.max(10, Math.floor(W / SLOT));
  const shown = samples.slice(-slots);
  const top = Math.max(250, ...shown.map((x) => x.pingMs || 0));
  const bar = SLOT - 4;
  const y = (v) => H - (v / top) * H;
  const label = shown.length
    ? `Database ping for the last ${plural(shown.length, 'check')}: ${shown.map((x) => (x.ok && x.pingMs != null ? `${x.pingMs} ms` : 'no answer')).join(', ')}`
    : 'No checks yet';
  return (
    <div ref={ref} style={{ margin: '4px 16px 0' }}>
      {W > 0 && (
        <svg width={W} height={H + 2} role="img" aria-label={label} style={{ display: 'block' }}>
          <line x1="0" x2={W} y1={y(200)} y2={y(200)} stroke="var(--warning)" strokeWidth="1" strokeDasharray="3 4" opacity="0.7" />
          {Array.from({ length: slots }, (_, i) => {
            const x = W - (slots - i) * SLOT + 2;
            const s = shown[i - (slots - shown.length)];
            if (!s) return <rect key={`e${i}`} x={x} y={H - 2} width={bar} height={2} rx="1" fill="var(--border)" />;
            if (!s.ok || s.pingMs == null) return <rect key={s.at} x={x} y={H - 6} width={bar} height={6} rx="1" fill="var(--danger)" />;
            const h = Math.max(2, H - y(s.pingMs));
            return <rect key={s.at} x={x} y={H - h} width={bar} height={h} rx="2" fill="var(--s-violet)" />;
          })}
        </svg>
      )}
    </div>
  );
}

// ── The notice travelers see, and the last maintenance ──────────────────────

function SystemNotes({ sys, loading }) {
  const n = sys?.notice;
  const m = sys?.lastMaintenance;
  return (
    <section className="sa-panel" aria-labelledby="dash-notes">
      <div className="sa-panel-head">
        <h2 id="dash-notes" className="sa-panel-title">
          <span className="sa-swatch" style={{ background: 'var(--s-violet)' }} aria-hidden="true" />
          From the System page
        </h2>
        <Link to="/system" className="sa-panel-link">System Maintenance <Icon name="chevron-right" size={13} /></Link>
      </div>
      {loading ? <p style={d.pad}>Loading…</p> : !sys ? <p style={d.pad}>Couldn’t load the system’s state.</p> : (
        <dl style={d.facts}>
          <div style={d.note}>
            <dt style={d.noteK}>Update notice showing</dt>
            <dd style={d.noteV}>
              {n ? <><strong>{n.title}</strong><span style={d.noteSub}>{n.kind === 'scheduled' ? <>Coming <span className="sa-mono">{fmtDateTime(n.at)}</span></> : 'Done'} · in the app and on staff dashboards</span></>
                : <span style={d.noteSub}>None. Travelers see no notice.</span>}
            </dd>
          </div>
          <div style={{ ...d.note, borderBottom: 'none' }}>
            <dt style={d.noteK}>Last maintenance</dt>
            <dd style={d.noteV}>
              {m ? <><strong>Ended <span className="sa-mono">{timeAgo(m.endedAt)}</span></strong><span style={d.noteSub}>{m.summary}</span></>
                : <span style={d.noteSub}>None yet.</span>}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}

// ── Staff sign-ins ────────────────────────────────────────────────────────

const STAFF_SHOWN = 6;

function StaffPanel({ staff, loading }) {
  const rows = useMemo(() => (staff || [])
    .filter((a) => a.role !== 'superadmin')
    .sort((a, b) => new Date(b.lastLoginAt || 0) - new Date(a.lastLoginAt || 0))
    .slice(0, STAFF_SHOWN), [staff]);
  return (
    <section className="sa-panel" aria-labelledby="dash-staff">
      <div className="sa-panel-head dark">
        <h2 id="dash-staff" className="sa-panel-title">Staff sign-ins</h2>
        <Link to="/accounts">Account Management <Icon name="chevron-right" size={13} /></Link>
      </div>
      {loading ? <p style={d.pad}>Loading…</p>
        : !staff ? <p style={d.pad}>Couldn’t load the staff accounts.</p>
          : rows.length === 0 ? <p style={d.pad}>No admin or moderator accounts yet.</p>
            : (
              <ul style={d.list}>
                {rows.map((a) => (
                  <li key={a.id} style={d.staffRow}>
                    <span style={d.staffAvatar} aria-hidden="true">{a.username.charAt(0).toUpperCase()}</span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={d.staffName}>{a.username}</span>
                      <span style={d.staffSub}>{a.lastLoginAt ? <>Signed in <span className="sa-mono">{timeAgo(a.lastLoginAt)}</span></> : 'Never signed in'}</span>
                    </span>
                    <span className="sa-role">
                      <Icon name={a.role === 'moderator' ? 'map-pin' : 'shield'} size={13} />
                      {a.role === 'moderator' ? (a.municipality || 'No town') : 'Admin'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
    </section>
  );
}

const d = {
  list:     { listStyle: 'none', margin: 0, padding: 0 },
  li:       { borderBottom: '1px solid var(--divider)' },
  row:      { display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', color: 'inherit', textDecoration: 'none' },
  rowIcon:  { width: 36, height: 36, borderRadius: 10, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'var(--sidebar-bg)', color: 'var(--text-secondary)', border: '1px solid var(--divider)' },
  rowIconWarn: { background: 'var(--warning-bg)', color: 'var(--warning)', borderColor: 'transparent' },
  rowText:  { display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 },
  rowLabel: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' },
  rowDetail: { fontSize: 14.5, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  chevron:  { display: 'inline-flex', flexShrink: 0, color: 'var(--text-muted)' },
  badge:    { flexShrink: 0, minWidth: 30, textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 19, lineHeight: 1, padding: '5px 10px 4px', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)' },
  clear:    { flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 15, fontWeight: 700, color: 'var(--success)' },
  muted:    { fontSize: 15, color: 'var(--text-muted)' },
  pad:      { margin: 0, padding: '14px 16px', fontSize: 15, color: 'var(--text-muted)' },

  actTime:  { color: 'var(--text-muted)', whiteSpace: 'nowrap' },
  actTag:   { display: 'inline-flex', alignItems: 'center', gap: 7, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },

  healthTop:  { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '14px 16px 6px' },
  healthLabel: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' },
  bigNum:     { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 40, lineHeight: 1, color: 'var(--text-primary)', whiteSpace: 'nowrap' },
  unit:       { fontFamily: 'var(--font-sans)', fontSize: 18, color: 'var(--text-muted)', marginLeft: 3 },
  healthFoot: { display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '6px 16px 12px', fontSize: 14, color: 'var(--text-muted)', borderBottom: '1px solid var(--divider)' },
  facts:      { margin: 0, padding: 0 },
  fact:       { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '9px 16px', borderBottom: '1px solid var(--divider)' },
  factK:      { display: 'flex', alignItems: 'center', gap: 7, fontSize: 15.5, color: 'var(--text-secondary)' },
  factV:      { margin: 0, color: 'var(--text-primary)', textAlign: 'right' },

  staffRow:   { display: 'flex', alignItems: 'center', gap: 11, padding: '9px 16px', borderBottom: '1px solid var(--divider)' },
  staffAvatar: { width: 32, height: 32, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', background: 'var(--s-blue-soft)', color: 'var(--text-primary)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15 },
  staffName:  { display: 'block', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  staffSub:   { display: 'block', fontSize: 14, color: 'var(--text-muted)' },

  note:       { padding: '11px 16px', borderBottom: '1px solid var(--divider)' },
  noteK:      { fontSize: 14, color: 'var(--text-muted)' },
  noteV:      { margin: '2px 0 0', fontSize: 16, color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', gap: 1 },
  noteSub:    { fontSize: 14.5, color: 'var(--text-secondary)', lineHeight: 1.35 },

  // Two across when the side column is wide enough, one when it isn't (tablet).
  actions:    { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, padding: 12 },
  action:     { display: 'flex', alignItems: 'center', gap: 9, padding: '11px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--sidebar-bg)', color: 'var(--text-primary)', fontSize: 16, fontWeight: 700, textDecoration: 'none' },
};

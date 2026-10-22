import { useCallback, useEffect, useId, useState } from 'react';
import { systemAPI } from '../api/api';
import {
  Page, PageHeader, Button, StatusPill, Table, Th, Td, Loading, EmptyState, ErrorBanner, FilterTabs,
  pageStyles as s,
} from '../components/Layout';
import Pagination from '../components/Pagination';
import { notify, confirmAction, promptAction } from '../components/AppAlert';
import Icon from '../components/Icon';
import { publishHeartbeat } from '../auth/heartbeat';
import { theme as t, radius, type, fonts } from '../theme';
import { fmtDateTime, timeAgo } from '../utils/format';

/*
 * System — the super admin's control page (mock defense 2026-10-21; the
 * paper's "System Maintenance: start now, restrict users, logs and summaries"
 * and "System Update").
 *
 * It began as the System Console screen a teammate drew (Charles, 2026-10-22):
 * a status row, maintenance on and off with its message, and switches that
 * lock admins or moderators out. Those are all here, now wired to the server
 * (routes/system.js), inside the console instead of on a page of their own,
 * because the super admin can do everything an admin can as well.
 *
 *   Maintenance     the app shows "Under maintenance" and refuses travelers;
 *                   admins and moderators can look but not save, and are told
 *                   in their bell. Ending it asks what was done, for the log.
 *   Access          pause admins or moderators without a full maintenance.
 *   Update notices  "an update is coming" / "an update is done", shown in the
 *                   app and on everyone's dashboard for two weeks.
 *   Tools           clear the server's cache, its health, locked accounts.
 *   Maintenance log every window, who started and ended it, and the summary.
 */

const toLocalInput = (d) => {
  if (!d) return '';
  const x = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
};
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);
const errorOf = (err) => err?.response?.data?.message || 'Couldn’t reach the server. Try again.';

function minutesText(total) {
  const mins = Math.max(1, total);
  if (mins < 60) return `${mins} min`;
  if (mins >= 2880) return `${Math.round(mins / 1440)} days`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
const duration = (from, to) => minutesText(Math.round((new Date(to) - new Date(from)) / 60000));

export default function System() {
  const [state, setState] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await systemAPI.get();
      setState(data);
      setError('');
      // The banner and the rail follow at once, not at the next heartbeat.
      publishHeartbeat({ system: { maintenance: data.maintenance, restricted: false, restrictedRoles: data.restrictedRoles, notice: data.notice } });
    } catch (err) {
      setError(errorOf(err));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const on = state?.maintenance?.on;
  const restricted = state?.restrictedRoles || [];

  return (
    <Page>
      <PageHeader
        title="System"
        subtitle="Maintenance, who can use the console, update notices and the server’s tools. Only the super admin sees this page."
        actions={<Button icon="refresh-cw" onClick={load}>Refresh</Button>}
      />
      {error && <ErrorBanner onDismiss={() => setError('')}>{error}</ErrorBanner>}

      {!state ? <Loading label="Loading the system’s state…" /> : (
        <>
          <div style={x.statusRow} role="list" aria-label="System status">
            <StatusChip label="App and website" ok={!on} okText="Open" offText="Under maintenance" />
            <StatusChip label="Admins" ok={!restricted.includes('admin') && !on} okText="Working" offText={restricted.includes('admin') ? 'Paused' : 'Read-only'} />
            <StatusChip label="Moderators" ok={!restricted.includes('moderator') && !on} okText="Working" offText={restricted.includes('moderator') ? 'Paused' : 'Read-only'} />
          </div>

          <MaintenanceCard state={state} onChanged={load} />
          <AccessCard restricted={restricted} maintenanceOn={on} onChanged={load} />
          <NoticesCard />
          <ToolsCard />
          <MaintenanceLog key={on ? 'on' : 'off'} />
        </>
      )}
    </Page>
  );
}

function StatusChip({ label, ok, okText, offText }) {
  return (
    <div style={x.chip} role="listitem">
      <span style={{ ...x.dot, background: ok ? t.success : t.warning }} aria-hidden="true" />
      <span style={x.chipLabel}>{label}</span>
      <span style={{ ...x.chipValue, color: ok ? t.success : t.warning }}>{ok ? okText : offText}</span>
    </div>
  );
}

function Section({ title, description, children, tone }) {
  const id = useId();
  return (
    <section style={{ ...x.card, ...(tone === 'warning' ? x.cardWarning : null) }} aria-labelledby={id}>
      <h2 id={id} style={x.cardTitle}>{title}</h2>
      {description && <p style={x.cardDesc}>{description}</p>}
      {children}
    </section>
  );
}

// ── Maintenance ────────────────────────────────────────────────────────────

function MaintenanceCard({ state, onChanged }) {
  const m = state.maintenance;
  const [message, setMessage] = useState(m.message || '');
  const [endAt, setEndAt] = useState(toLocalInput(m.expectedEndAt));
  const [busy, setBusy] = useState(false);
  const ids = { msg: useId(), end: useId() };

  const startIt = async () => {
    const ok = await confirmAction(
      'Travelers see “Under maintenance” in the app straight away. Admins and moderators can look around the console but can’t save, and each is told in their bell.',
      { title: 'Start maintenance now?', confirmText: 'Start maintenance', tone: 'warning' },
    );
    if (!ok) return;
    setBusy(true);
    try {
      await systemAPI.startMaintenance({ message: message.trim(), expectedEndAt: fromLocalInput(endAt) });
      notify('Maintenance is on.', { tone: 'success' });
      await onChanged();
    } catch (err) { notify(errorOf(err), { tone: 'danger' }); }
    setBusy(false);
  };

  const saveIt = async () => {
    setBusy(true);
    try {
      await systemAPI.updateMaintenance({ message: message.trim(), expectedEndAt: fromLocalInput(endAt) });
      notify('The maintenance message is updated.', { tone: 'success' });
      await onChanged();
    } catch (err) { notify(errorOf(err), { tone: 'danger' }); }
    setBusy(false);
  };

  const endIt = async () => {
    const summary = await promptAction(
      'Everyone can use the app and the console again once you end it. Say what was done; it goes in the maintenance log and to the staff.',
      { title: 'End maintenance?', label: 'What was done', placeholder: 'e.g. Moved the database to a bigger plan. Nothing was lost.', minLength: 10, maxLength: 2000, confirmText: 'End maintenance' },
    );
    if (summary == null) return;
    setBusy(true);
    try {
      await systemAPI.endMaintenance(summary);
      notify('Maintenance is over. The app is open again.', { tone: 'success' });
      setMessage('');
      setEndAt('');
      await onChanged();
    } catch (err) { notify(errorOf(err), { tone: 'danger' }); }
    setBusy(false);
  };

  return (
    <Section
      title="Maintenance"
      tone={m.on ? 'warning' : undefined}
      description={m.on
        ? `On since ${fmtDateTime(m.startedAt)}${m.startedBy?.username ? `, started by ${m.startedBy.username}` : ''}. Travelers can’t use the app; staff can look but not save.`
        : 'For work that needs everyone out: a database move, a big update. Starts now and lasts until you end it.'}
    >
      <div style={x.formGrid}>
        <div style={{ minWidth: 0 }}>
          <label htmlFor={ids.msg} style={s.panelLabel}>Message travelers see <span style={x.optional}>(optional)</span></label>
          <textarea id={ids.msg} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={300} rows={3}
            placeholder="Libot Bulacan is being updated. Please check back soon." style={s.textarea} />
          <p style={x.hint}>Without one, the app says “Libot Bulacan is being updated. Please check back soon.”</p>
        </div>
        <div style={{ minWidth: 0 }}>
          <label htmlFor={ids.end} style={s.panelLabel}>Expected back <span style={x.optional}>(optional)</span></label>
          <input id={ids.end} type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)}
            min={toLocalInput(new Date())} style={s.select} />
          <p style={x.hint}>Shown with the message, in Philippine time.</p>
        </div>
      </div>
      <div style={s.buttonRow}>
        {m.on ? (
          <>
            <Button variant="primary" icon="check" onClick={endIt} disabled={busy}>End maintenance</Button>
            <Button icon="edit" onClick={saveIt} disabled={busy}>Save the message</Button>
          </>
        ) : (
          <Button variant="warning" icon="tool" onClick={startIt} disabled={busy}>Start maintenance</Button>
        )}
      </div>
    </Section>
  );
}

// ── Access ─────────────────────────────────────────────────────────────────

const ROLE_TEXT = {
  admin: { name: 'Admins', on: 'Admins can sign in and work as usual.', off: 'Admins can’t sign in, and open sessions are paused. Moderators are not affected.' },
  moderator: { name: 'Moderators', on: 'Moderators can sign in and work as usual.', off: 'Moderators can’t sign in, and open sessions are paused. Admins are not affected.' },
};

function AccessCard({ restricted, maintenanceOn, onChanged }) {
  const [busy, setBusy] = useState('');
  const toggle = async (role) => {
    const pausing = !restricted.includes(role);
    const ok = await confirmAction(
      pausing
        ? `${ROLE_TEXT[role].name} are signed out of their work until you let them back in. They’re told in their bell.`
        : `${ROLE_TEXT[role].name} can use the console again.`,
      { title: pausing ? `Pause ${ROLE_TEXT[role].name.toLowerCase()}’ access?` : `Let ${ROLE_TEXT[role].name.toLowerCase()} back in?`, confirmText: pausing ? 'Pause access' : 'Let them in', tone: pausing ? 'warning' : 'info' },
    );
    if (!ok) return;
    setBusy(role);
    try {
      await systemAPI.setRestricted(pausing ? [...restricted, role] : restricted.filter((r) => r !== role));
      await onChanged();
    } catch (err) { notify(errorOf(err), { tone: 'danger' }); }
    setBusy('');
  };

  return (
    <Section
      title="Who can use the console"
      description={`Pause one kind of staff account without closing the app, e.g. moderators while their pages change.${maintenanceOn ? ' During maintenance everyone is read-only anyway.' : ''}`}
    >
      <div style={x.accessGrid}>
        {['admin', 'moderator'].map((role) => {
          const paused = restricted.includes(role);
          return (
            <div key={role} style={x.accessRow}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={x.accessName}>
                  {ROLE_TEXT[role].name}
                  <StatusPill tone={paused ? 'warning' : 'success'} icon={paused ? 'pause' : 'check'}>{paused ? 'Paused' : 'Can sign in'}</StatusPill>
                </div>
                <p style={x.accessDesc}>{paused ? ROLE_TEXT[role].off : ROLE_TEXT[role].on}</p>
              </div>
              <Button size="sm" variant={paused ? 'success' : 'warning'} icon={paused ? 'user-check' : 'user-minus'}
                disabled={busy === role} onClick={() => toggle(role)}>
                {paused ? 'Let them in' : 'Pause access'}
              </Button>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ── Update notices ─────────────────────────────────────────────────────────

function NoticesCard() {
  const [kind, setKind] = useState('scheduled');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [at, setAt] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState(null);
  const [page, setPage] = useState(1);
  const ids = { title: useId(), msg: useId(), at: useId() };

  const load = useCallback(() => {
    systemAPI.notices({ page, limit: 5 }).then(setList).catch(() => setList({ notices: [], pages: 1, page: 1 }));
  }, [page]);
  useEffect(() => { load(); }, [load]);

  const errors = {};
  if (title.trim().length < 3) errors.title = 'Give it a title (3 characters or more).';
  if (kind === 'scheduled' && !at) errors.at = 'Say when the update will happen.';

  const publish = async (e) => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(errors).length) return;
    const ok = await confirmAction('Travelers see it in the app, and every staff account gets it in their bell.', { title: 'Publish this notice?', confirmText: 'Publish' });
    if (!ok) return;
    setBusy(true);
    try {
      await systemAPI.publishNotice({ kind, title: title.trim(), message: message.trim(), at: kind === 'scheduled' ? fromLocalInput(at) : null });
      notify('The notice is published.', { tone: 'success' });
      setTitle(''); setMessage(''); setAt(''); setTried(false);
      setPage(1);
      load();
    } catch (err) { notify(errorOf(err), { tone: 'danger' }); }
    setBusy(false);
  };

  const hide = async (n) => {
    const ok = await confirmAction(`“${n.title}” stops showing in the app and on dashboards.`, { title: 'Take this notice down?', confirmText: 'Take down', danger: true });
    if (!ok) return;
    try { await systemAPI.hideNotice(n._id); load(); } catch (err) { notify(errorOf(err), { tone: 'danger' }); }
  };

  const shown = tried ? errors : {};
  return (
    <Section title="Update notices" description="Tell travelers and staff about an update: one that’s coming, or one that’s done. The newest shows for two weeks.">
      <form onSubmit={publish} noValidate>
        <FilterTabs label="Kind of notice" value={kind} onChange={setKind}
          options={[{ value: 'scheduled', label: 'An update is coming' }, { value: 'completed', label: 'An update is done' }]} />
        <div style={{ ...x.formGrid, marginTop: 12 }}>
          <div style={{ minWidth: 0 }}>
            <label htmlFor={ids.title} style={s.panelLabel}>Title</label>
            <input id={ids.title} className="modern-input" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)}
              placeholder={kind === 'scheduled' ? 'e.g. New AR spots this weekend' : 'e.g. Faster maps'}
              style={{ ...s.select, cursor: 'text', ...(shown.title ? x.invalid : null) }} aria-invalid={!!shown.title} />
            {shown.title && <p style={x.error}><Icon name="alert-circle" size={12} /> {shown.title}</p>}
          </div>
          {kind === 'scheduled' && (
            <div style={{ minWidth: 0 }}>
              <label htmlFor={ids.at} style={s.panelLabel}>When</label>
              <input id={ids.at} type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)}
                style={{ ...s.select, ...(shown.at ? x.invalid : null) }} aria-invalid={!!shown.at} />
              {shown.at && <p style={x.error}><Icon name="alert-circle" size={12} /> {shown.at}</p>}
            </div>
          )}
        </div>
        <label htmlFor={ids.msg} style={{ ...s.panelLabel, display: 'block', marginTop: 12 }}>Details <span style={x.optional}>(optional)</span></label>
        <textarea id={ids.msg} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} rows={3} style={s.textarea}
          placeholder="What changes for travelers, in a sentence or two." />
        <div style={s.buttonRow}>
          <Button type="submit" variant="primary" icon="send" disabled={busy}>{busy ? 'Publishing…' : 'Publish notice'}</Button>
        </div>
      </form>

      {list && list.notices.length > 0 && (
        <ul style={x.noticeList} aria-label="Published notices">
          {list.notices.map((n) => (
            <li key={n._id} style={x.noticeItem}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={x.accessName}>
                  {n.title}
                  {n.hiddenAt ? <StatusPill tone="neutral">Taken down</StatusPill>
                    : n._id === list.showingId ? <StatusPill tone="brand" icon="eye">Showing</StatusPill> : null}
                </div>
                <div style={s.itemDate}>
                  {n.kind === 'scheduled' ? `Coming ${fmtDateTime(n.at)}` : 'Done'} · published {timeAgo(n.createdAt)}{n.publishedBy?.username ? ` by ${n.publishedBy.username}` : ''}
                </div>
                {n.message && <p style={x.noticeText}>{n.message}</p>}
              </div>
              {!n.hiddenAt && <Button size="sm" variant="danger" icon="x" onClick={() => hide(n)}>Take down</Button>}
            </li>
          ))}
        </ul>
      )}
      {list && list.pages > 1 && <Pagination page={list.page} pages={list.pages} onChange={setPage} label="Notice pages" />}
    </Section>
  );
}

// ── Tools ──────────────────────────────────────────────────────────────────

function ToolsCard() {
  const [cleared, setCleared] = useState(null);
  const [health, setHealth] = useState(null);
  const [locked, setLocked] = useState(null);
  const [busy, setBusy] = useState('');

  const run = async (key, fn) => {
    setBusy(key);
    try { await fn(); } catch (err) { notify(errorOf(err), { tone: 'danger' }); }
    setBusy('');
  };

  const clearCache = () => run('cache', async () => {
    const ok = await confirmAction('The next request for each list reads the database again. Nobody is signed out and nothing is lost.', { title: 'Clear the server’s cache?', confirmText: 'Clear cache' });
    if (!ok) return;
    setCleared(await systemAPI.clearCache());
  });
  const checkHealth = () => run('health', async () => setHealth((await systemAPI.health()).health));
  const loadLocked = () => run('locked', async () => setLocked(await systemAPI.locked()));
  const unlock = (a) => run(`unlock-${a.id}`, async () => {
    await systemAPI.unlock(a.id);
    notify(`${a.username} can sign in again.`, { tone: 'success' });
    setLocked(await systemAPI.locked());
  });

  useEffect(() => { loadLocked(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Section title="Tools" description="Everyday fixes that used to need a developer’s machine.">
      <div style={x.tools}>
        <div style={x.tool}>
          <div style={x.toolHead}>
            <Icon name="refresh-cw" size={16} color={t.textSecondary} />
            <strong style={x.toolName}>Clear cache</strong>
          </div>
          <p style={x.toolDesc}>Spot lists, categories and the website’s figures are kept for a minute or five. Clear them when a change made straight in the database doesn’t show.</p>
          <Button size="sm" icon="refresh-cw" onClick={clearCache} disabled={busy === 'cache'}>{busy === 'cache' ? 'Clearing…' : 'Clear cache'}</Button>
          {cleared && (
            <p style={x.toolResult} role="status">
              <Icon name="check-circle" size={13} color={t.success} /> Cleared: {cleared.cleared.join(', ')}. {cleared.note}
            </p>
          )}
        </div>

        <div style={x.tool}>
          <div style={x.toolHead}>
            <Icon name="monitor" size={16} color={t.textSecondary} />
            <strong style={x.toolName}>Server health</strong>
          </div>
          <p style={x.toolDesc}>Whether the database answers, how long the server has been up, and which version is running.</p>
          <Button size="sm" icon="check" onClick={checkHealth} disabled={busy === 'health'}>{busy === 'health' ? 'Checking…' : 'Check now'}</Button>
          {health && (
            <div style={x.facts} role="status">
              <span>Database</span><span style={{ color: health.db.connected ? t.success : t.danger }}>{health.db.connected ? `Connected · ${health.db.pingMs} ms` : 'Not answering'}</span>
              <span>Up for</span><span>{minutesText(Math.round(health.uptimeSeconds / 60))}</span>
              <span>Memory</span><span>{health.memoryMb.rss} MB</span>
              <span>Version</span><span style={{ fontFamily: fonts.mono }}>{health.commit || 'local'}</span>
            </div>
          )}
        </div>

        <div style={x.tool}>
          <div style={x.toolHead}>
            <Icon name="lock" size={16} color={t.textSecondary} />
            <strong style={x.toolName}>Locked accounts</strong>
          </div>
          <p style={x.toolDesc}>Five wrong passwords lock a staff account for a while. Unlock one here once you know it was them.</p>
          {!locked ? <p style={x.toolDesc}>Loading…</p>
            : locked.length === 0 ? <p style={x.toolResult}><Icon name="check-circle" size={13} color={t.success} /> No account is locked.</p>
              : (
                <ul style={x.lockedList}>
                  {locked.map((a) => (
                    <li key={a.id} style={x.lockedItem}>
                      <span style={{ minWidth: 0 }}>
                        <strong style={{ color: t.textPrimary }}>{a.username}</strong>
                        <span style={s.itemDate}> · until {fmtDateTime(a.lockedUntil)}</span>
                      </span>
                      <Button size="sm" icon="key" onClick={() => unlock(a)} disabled={busy === `unlock-${a.id}`}>Unlock</Button>
                    </li>
                  ))}
                </ul>
              )}
        </div>
      </div>
    </Section>
  );
}

// ── Maintenance log ────────────────────────────────────────────────────────

function MaintenanceLog() {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  useEffect(() => {
    let live = true;
    systemAPI.logs({ page, limit: 10 }).then((d) => { if (live) setData(d); }).catch(() => { if (live) setData({ logs: [], pages: 1, page: 1, total: 0 }); });
    return () => { live = false; };
  }, [page]);

  return (
    <Section title="Maintenance log" description="Every maintenance window: when, how long, who started and ended it, and what was done.">
      {!data ? <Loading label="Loading the log…" />
        : data.logs.length === 0 ? <EmptyState icon="tool" title="No maintenance yet" subtitle="Each one is kept here once it starts." />
          : (
            <>
              <Table caption="Maintenance log" head={<><Th>Started</Th><Th>Length</Th><Th>By</Th><Th>What was done</Th></>}>
                {data.logs.map((l) => (
                  <tr key={l._id}>
                    <Td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(l.startedAt)}</Td>
                    <Td muted style={{ whiteSpace: 'nowrap' }}>{l.endedAt ? duration(l.startedAt, l.endedAt) : <StatusPill tone="warning" icon="clock">Going on</StatusPill>}</Td>
                    <Td muted>{l.startedBy?.username || '—'}{l.endedBy?.username && l.endedBy.username !== l.startedBy?.username ? ` → ${l.endedBy.username}` : ''}</Td>
                    <Td>
                      <span style={{ ...s.clampCell, maxWidth: 420, whiteSpace: 'normal' }}>
                        {l.summary || (l.endedAt ? '—' : l.message || 'Not ended yet')}
                      </span>
                    </Td>
                  </tr>
                ))}
              </Table>
              {data.pages > 1 && <Pagination page={data.page} pages={data.pages} onChange={setPage} label="Maintenance log pages" />}
            </>
          )}
    </Section>
  );
}

const x = {
  statusRow: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  chip: {
    display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 14px',
    background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: radius.pill,
  },
  dot:       { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  chipLabel: { fontSize: 12.5, fontWeight: 600, color: t.textSecondary },
  chipValue: { fontSize: 13, fontWeight: 700 },

  // Longhand border, so the amber edge swaps cleanly when maintenance toggles.
  card:        { background: t.cardBg, borderWidth: 1, borderStyle: 'solid', borderColor: t.border, borderRadius: radius.lg, padding: '18px 20px' },
  // Maintenance on: an amber edge, the one loud thing on the page.
  cardWarning: { borderColor: t.warning },
  cardTitle:   { ...type.cardTitle, color: t.textPrimary, margin: 0 },
  cardDesc:    { fontSize: 13.5, color: t.textSecondary, lineHeight: 1.5, margin: '4px 0 14px', maxWidth: 720 },
  formGrid:    { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px 16px' },
  optional:    { fontWeight: 500, color: t.textMuted },
  hint:        { fontSize: 12, color: t.textMuted, margin: '5px 0 0' },
  error:       { fontSize: 12, color: t.danger, margin: '5px 0 0', display: 'flex', alignItems: 'center', gap: 4 },
  // Shorthand, like the s.select / s.textarea it's spread over.
  invalid:     { border: `1px solid ${t.danger}` },

  accessGrid:  { display: 'flex', flexDirection: 'column', gap: 10 },
  accessRow:   { display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '12px 14px', border: `1px solid ${t.divider}`, borderRadius: radius.md, background: t.sidebarBg },
  accessName:  { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 14, fontWeight: 700, color: t.textPrimary },
  accessDesc:  { fontSize: 12.5, color: t.textMuted, margin: '3px 0 0', lineHeight: 1.45 },

  noticeList:  { listStyle: 'none', margin: '18px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8, borderTop: `1px solid ${t.divider}`, paddingTop: 14 },
  noticeItem:  { display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' },
  noticeText:  { fontSize: 13, color: t.textSecondary, margin: '4px 0 0', lineHeight: 1.45, overflowWrap: 'anywhere' },

  tools:       { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 },
  tool:        { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, padding: '14px 16px', border: `1px solid ${t.divider}`, borderRadius: radius.md, background: t.sidebarBg, minWidth: 0 },
  toolHead:    { display: 'flex', alignItems: 'center', gap: 8 },
  toolName:    { fontSize: 14, color: t.textPrimary },
  toolDesc:    { fontSize: 12.5, color: t.textMuted, lineHeight: 1.45, margin: 0 },
  toolResult:  { fontSize: 12.5, color: t.textSecondary, lineHeight: 1.45, margin: 0, display: 'flex', gap: 6, alignItems: 'flex-start' },
  facts:       { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 12px', margin: 0, fontSize: 12.5, color: t.textSecondary },
  lockedList:  { listStyle: 'none', margin: 0, padding: 0, width: '100%', display: 'flex', flexDirection: 'column', gap: 6 },
  lockedItem:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 13 },
};

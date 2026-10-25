import { useCallback, useEffect, useId, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { systemAPI } from '../api/api';
import {
  Page, PageHeader, Button, StatusPill, Table, Th, Td, Row, Loading, ErrorBanner, FilterTabs,
  pageStyles as s,
} from '../components/Layout';
import Pagination, { PAGE_SIZE } from '../components/Pagination';
import MaintenanceDrawer from '../components/MaintenanceDrawer';
import { notify, confirmAction, promptAction } from '../components/AppAlert';
import Icon from '../components/Icon';
import { publishHeartbeat } from '../auth/heartbeat';
import { useLive, useLiveTick } from '../api/live';
import { theme as t, radius, fonts } from '../theme';
import { fmtDateTime, timeAgo } from '../utils/format';
import { clockText, useCountdown } from '../utils/signOut';

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
 *   Maintenance     admins and moderators get a pop-up with the message and a
 *                   countdown, then are signed out until it ends (user,
 *                   2026-10-23: a pop-up, not the bell, and a delay before the
 *                   sign-out). Travelers aren't affected (user rule
 *                   2026-10-23). Ending it asks what was done, for the log.
 *   Access          pause admins or moderators without a full maintenance:
 *                   the same pop-up, with its own message and countdown.
 *   Update notices  "an update is coming" / "an update is done", shown in the
 *                   app and on everyone's dashboard for two weeks.
 *   Tools           clear the server's cache, its health. Locked accounts
 *                   are unlocked on the Accounts page (user, 2026-10-23).
 *   Maintenance log every window, who started and ended it, and the summary.
 *
 * Laid out like the rest of the super admin's console (2026-10-23): the band's
 * strip says the state of each switch at a glance; maintenance and notices on
 * the left, access and tools on the right, the log across the foot.
 */

const toLocalInput = (d) => {
  if (!d) return '';
  const x = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
};
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);
const errorOf = (err) => err?.response?.data?.message || 'Couldn’t reach the server. Try again.';

// How long the pop-up gives staff before they're signed out (the server takes these).
const SIGN_OUT_MINUTES = [1, 2, 5, 10];
const minutesLabel = (n) => `${n} minute${n === 1 ? '' : 's'}`;

function SignOutAfter({ id, value, onChange }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(Number(e.target.value))} style={s.select}>
      {SIGN_OUT_MINUTES.map((n) => <option key={n} value={n}>{minutesLabel(n)}</option>)}
    </select>
  );
}

// "in 1:42", or "at 3:15 PM" once it's past: when the countdown signs staff out.
function SignOutWhen({ at }) {
  const left = useCountdown(at ? new Date(at).getTime() : null);
  if (!at) return null;
  return left
    ? <>signed out in <span className="sa-mono">{clockText(left)}</span></>
    : <>signed out since <span className="sa-mono">{fmtDateTime(at)}</span></>;
}

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
  const location = useLocation();

  // `quiet`: a live update; a failure keeps what's shown.
  const load = useCallback(async ({ quiet = false } = {}) => {
    try {
      const data = await systemAPI.get();
      setState(data);
      setError('');
      // The banner and the rail follow at once, not at the next heartbeat.
      publishHeartbeat({ system: { maintenance: data.maintenance, restricted: false, restrictedRoles: data.restrictedRoles, pauses: data.pauses, notice: data.notice, signOut: null } });
    } catch (err) {
      if (!quiet) setError(errorOf(err));
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  // Another window of the console.
  useLive(['system'], () => load({ quiet: true }));

  // The dashboard's quick actions link to a card here (/system#tools).
  const ready = !!state;
  useEffect(() => {
    if (ready && location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [ready, location.hash]);

  const on = state?.maintenance?.on;
  const restricted = state?.restrictedRoles || [];
  const roleState = (r) => (restricted.includes(r) ? 'Paused' : on ? 'Signed out' : 'Working');
  const stats = state && [
    { label: 'Maintenance', hue: 'violet', small: true, value: on ? 'On' : 'Off', tone: on ? 'warn' : 'good',
      hint: on ? `since ${timeAgo(state.maintenance.startedAt)}` : state.lastMaintenance ? `last ended ${timeAgo(state.lastMaintenance.endedAt)}` : 'never run' },
    { label: 'App and website', small: true, value: 'Open', tone: 'good', hint: 'Running' },
    ...['admin', 'moderator'].map((r) => ({
      label: r === 'admin' ? 'Admins' : 'Moderators', hue: 'blue', small: true, value: roleState(r), tone: roleState(r) === 'Working' ? 'good' : 'warn',
      hint: restricted.includes(r) ? 'can’t sign in' : on ? 'can’t sign in until it ends' : 'can sign in and save',
    })),
    { label: 'Update notice', hue: 'violet', small: true, value: state.notice ? 'Showing' : 'None', hint: state.notice ? state.notice.title : 'travelers see no notice' },
  ];

  return (
    <Page>
      <PageHeader
        title="System"
        stats={stats || undefined}
      />
      {error && <ErrorBanner onDismiss={() => setError('')}>{error}</ErrorBanner>}

      {!state ? <Loading label="Loading the system’s state…" kind="panels" /> : (
        <>
          {/* A tall card and a short one in each column, so neither column
              ends far above the other (mock defense notes, 2026-10-23: the
              notices card left empty space beside it). */}
          <div className="sa-grid sa-split-even">
            <div className="sa-col">
              <MaintenanceCard state={state} onChanged={load} />
              <ToolsCard />
            </div>
            <div className="sa-col">
              <AccessCard restricted={restricted} pauses={state.pauses || {}} maintenanceOn={on} onChanged={load} />
              <NoticesCard />
            </div>
          </div>
          <MaintenanceLog key={on ? 'on' : 'off'} />
        </>
      )}
    </Page>
  );
}

// One card on this page: a title bar, a line of what it does, its controls.
// `table`: the card holds a table flush to its edges, under an ink head
// (the console's rule for tables; DESIGN.md).
function Section({ id, title, description, children, tone, meta, table }) {
  const titleId = useId();
  return (
    <section id={id} className="sa-panel" style={{ ...(tone === 'warning' ? x.cardWarning : null), ...(table ? { overflow: 'hidden' } : null), scrollMarginTop: 68 }} aria-labelledby={titleId}>
      {(title || meta) && (  // ← add this condition
        <div className={`sa-panel-head${table ? ' dark' : ''}`}>
          <h2 id={titleId} className="sa-panel-title">{title}</h2>
          {meta}
        </div>
      )}
      {table ? children : (
        <div className="sa-panel-body">
          {description && <p style={x.cardDesc}>{description}</p>}
          {children}
        </div>
      )}
    </section>
  );
}

// ── Maintenance ────────────────────────────────────────────────────────────

function MaintenanceCard({ state, onChanged }) {
  const m = state.maintenance;
  const [message, setMessage] = useState(m.message || '');
  const [endAt, setEndAt] = useState(toLocalInput(m.expectedEndAt));
  const [signOutMinutes, setSignOutMinutes] = useState(2);
  const [busy, setBusy] = useState(false);
  const ids = { msg: useId(), end: useId(), wait: useId() };

  const startIt = async () => {
    const ok = await confirmAction(
      `Admins and moderators get a pop-up with your message and are signed out after ${minutesLabel(signOutMinutes)}. They can’t sign in until you end it. Travelers aren’t affected: the app and the website keep working.`,
      { title: 'Start maintenance now?', confirmText: 'Start maintenance', tone: 'warning' },
    );
    if (!ok) return;
    setBusy(true);
    try {
      await systemAPI.startMaintenance({ message: message.trim(), expectedEndAt: fromLocalInput(endAt), signOutMinutes });
      notify(`Maintenance is on. Admins and moderators are signed out in ${minutesLabel(signOutMinutes)}.`, { tone: 'success' });
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
      'Admins and moderators can sign in again once you end it. Say what was done; it goes in the maintenance log and to the staff’s bell.',
      { title: 'End maintenance?', label: 'What was done', placeholder: 'e.g. Moved the database to a bigger plan. Nothing was lost.', minLength: 10, maxLength: 2000, confirmText: 'End maintenance' },
    );
    if (summary == null) return;
    setBusy(true);
    try {
      await systemAPI.endMaintenance(summary);
      notify('Maintenance is over. Staff can sign in again.', { tone: 'success' });
      setMessage('');
      setEndAt('');
      await onChanged();
    } catch (err) { notify(errorOf(err), { tone: 'danger' }); }
    setBusy(false);
  };

  return (
    <Section
      id="maintenance"
      title="Maintenance"
      tone={m.on ? 'warning' : undefined}
      meta={m.on ? <StatusPill tone="warning" icon="tool">On</StatusPill> : <StatusPill tone="success" icon="check">Off</StatusPill>}
      description={m.on
        ? <>On since <span className="sa-mono">{fmtDateTime(m.startedAt)}</span>{m.startedBy?.username ? `, started by ${m.startedBy.username}` : ''}. Admins and moderators are <SignOutWhen at={m.signOutAt} />; travelers aren’t affected.</>
        : undefined}
    >
      <div style={x.formGrid}>
        <div style={{ minWidth: 0 }}>
          <label htmlFor={ids.msg} style={s.panelLabel}>Message in the pop-up </label>
          <textarea id={ids.msg} value={message} placeholder="Enter a message for the maintenance pop-up." onChange={(e) => setMessage(e.target.value)} maxLength={300} rows={3} style={s.textarea} />
        </div>
        <div style={{ minWidth: 0 }}>
          <label htmlFor={ids.end} style={s.panelLabel}>Expected back </label>
          <input id={ids.end} type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)}
            min={toLocalInput(new Date())} style={s.select} />
        </div>
        {!m.on && (
          <div style={{ minWidth: 0 }}>
            <label htmlFor={ids.wait} style={s.panelLabel}>Sign staff out after</label>
            <SignOutAfter id={ids.wait} value={signOutMinutes} onChange={setSignOutMinutes} />
          </div>
        )}
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
  admin: { name: 'Admins', on: 'Admins can sign in.', off: 'Admins can’t sign in. Moderators are not affected.' },
  moderator: { name: 'Moderators', on: 'Moderators can sign in.', off: 'Moderators can’t sign in. Admins are not affected.' },
};

function AccessCard({ restricted, pauses, maintenanceOn, onChanged }) {
  const [busy, setBusy] = useState('');
  // The role whose switch was just turned off: its pause form is open.
  const [pausing, setPausing] = useState('');

  const save = async (roles) => {
    setBusy(roles.role);
    try {
      await systemAPI.setRestricted(roles.list, roles.popup);
      setPausing('');
      await onChanged();
    } catch (err) { notify(errorOf(err), { tone: 'danger' }); }
    setBusy('');
  };

  const toggle = async (role) => {
    if (!restricted.includes(role)) { setPausing(pausing === role ? '' : role); return; }
    const ok = await confirmAction(`${ROLE_TEXT[role].name} can sign in and use the console again. They’re told in their bell.`,
      { title: `Let ${ROLE_TEXT[role].name.toLowerCase()} back in?`, confirmText: 'Let them in', tone: 'info' });
    if (ok) save({ role, list: restricted.filter((r) => r !== role) });
  };

  // One row per kind of staff account, each with its switch: on = they can
  // use the console (the user's reference has a card per portal).
  return (
    <Section
      title="Who can use the console"
    >
      <div className="sa-rows" style={x.accessGrid}>
        {['admin', 'moderator'].map((role) => {
          const paused = restricted.includes(role);
          const pause = pauses[role];
          const labelId = `access-${role}`;
          return (
            <div key={role} style={{ ...x.accessItem, ...(paused ? x.accessPaused : null) }}>
              <div style={x.accessRow}>
                <span style={x.accessIcon}><Icon name={role === 'admin' ? 'shield' : 'map-pin'} size={18} /></span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={x.accessName}>
                    <span id={labelId}>{ROLE_TEXT[role].name}</span>
                    <StatusPill tone={paused ? 'warning' : 'success'} icon={paused ? 'pause' : 'check'}>{paused ? 'Paused' : 'Can sign in'}</StatusPill>
                  </div>
                  <p style={x.accessDesc}>
                    {paused ? ROLE_TEXT[role].off : ROLE_TEXT[role].on}
                    {paused && pause?.signOutAt && <> Open sessions: <SignOutWhen at={pause.signOutAt} />.</>}
                  </p>
                  {paused && pause?.message && <p style={x.accessQuote}>“{pause.message}”</p>}
                </div>
                <button
                  type="button"
                  role="switch"
                  className="sa-switch"
                  aria-checked={!paused && pausing !== role}
                  aria-labelledby={labelId}
                  aria-describedby={`${labelId}-hint`}
                  disabled={busy === role}
                  onClick={() => toggle(role)}
                />
                <span id={`${labelId}-hint`} className="visually-hidden">{paused ? 'Turn on to let them back in' : 'Turn off to pause their access'}</span>
              </div>
              {pausing === role && !paused && (
                <PauseForm
                  role={role}
                  busy={busy === role}
                  onCancel={() => setPausing('')}
                  onPause={(popup) => save({ role, list: [...restricted, role], popup })}
                />
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// Under a switch just turned off: what their pop-up says, and how long before
// they're signed out (user, 2026-10-23: "there will also be a message in there").
function PauseForm({ role, busy, onCancel, onPause }) {
  const [message, setMessage] = useState('');
  const [signOutMinutes, setSignOutMinutes] = useState(2);
  const ids = { msg: useId(), wait: useId() };
  const name = ROLE_TEXT[role].name;

  const submit = (e) => {
    e.preventDefault();
    onPause({ message: message.trim(), signOutMinutes });
  };

  return (
    <form onSubmit={submit} style={x.pauseForm} aria-label={`Pause ${name.toLowerCase()}’ access`}>
      <div style={x.formGrid}>
        <div style={{ minWidth: 0 }}>
          <label htmlFor={ids.msg} style={s.panelLabel}>Message in the pop-up <span style={x.optional}>(optional)</span></label>
          <textarea id={ids.msg} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={300} rows={2} autoFocus
            placeholder={role === 'moderator' ? 'e.g. Your spot pages are being changed. Back by 3 PM.' : 'e.g. The approval queue is being fixed.'}
            style={s.textarea} />
        </div>
        <div style={{ minWidth: 0 }}>
          <label htmlFor={ids.wait} style={s.panelLabel}>Sign them out after</label>
          <SignOutAfter id={ids.wait} value={signOutMinutes} onChange={setSignOutMinutes} />
          <p style={x.hint}>{name} signed in now get a pop-up and can save until then. Nobody can sign in meanwhile.</p>
        </div>
      </div>
      <div style={s.buttonRow}>
        <Button type="submit" variant="warning" icon="pause" disabled={busy}>{busy ? 'Pausing…' : `Pause ${name.toLowerCase()}`}</Button>
        <Button type="button" variant="subtle" onClick={onCancel} disabled={busy}>Cancel</Button>
      </div>
    </form>
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
    systemAPI.notices({ page, limit: PAGE_SIZE }).then(setList).catch(() => setList((shown) => shown ?? { notices: [], pages: 1, page: 1 }));
  }, [page]);
  useEffect(() => { load(); }, [load]);
  useLive(['system'], load);

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
    <Section id="notices" title="Update notices" >
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
          placeholder="What changes for travelers." />
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
                  {n.kind === 'scheduled' ? <>Coming <span className="sa-mono">{fmtDateTime(n.at)}</span></> : 'Done'} · published <span className="sa-mono">{timeAgo(n.createdAt)}</span>{n.publishedBy?.username ? ` by ${n.publishedBy.username}` : ''}
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

  return (
    <Section id="tools"  >
      <div className="sa-rows" style={x.tools}>
        <div style={x.tool}>
          <div style={x.toolHead}>
            <Icon name="refresh-cw" size={16} color={t.textSecondary} />
            <strong style={x.toolName}>Clear cache</strong>
          </div>
          <p style={x.toolDesc}>Clears cached data so recent changes appear immediately on the site.</p>
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
          <p style={x.toolDesc}>Database Status, Up Time, Memory, Version</p>
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
      </div>
    </Section>
  );
}

// ── Maintenance log ────────────────────────────────────────────────────────

function MaintenanceLog() {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  // A window ending adds its row (a failed reload keeps the rows shown).
  const changed = useLiveTick(['system']);
  useEffect(() => {
    let live = true;
    systemAPI.logs({ page, limit: PAGE_SIZE })
      .then((d) => { if (live) setData(d); })
      .catch(() => { if (live) setData((shown) => shown ?? { logs: [], pages: 1, page: 1, total: 0 }); });
    return () => { live = false; };
  }, [page, changed]);

  return (
    <Section
      table
      title="Maintenance log"
    >
      {!data ? <Loading label="Loading the log…" kind="rows" rows={3} />
        : data.logs.length === 0 ? <p style={x.flushNote}>No maintenance yet. Each one is kept here once it starts.</p>
          : (
            <>
              <Table bare caption="Maintenance log" head={<><Th>Started</Th><Th>Length</Th><Th>By</Th><Th>Action</Th></>}>
                {data.logs.map((l) => (
                  <Row key={l._id} onOpen={() => setOpen(l)} label={`Maintenance started ${fmtDateTime(l.startedAt)}`}>
                    <Td style={{ whiteSpace: 'nowrap' }}><span className="sa-mono">{fmtDateTime(l.startedAt)}</span></Td>
                    <Td muted style={{ whiteSpace: 'nowrap' }}>{l.endedAt ? <span className="sa-mono">{duration(l.startedAt, l.endedAt)}</span> : <StatusPill tone="warning" icon="clock">Going on</StatusPill>}</Td>
                    <Td muted>{l.startedBy?.username || '—'}{l.endedBy?.username && l.endedBy.username !== l.startedBy?.username ? ` → ${l.endedBy.username}` : ''}</Td>
                    <Td>
                      <span style={{ ...s.clampCell, maxWidth: 420, whiteSpace: 'normal' }}>
                        {l.summary || (l.endedAt ? '—' : l.message || 'Not ended yet')}
                      </span>
                    </Td>
                  </Row>
                ))}
              </Table>
              {data.pages > 1 && <div style={{ padding: '10px 16px' }}><Pagination page={data.page} pages={data.pages} onChange={setPage} label="Maintenance log pages" /></div>}
            </>
          )}
      {open && <MaintenanceDrawer log={open} length={open.endedAt ? duration(open.startedAt, open.endedAt) : null} onClose={() => setOpen(null)} />}
    </Section>
  );
}

const x = {
  // Maintenance on: an amber edge, the one loud thing on the page.
  cardWarning: { borderColor: t.warning },
  flushNote:   { margin: 0, padding: '14px 16px', fontSize: 14, color: t.textMuted },
  cardDesc:    { fontSize: 13.5, color: t.textSecondary, lineHeight: 1.5, margin: '0 0 14px', maxWidth: 720 },
  formGrid:    { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: '12px 16px' },
  optional:    { fontWeight: 500, color: t.textMuted },
  hint:        { fontSize: 12, color: t.textMuted, margin: '5px 0 0' },
  error:       { fontSize: 12, color: t.danger, margin: '5px 0 0', display: 'flex', alignItems: 'center', gap: 4 },
  // Shorthand, like the s.select / s.textarea it's spread over.
  invalid:     { border: `1px solid ${t.danger}` },

  accessGrid:  { display: 'flex', flexDirection: 'column', margin: '0 -8px' },
  // Rows divided by hairlines (sa-rows), not cards inside the card.
  accessItem:  { padding: '12px 8px' },
  accessRow:   { display: 'flex', alignItems: 'center', gap: 14 },
  accessPaused: { background: t.warningBg, borderRadius: radius.sm },
  accessQuote: { fontSize: 13, color: t.textPrimary, margin: '4px 0 0', lineHeight: 1.45, overflowWrap: 'anywhere' },
  // Lines up with the role's name, past the icon.
  pauseForm:   { marginTop: 12, marginLeft: 'clamp(0px, 6vw, 52px)', paddingTop: 12, borderTop: `1px dashed ${t.divider}` },
  accessIcon:  { width: 38, height: 38, borderRadius: radius.md, display: 'grid', placeItems: 'center', flexShrink: 0, background: 'var(--s-blue-soft)', color: t.textPrimary },
  accessName:  { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 14, fontWeight: 700, color: t.textPrimary },
  accessDesc:  { fontSize: 12.5, color: t.textMuted, margin: '3px 0 0', lineHeight: 1.45 },

  noticeList:  { listStyle: 'none', margin: '18px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8, borderTop: `1px solid ${t.divider}`, paddingTop: 14 },
  noticeItem:  { display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' },
  noticeText:  { fontSize: 13, color: t.textSecondary, margin: '4px 0 0', lineHeight: 1.45, overflowWrap: 'anywhere' },

  tools:       { display: 'flex', flexDirection: 'column' },
  tool:        { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, padding: '14px 0', minWidth: 0 },
  toolHead:    { display: 'flex', alignItems: 'center' },
  toolName:    { fontSize: 14, color: t.textPrimary },
  toolDesc:    { fontSize: 12.5, color: t.textMuted, lineHeight: 1.45, margin: 0 },
  toolResult:  { fontSize: 12.5, color: t.textSecondary, lineHeight: 1.45, margin: 0, display: 'flex', gap: 6, alignItems: 'flex-start' },
  facts:       { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 12px', margin: 0, fontSize: 12.5, color: t.textSecondary },
};

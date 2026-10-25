import { useEffect, useState } from 'react';
import { accountsAPI } from '../api/api';
import { Button, StatusPill, Table, Th, Td, Row, Avatar, Loading, EmptyState, pageStyles as s } from './Layout';
import { notify, confirmAction } from './AppAlert';
import CredentialSlip from './CredentialSlip';
import Drawer from './Drawer';
import Pagination, { PAGE_SIZE, Paged, usePaged } from './Pagination';
import { Facts, DetailSection, detailStyles as d } from './Details';
import Icon from './Icon';
import { theme as t, radius, shadow, type } from '../theme';
import { fmtDateTime, fmtDay, timeAgo } from '../utils/format';
import { BULACAN_MUNICIPALITIES } from '../utils/municipalities';
import { usernameProblem } from '../utils/passwordRule';
import { actionLabel, STAFF_STATUS } from '../utils/activity';

// A square icon-only button (the super admin's account rows).
const sq = { width: 34, minHeight: 34, padding: 0 };

/*
 * Admin and moderator accounts, shared by the super admin's Accounts page and
 * the admin's Moderators page (mock defense 2026-10-21):
 *   - AddAccountForm: role (when there's a choice), then the municipality for
 *     a moderator (whose username is made from it) or the username for an
 *     admin. No name and no password: the server makes a temporary password,
 *     shown once on the credential slip.
 *   - StaffTable: each account's status, last sign-in and "Last changed by …",
 *     with Reset password (a new slip; the super admin's page only),
 *     Delete (to the archive) or Restore, Move town (the super admin's only),
 *     and Unlock on a locked row (the super admin's page only). A row (or its
 *     History button) opens the account's details and history. Ten a page.
 * Usernames are permanent and a moderator's name comes from the town, so
 * neither can be edited anywhere.
 */

export function StaffStatus({ status }) {
  const st = STAFF_STATUS[status] || STAFF_STATUS.active;
  return <StatusPill tone={st.tone} icon={st.icon}>{st.label}</StatusPill>;
}

const ROLE_NAME = { superadmin: 'Super admin', admin: 'Admin', moderator: 'Moderator' };

// A name worth showing: the first moderators were given office names
// ("Malolos Tourism Office"); newer accounts carry only the made-up one.
const ownName = (a) => (
  a.name && ![`${a.municipality} Moderator`, 'Administrator', 'Super Admin'].includes(a.name) ? a.name : ''
);

// A moderator's username is made from the town, the pattern the existing
// accounts use ("malolosmod", "sanjosedelmontemod"), and can't be typed over
// (mock defense notes, 2026-10-23). If an older account already holds it, the
// next free number goes on the end ("bustosmod2").
const townUsername = (town, accounts) => {
  const base = `${town.normalize('NFD').replace(/[^A-Za-z0-9]/g, '').toLowerCase()}mod`;
  const taken = new Set(accounts.map((a) => a.username));
  let name = base;
  for (let n = 2; taken.has(name); n += 1) name = `${base}${n}`;
  return name;
};

/**
 * roles: which kinds this person may make (['admin','moderator'] for the super
 * admin, ['moderator'] for an admin). accounts: the list already shown, so
 * taken usernames and towns are caught before sending.
 */
export function AddAccountForm({ roles, accounts, onCancel, onMade }) {
  const [role, setRole] = useState(roles.includes('moderator') ? 'moderator' : roles[0]);
  const [municipality, setMunicipality] = useState('');
  // Typed for an admin only; a moderator's comes from the town.
  const [username, setUsername] = useState('');
  const [tried, setTried] = useState(false);
  const [serverError, setServerError] = useState({});
  const [saving, setSaving] = useState(false);

  const fromTown = role === 'moderator';
  const name = fromTown ? (municipality ? townUsername(municipality, accounts) : '') : username.trim().toLowerCase();
  const takenTowns = new Set(accounts.filter((a) => a.role === 'moderator' && a.active).map((a) => a.municipality.toLowerCase()));
  const errors = {};
  if (role === 'moderator') {
    if (!municipality) errors.municipality = 'Choose the municipality this moderator looks after.';
    else if (takenTowns.has(municipality.toLowerCase())) errors.municipality = `${municipality} already has a moderator account.`;
  }
  // A moderator's username follows the town, so only the town can be wrong.
  const uProblem = fromTown ? '' : usernameProblem(name);
  if (uProblem) errors.username = uProblem;
  else if (!fromTown && accounts.some((a) => a.username === name)) errors.username = `The username “${name}” is taken.`;
  const shown = { ...(tried ? errors : {}), ...serverError };

  const submit = async (e) => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(errors).length) {
      document.getElementById(`acct-${Object.keys(errors)[0]}`)?.focus();
      return;
    }
    const ok = await confirmAction(
      `Make the ${role === 'moderator' ? `${municipality} moderator` : 'admin'} account “${name}”? The username can’t be changed later.`,
      { title: 'Make this account?', confirmText: 'Make account', cancelText: 'Go back' },
    );
    if (!ok) return;
    setSaving(true);
    try {
      const data = await accountsAPI.create({ role, username: name, municipality: role === 'moderator' ? municipality : undefined });
      onMade(data);
    } catch (err) {
      const body = err?.response?.data;
      if (body?.field === 'username' || body?.field === 'municipality') setServerError({ [body.field]: body.message });
      else notify(body?.message || 'Couldn’t reach the server. Try again.', { tone: 'danger' });
    }
    setSaving(false);
  };

  const fieldError = (key) => shown[key] && (
    <p id={`acct-${key}-err`} style={f.error}><Icon name="alert-circle" size={13} /> {shown[key]}</p>
  );
  const invalid = (key) => (shown[key] ? f.invalid : null);

  return (
    <form style={f.card} onSubmit={submit} noValidate aria-labelledby="add-acct-title">
      <h2 id="add-acct-title" style={f.title}>New {roles.length > 1 ? 'account' : 'moderator account'}</h2>
      <p style={f.lead}>
        {fromTown
          ? 'Pick the municipality: it names the account and its username. The server makes a temporary password for you to hand over on a slip.'
          : 'The server makes a temporary password for you to hand over on a slip.'}
      </p>
      <div style={f.grid}>
        {roles.length > 1 && (
          <div>
            <span style={s.panelLabel}>Kind of account</span>
            <div role="radiogroup" aria-label="Kind of account" style={f.segment}>
              {roles.map((r) => (
                <button key={r} type="button" role="radio" aria-checked={role === r}
                  onClick={() => { setRole(r); setServerError({}); }}
                  style={{ ...f.segBtn, ...(role === r ? f.segOn : null) }}>
                  {ROLE_NAME[r]}
                </button>
              ))}
            </div>
          </div>
        )}
        {role === 'moderator' && (
          <div>
            <label htmlFor="acct-municipality" style={s.panelLabel}>Municipality</label>
            <select id="acct-municipality" value={municipality}
              onChange={(e) => { setMunicipality(e.target.value); setServerError({}); }}
              style={{ ...s.select, ...invalid('municipality') }}
              aria-invalid={!!shown.municipality} aria-describedby={shown.municipality ? 'acct-municipality-err' : undefined}>
              <option value="">Choose…</option>
              {BULACAN_MUNICIPALITIES.map((m) => {
                const has = takenTowns.has(m.toLowerCase());
                return <option key={m} value={m} disabled={has}>{has ? `${m} (has a moderator)` : m}</option>;
              })}
            </select>
            {fieldError('municipality') || <p style={f.hint}>One moderator per municipality.</p>}
          </div>
        )}
        <div>
          <label htmlFor="acct-username" style={s.panelLabel}>Username</label>
          {fromTown ? (
            <input id="acct-username" value={name} readOnly placeholder="Pick the municipality first"
              style={{ ...s.select, ...f.fixed, ...invalid('username') }}
              aria-invalid={!!shown.username} aria-describedby={shown.username ? 'acct-username-err' : 'acct-username-hint'} />
          ) : (
            <input id="acct-username" className="modern-input" value={username} maxLength={30}
              autoCapitalize="none" spellCheck={false} placeholder="e.g. phactoadmin"
              onChange={(e) => { setUsername(e.target.value); setServerError({}); }}
              style={{ ...s.select, cursor: 'text', ...invalid('username') }}
              aria-invalid={!!shown.username} aria-describedby={shown.username ? 'acct-username-err' : 'acct-username-hint'} />
          )}
          {fieldError('username') || (
            <p id="acct-username-hint" style={f.hint}>
              {fromTown ? 'Made from the municipality. What they type to sign in; it can’t be changed.' : 'What they type to sign in. It can’t be changed later.'}
            </p>
          )}
        </div>
      </div>
      <div style={{ ...s.buttonRow, justifyContent: 'flex-end' }}>
        <Button onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" variant="primary" icon="check" disabled={saving}>
          {saving ? 'Making the account…' : 'Make account'}
        </Button>
      </div>
    </form>
  );
}

/**
 * accounts: staffView rows. extra: an optional { head, cell(account) } column
 * (the Moderators page adds "Requests sent"). onChanged(account) replaces a row,
 * or moves it out of the list once it's deleted or restored.
 * canManage(account): whether this person may act on that row.
 * onUnlock(account): given only to the super admin, who unlocks a locked row
 * of any role (user rule 2026-10-23).
 * canReset: Reset password on the rows, the super admin's only; the admin's
 * Moderators page has none (user rule 2026-10-24). Delete moves an account to
 * the archive; a deleted row (Archived → Deleted staff) has Restore.
 * canMove: Move to another municipality on moderator rows, likewise the super
 * admin's only (user rule 2026-10-25).
 */
export function StaffTable({ accounts, extra, onChanged, canManage, canReset = false, canMove = false, onUnlock, caption = 'Staff accounts', townInName = false }) {
  const [slip, setSlip] = useState(null);
  const [moving, setMoving] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [busy, setBusy] = useState('');
  const [page, setPage] = useState(1);
  const opened = openId && accounts.find((a) => a.id === openId);
  // Ten a page (mock defense notes, 2026-10-23). A filter or search that
  // shortens the list keeps the page in range.
  const pages = Math.max(1, Math.ceil(accounts.length / PAGE_SIZE));
  const at = Math.min(page, pages);
  const rows = accounts.slice((at - 1) * PAGE_SIZE, at * PAGE_SIZE);

  const act = async (id, fn) => {
    setBusy(id);
    try { await fn(); } catch (err) {
      notify(err?.response?.data?.message || 'Couldn’t reach the server. Try again.', { tone: 'danger' });
    }
    setBusy('');
  };

  const reset = (a) => act(a.id, async () => {
    const ok = await confirmAction(
      `Make a new temporary password for ${a.username}? Their current password stops working and they’re signed out everywhere.`,
      { title: 'Reset the password?', confirmText: 'Reset password', tone: 'warning' },
    );
    if (!ok) return;
    const data = await accountsAPI.resetPassword(a.id);
    onChanged(data.account);
    setSlip({ kind: 'reset', ...data });
  });

  const toggle = (a) => act(a.id, async () => {
    const off = a.active;
    const ok = await confirmAction(
      off
        ? `Delete ${a.username}? They’re signed out and can’t sign in. The account moves to the archive with its history, where the super admin can restore it.`
        : `Restore ${a.username}? It comes out of the archive and they can sign in again with their password.`,
      { title: off ? 'Delete this account?' : 'Restore this account?', confirmText: off ? 'Delete' : 'Restore', danger: off, tone: off ? undefined : 'success' },
    );
    if (!ok) return;
    const acc = await accountsAPI.setActive(a.id, !off);
    onChanged(acc);
    notify(off ? `${a.username} was moved to the archive.` : `${a.username} is back and can sign in.`, { tone: 'success', title: off ? 'Deleted' : 'Restored' });
  });

  const unlock = (a) => act(a.id, async () => {
    await onUnlock(a);
    notify(`${a.username} can sign in again.`, { tone: 'success' });
  });

  if (!accounts.length) return null;
  return (
    <>
      <Table
        caption={caption}
        head={<>
          <Th>Account</Th>
          {!townInName && <Th>Municipality</Th>}
          <Th>Status</Th>
          {extra && <Th align="right">{extra.head}</Th>}
          <Th>Last activity</Th>
          <Th align="right">Actions</Th>
        </>}
      >
        {rows.map((a) => {
          const mine = canManage(a);
          return (
            <Row key={a.id} onOpen={() => setOpenId(a.id)} label={`Details of ${a.username}`}>
              <Td>
                <div style={s.person}>
                  <Avatar name={a.username} size={32} />
                  <div style={{ minWidth: 0 }}>
                    <div style={s.personName}>{a.username}</div>
                    <div style={s.personSub}>
                      {townInName ? (a.municipality || 'No municipality') : ROLE_NAME[a.role]}{ownName(a) ? ` · ${ownName(a)}` : ''}
                    </div>
                  </div>
                </div>
              </Td>
              {!townInName && <Td muted={!a.municipality}>{a.municipality || (a.role === 'moderator' ? 'None assigned' : 'All of Bulacan')}</Td>}
              <Td><StaffStatus status={a.status} /></Td>
              {extra && <Td align="right">{extra.cell(a)}</Td>}
              <Td>
                <div style={s.personName}>{a.lastLoginAt ? <>Signed in <span className="sa-mono">{timeAgo(a.lastLoginAt)}</span></> : 'Never signed in'}</div>
                {/* The rows have room (icon actions), so the whole line
                    shows instead of being cut at 180 px. */}
                <div style={{ ...s.personSub, whiteSpace: 'normal' }}>
                  {a.lastChange
                    ? <span title={a.lastChange.summary}>{actionLabel(a.lastChange.action).label} <span className="sa-mono">{fmtDay(a.lastChange.at)}</span> by {a.lastChange.by || 'the system'}</span>
                    : <span>Made <span className="sa-mono">{fmtDay(a.createdAt)}</span>{a.createdBy ? ` by ${a.createdBy}` : ''}</span>}
                </div>
              </Td>
              <Td align="right">
                {/* One row of square icon buttons, each coloured by what it
                    does, named for screen readers and in the tooltip (the
                    user's reference console does the same). */}
                <div style={{ ...s.cellActions, flexWrap: 'nowrap' }}>
                  <Button icon="history" style={sq} onClick={() => setOpenId(a.id)} aria-label={`Details and history of ${a.username}`} title="Details and history" />
                  {onUnlock && a.status === 'locked' && (
                    <Button variant="success" icon="unlock" style={sq} disabled={busy === a.id} onClick={() => unlock(a)}
                      aria-label={`Unlock ${a.username}`} title="Unlock" />
                  )}
                  {mine && a.active && <>
                    {canReset && (
                      <Button variant="warning" icon="key" style={sq} disabled={busy === a.id} onClick={() => reset(a)}
                        aria-label={`Reset the password of ${a.username}`} title="Reset password" />
                    )}
                    {canMove && a.role === 'moderator' && (
                      <Button variant="subtle" icon="move" style={sq} disabled={busy === a.id} onClick={() => setMoving(a)}
                        aria-label={`Move ${a.username} to another municipality`} title="Move to another municipality" />
                    )}
                    <Button variant="danger" icon="trash" style={sq} disabled={busy === a.id} onClick={() => toggle(a)}
                      aria-label={`Delete ${a.username}`} title="Delete" />
                  </>}
                  {mine && !a.active && (
                    <Button size="sm" variant="success" icon="rotate-ccw" style={{ whiteSpace: 'nowrap' }} disabled={busy === a.id} onClick={() => toggle(a)}
                      aria-label={`Restore ${a.username}`}>
                      {busy === a.id ? 'Restoring…' : 'Restore'}
                    </Button>
                  )}
                </div>
              </Td>
            </Row>
          );
        })}
      </Table>
      {pages > 1 && (
        <div style={f.pageFoot}>
          <span style={s.itemDate}>{(at - 1) * PAGE_SIZE + 1}–{(at - 1) * PAGE_SIZE + rows.length} of {accounts.length}</span>
          <Pagination page={at} pages={pages} onChange={setPage} label={`${caption} pages`} />
        </div>
      )}

      {slip && (
        <CredentialSlip kind={slip.kind} account={slip.account} tempPassword={slip.tempPassword}
          expiresAt={slip.tempPasswordExpiresAt} onClose={() => setSlip(null)} />
      )}
      {moving && (
        <MoveDialog account={moving} accounts={accounts} onClose={() => setMoving(null)}
          onMoved={(acc) => { onChanged(acc); setMoving(null); }} />
      )}
      {opened && <AccountDrawer account={opened} onClose={() => setOpenId(null)} />}
    </>
  );
}

function MoveDialog({ account, accounts, onClose, onMoved }) {
  const [town, setTown] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const taken = new Set(accounts.filter((a) => a.role === 'moderator' && a.active && a.id !== account.id).map((a) => a.municipality.toLowerCase()));

  const save = async () => {
    if (!town) { setError('Choose a municipality.'); return; }
    setSaving(true);
    try {
      onMoved(await accountsAPI.move(account.id, town));
      notify(`${account.username} now looks after ${town}.`, { tone: 'success' });
    } catch (err) {
      setError(err?.response?.data?.message || 'Couldn’t reach the server. Try again.');
    }
    setSaving(false);
  };

  return (
    <div style={f.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={f.dialog} role="dialog" aria-modal="true" aria-labelledby="move-title">
        <h2 id="move-title" style={f.dialogTitle}>Move {account.username} to another municipality</h2>
        <p style={f.lead}>
          They look after {account.municipality || 'no municipality'} now. A moderator with requests still waiting can’t move until
          those are decided. The username stays the same.
        </p>
        <label htmlFor="move-town" style={s.panelLabel}>New municipality</label>
        <select id="move-town" value={town} onChange={(e) => { setTown(e.target.value); setError(''); }} style={s.select} autoFocus>
          <option value="">Choose…</option>
          {BULACAN_MUNICIPALITIES.filter((m) => m.toLowerCase() !== (account.municipality || '').toLowerCase()).map((m) => {
            const has = taken.has(m.toLowerCase());
            return <option key={m} value={m} disabled={has}>{has ? `${m} (has a moderator)` : m}</option>;
          })}
        </select>
        {error && <p style={f.error}><Icon name="alert-circle" size={13} /> {error}</p>}
        <div style={{ ...s.buttonRow, justifyContent: 'flex-end' }}>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Moving…' : 'Move'}</Button>
        </div>
      </div>
    </div>
  );
}

export function HistoryList({ entries }) {
  const paged = usePaged(entries);
  if (!entries.length) return <EmptyState icon="history" title="Nothing yet" subtitle="Changes and sign-ins show here." />;
  return (
    <Paged {...paged} label="History pages">
    <ol style={f.history}>
      {paged.rows.map((e) => {
        const a = actionLabel(e.action);
        return (
          <li key={e._id} style={f.historyItem}>
            <span style={f.historyIcon}><Icon name={a.icon} size={14} /></span>
            <div style={{ minWidth: 0 }}>
              <div style={f.historyTop}>
                <strong style={{ color: t.textPrimary }}>{a.label}</strong>
                <span style={s.itemDate}>{fmtDateTime(e.at)}</span>
              </div>
              {e.summary && e.summary !== a.label && <div style={f.historyText}>{e.summary}</div>}
              <div style={s.itemDate}>
                {e.actor?.username ? `by ${e.actor.username}${e.actor.role ? ` (${ROLE_NAME[e.actor.role] || e.actor.role})` : ''}` : 'by someone signing in'}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
    </Paged>
  );
}

// One account's details and what was done to it. The row it came from stays
// current (live updates), and the history is asked again when it changes.
function AccountDrawer({ account: a, onClose }) {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState('');
  const changedAt = a.lastChange?.at;
  useEffect(() => {
    let live = true;
    accountsAPI.history(a.id)
      .then((rows) => { if (live) { setEntries(rows); setError(''); } })
      .catch(() => { if (live) setError('Couldn’t load the history.'); });
    return () => { live = false; };
  }, [a.id, changedAt, a.lastLoginAt]);
  return (
    <Drawer title={a.username} subtitle={`${ROLE_NAME[a.role]}${a.municipality ? ` · ${a.municipality}` : ''}`} onClose={onClose}>
      <div style={d.stack}>
        <div><StaffStatus status={a.status} /></div>
        <Facts items={[
          ['Kind of account', ROLE_NAME[a.role]],
          ['Municipality', a.municipality || (a.role === 'moderator' ? 'None assigned' : 'All of Bulacan')],
          ['Name', ownName(a)],
          ['Made', `${fmtDay(a.createdAt)}${a.createdBy ? ` by ${a.createdBy}` : ''}`],
          ['Last sign-in', a.lastLoginAt ? fmtDateTime(a.lastLoginAt) : 'Never'],
          ['Temporary password ends', a.mustChangePassword && a.tempPasswordExpiresAt ? fmtDateTime(a.tempPasswordExpiresAt) : null],
          // The Moderators page's rows carry the requests each has sent.
          ['Requests sent', a.requests ? `${a.requests.total ?? 0}${a.requests.pending ? ` · ${a.requests.pending} waiting` : ''}` : null],
        ]} />
        <DetailSection title="History">
          {error ? <p style={f.error}>{error}</p> : entries ? <HistoryList entries={entries} /> : <Loading label="Loading history…" kind="rows" media="avatar" rows={4} flush />}
        </DetailSection>
      </div>
    </Drawer>
  );
}

const f = {
  card:     { ...s.item, padding: '18px 20px' },
  title:    { fontSize: 16, fontWeight: 700, margin: 0, color: t.textPrimary },
  lead:     { fontSize: 13, color: t.textSecondary, lineHeight: 1.5, margin: '4px 0 14px', maxWidth: 680 },
  grid:     { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px 16px' },
  hint:     { fontSize: 12, color: t.textMuted, margin: '5px 0 0' },
  error:    { fontSize: 12, color: t.danger, margin: '5px 0 0', display: 'flex', alignItems: 'center', gap: 4 },
  invalid:  { border: `1px solid ${t.danger}` },
  pageFoot: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 12 },
  // Shown, not typed: a moderator's username.
  fixed:    { background: t.divider, color: t.textSecondary, cursor: 'not-allowed', fontWeight: 600 },
  segment: { display: 'flex', gap: 2, padding: 3, border: `1px solid ${t.border}`, borderRadius: radius.md, background: t.cardBg },
  segBtn:   { flex: 1, padding: '7px 12px', border: 'none', borderRadius: radius.sm, background: 'transparent', color: t.textSecondary, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  segOn:    { background: t.brandSoft, color: t.brand },
  overlay:  { position: 'fixed', inset: 0, background: t.overlay, zIndex: 1600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  dialog:   { width: '100%', maxWidth: 420, background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: radius.xl, boxShadow: shadow.lg, padding: '22px 24px 20px', boxSizing: 'border-box' },
  dialogTitle: { ...type.dialogTitle, color: t.textPrimary, margin: '0 0 6px' },
  history:  { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 14 },
  historyItem: { display: 'flex', gap: 12, alignItems: 'flex-start' },
  historyIcon: { width: 28, height: 28, borderRadius: '50%', background: t.sidebarBg, border: `1px solid ${t.border}`, display: 'grid', placeItems: 'center', color: t.textSecondary, flexShrink: 0 },
  historyTop: { display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', fontSize: 13.5 },
  historyText: { fontSize: 13, color: t.textSecondary, marginTop: 2, overflowWrap: 'anywhere' },
};

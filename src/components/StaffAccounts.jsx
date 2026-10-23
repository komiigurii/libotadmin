import { useEffect, useState } from 'react';
import { accountsAPI } from '../api/api';
import { Button, StatusPill, Table, Th, Td, Avatar, Loading, EmptyState, pageStyles as s } from './Layout';
import { notify, confirmAction } from './AppAlert';
import CredentialSlip from './CredentialSlip';
import Drawer from './Drawer';
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
 *   - AddAccountForm: role (when there's a choice), municipality, username.
 *     No name and no password: the server makes a temporary password, shown
 *     once on the credential slip.
 *   - StaffTable: each account's status, last sign-in and "Last changed by …",
 *     with Reset password (a new slip), Deactivate/Reactivate, Move town,
 *     History, and Unlock on a locked row (the super admin's page only).
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

// The pattern the existing accounts use: "malolosmod", "sanjosedelmontemod".
const suggestUsername = (town) => `${town.normalize('NFD').replace(/[^A-Za-z0-9]/g, '').toLowerCase()}mod`;

/**
 * roles: which kinds this person may make (['admin','moderator'] for the super
 * admin, ['moderator'] for an admin). accounts: the list already shown, so
 * taken usernames and towns are caught before sending.
 */
export function AddAccountForm({ roles, accounts, onCancel, onMade }) {
  const [role, setRole] = useState(roles.includes('moderator') ? 'moderator' : roles[0]);
  const [municipality, setMunicipality] = useState('');
  const [username, setUsername] = useState('');
  const [edited, setEdited] = useState(false);
  const [tried, setTried] = useState(false);
  const [serverError, setServerError] = useState({});
  const [saving, setSaving] = useState(false);

  const name = username.trim().toLowerCase();
  const takenTowns = new Set(accounts.filter((a) => a.role === 'moderator' && a.active).map((a) => a.municipality.toLowerCase()));
  const errors = {};
  if (role === 'moderator') {
    if (!municipality) errors.municipality = 'Choose the municipality this moderator looks after.';
    else if (takenTowns.has(municipality.toLowerCase())) errors.municipality = `${municipality} already has a moderator account.`;
  }
  const uProblem = usernameProblem(name);
  if (uProblem) errors.username = uProblem;
  else if (accounts.some((a) => a.username === name)) errors.username = `The username “${name}” is taken.`;
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
        No name or password to type: a moderator is named after their town, and the server makes a temporary password
        for you to hand over on a slip. They choose their own at the first sign-in.
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
              onChange={(e) => {
                setMunicipality(e.target.value);
                setServerError({});
                if (!edited) setUsername(e.target.value ? suggestUsername(e.target.value) : '');
              }}
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
          <input id="acct-username" className="modern-input" value={username} maxLength={30}
            autoCapitalize="none" spellCheck={false} placeholder={role === 'moderator' ? 'e.g. malolosmod' : 'e.g. phactoadmin'}
            onChange={(e) => { setUsername(e.target.value); setEdited(true); setServerError({}); }}
            style={{ ...s.select, cursor: 'text', ...invalid('username') }}
            aria-invalid={!!shown.username} aria-describedby={shown.username ? 'acct-username-err' : undefined} />
          {fieldError('username') || <p style={f.hint}>What they type to sign in. It can’t be changed later.</p>}
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
 * (the Moderators page adds "Requests sent"). onChanged(account) replaces a row.
 * canManage(account): whether this person may act on that row.
 * onUnlock(account): given only to the super admin, who unlocks a locked row
 * of any role (user rule 2026-10-23).
 */
export function StaffTable({ accounts, extra, onChanged, canManage, onUnlock, caption = 'Staff accounts', townInName = false }) {
  const [slip, setSlip] = useState(null);
  const [moving, setMoving] = useState(null);
  const [historyOf, setHistoryOf] = useState(null);
  const [busy, setBusy] = useState('');

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
        ? `Deactivate ${a.username}? They’re signed out and can’t sign in until the account is reactivated. The account and its history are kept.`
        : `Reactivate ${a.username}? They can sign in again with their password.`,
      { title: off ? 'Deactivate this account?' : 'Reactivate this account?', confirmText: off ? 'Deactivate' : 'Reactivate', danger: off },
    );
    if (!ok) return;
    onChanged(await accountsAPI.setActive(a.id, !off));
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
        {accounts.map((a) => {
          const mine = canManage(a);
          return (
            <tr key={a.id}>
              <Td>
                <div style={s.person}>
                  <Avatar name={a.username} size={32} />
                  <div style={{ minWidth: 0 }}>
                    <div style={s.personName}>{a.username}</div>
                    <div style={s.personSub}>
                      {townInName ? (a.municipality || 'No town') : ROLE_NAME[a.role]}{ownName(a) ? ` · ${ownName(a)}` : ''}
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
                  <Button icon="history" style={sq} onClick={() => setHistoryOf(a)} aria-label={`History of ${a.username}`} title="History" />
                  {onUnlock && a.status === 'locked' && (
                    <Button variant="success" icon="unlock" style={sq} disabled={busy === a.id} onClick={() => unlock(a)}
                      aria-label={`Unlock ${a.username}`} title="Unlock" />
                  )}
                  {mine && <>
                    <Button variant="warning" icon="key" style={sq} disabled={busy === a.id || !a.active} onClick={() => reset(a)}
                      aria-label={`Reset the password of ${a.username}`} title="Reset password" />
                    {a.role === 'moderator' && (
                      <Button variant="subtle" icon="move" style={sq} disabled={busy === a.id || !a.active} onClick={() => setMoving(a)}
                        aria-label={`Move ${a.username} to another town`} title="Move to another town" />
                    )}
                    <Button variant={a.active ? 'danger' : 'success'} icon={a.active ? 'user-minus' : 'user-check'} style={sq}
                      disabled={busy === a.id} onClick={() => toggle(a)}
                      aria-label={`${a.active ? 'Deactivate' : 'Reactivate'} ${a.username}`} title={a.active ? 'Deactivate' : 'Reactivate'} />
                  </>}
                </div>
              </Td>
            </tr>
          );
        })}
      </Table>

      {slip && (
        <CredentialSlip kind={slip.kind} account={slip.account} tempPassword={slip.tempPassword}
          expiresAt={slip.tempPasswordExpiresAt} onClose={() => setSlip(null)} />
      )}
      {moving && (
        <MoveDialog account={moving} accounts={accounts} onClose={() => setMoving(null)}
          onMoved={(acc) => { onChanged(acc); setMoving(null); }} />
      )}
      {historyOf && <HistoryDrawer account={historyOf} onClose={() => setHistoryOf(null)} />}
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
        <h2 id="move-title" style={f.dialogTitle}>Move {account.username} to another town</h2>
        <p style={f.lead}>
          They look after {account.municipality || 'no town'} now. A moderator with requests still waiting can’t move until
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
  if (!entries.length) return <EmptyState icon="history" title="Nothing yet" subtitle="Changes and sign-ins show here." />;
  return (
    <ol style={f.history}>
      {entries.map((e) => {
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
  );
}

function HistoryDrawer({ account, onClose }) {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    accountsAPI.history(account.id)
      .then((rows) => { if (live) setEntries(rows); })
      .catch(() => { if (live) setError('Couldn’t load the history.'); });
    return () => { live = false; };
  }, [account.id]);
  return (
    <Drawer title={`History of ${account.username}`} subtitle={`${ROLE_NAME[account.role]}${account.municipality ? ` · ${account.municipality}` : ''} · made ${fmtDay(account.createdAt)}`} onClose={onClose}>
      {error ? <p style={f.error}>{error}</p> : entries ? <HistoryList entries={entries} /> : <Loading label="Loading history…" />}
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
  segment:  { display: 'flex', gap: 2, padding: 3, border: `1px solid ${t.border}`, borderRadius: radius.md, background: t.cardBg },
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

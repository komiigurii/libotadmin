import { useEffect, useMemo, useState } from 'react';
import { moderatorsAPI } from '../api/api';
import {
  Page, PageHeader, Toolbar, SearchInput, Table, Th, Td, Button, StatusPill,
  Loading, EmptyState, ErrorBanner, Avatar, pageStyles as s,
} from '../components/Layout';
import { notify } from '../components/AppAlert';
import Icon from '../components/Icon';
import { theme as t } from '../theme';
import { fmtDay } from '../utils/format';
import { BULACAN_MUNICIPALITIES } from '../utils/municipalities';

// Moderators — every moderator account, for the administrator (QA 2026-10-16:
// "makita ni PHACTO yung mga mod accounts (si admin gagawa ng mod accounts)").
// Who they are, the municipality each looks after, how many requests they have
// sent; and "Add moderator" makes a new account (POST /api/admin/moderators).

export default function Moderators() {
  const [mods,    setMods]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [search,  setSearch]  = useState('');
  const [adding,  setAdding]  = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setMods(await moderatorsAPI.getAll());
    } catch {
      setError('Couldn’t load the moderator accounts.');
      setMods([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return mods;
    return mods.filter((m) => [m.name, m.username, m.email, m.municipality].some((v) => (v || '').toLowerCase().includes(q)));
  }, [mods, search]);

  const towns = new Set(mods.map((m) => m.municipality).filter(Boolean)).size;

  return (
    <Page>
      <PageHeader
        title="Moderators"
        count={mods.length}
        subtitle={`The LGU moderator accounts${towns ? `, covering ${towns} ${towns === 1 ? 'municipality' : 'municipalities'}` : ''}. Each one can only propose changes to spots in their own municipality, and every change waits in the Approval Queue.`}
        actions={<>
          <Button icon="refresh-cw" onClick={load} disabled={loading}>Refresh</Button>
          {!adding && <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>Add moderator</Button>}
        </>}
      />

      {error && <ErrorBanner onDismiss={() => setError('')}>{error}</ErrorBanner>}

      {adding && (
        <AddModerator
          onCancel={() => setAdding(false)}
          onCreated={() => { setAdding(false); load(); }}
        />
      )}

      {mods.length > 0 && (
        <Toolbar>
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, username or municipality…"
          />
        </Toolbar>
      )}

      {loading ? (
        <Loading label="Loading moderator accounts…" />
      ) : mods.length === 0 ? (
        <EmptyState icon="users" title="No moderator accounts" subtitle="Use Add moderator to make the first one." />
      ) : visible.length === 0 ? (
        <EmptyState icon="users" title="No moderators match" subtitle="Try a different name or municipality." />
      ) : (
        <Table
          caption="Moderator accounts"
          head={<>
            <Th>Moderator</Th>
            <Th>Username</Th>
            <Th>Municipality</Th>
            <Th align="right">Requests sent</Th>
            <Th align="right">Account made</Th>
          </>}
        >
          {visible.map((m) => (
            <tr key={m.id}>
              <Td>
                <div style={s.person}>
                  <Avatar name={m.name} size={32} />
                  <div style={{ minWidth: 0 }}>
                    <div style={s.personName}>{m.name}</div>
                    <div style={s.personSub}>{m.email}</div>
                  </div>
                </div>
              </Td>
              <Td>{m.username || '—'}</Td>
              <Td muted={!m.municipality}>{m.municipality || 'None assigned'}</Td>
              <Td align="right">
                <div style={s.pillStack}>
                  <span>{m.requests.total}</span>
                  {m.requests.pending > 0 && (
                    <StatusPill tone="warning" icon="clock">{m.requests.pending} waiting</StatusPill>
                  )}
                </div>
              </Td>
              <Td align="right" muted>{m.createdAt ? fmtDay(m.createdAt) : '—'}</Td>
            </tr>
          ))}
        </Table>
      )}
    </Page>
  );
}

// Same rules as the server (routes/adminUsers.js), so most mistakes show
// before sending.
const PASSWORD_MIN = 12;
function checkModerator(f) {
  const e = {};
  if (f.name.trim().length < 2) e.name = 'Enter the office or person’s name.';
  if (!f.municipality) e.municipality = 'Choose the municipality this moderator looks after.';
  if (!/^[a-z0-9._-]{3,30}$/.test(f.username.trim().toLowerCase())) e.username = 'Use 3 to 30 lowercase letters, numbers, dots, dashes or underscores.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'Enter a valid email address.';
  if (f.password.length < PASSWORD_MIN) e.password = `At least ${PASSWORD_MIN} characters.`;
  return e;
}

// The pattern the existing accounts use: "malolosmod", "sanjosedelmontemod".
const suggestUsername = (town) => `${town.normalize('NFD').replace(/[^A-Za-z0-9]/g, '').toLowerCase()}mod`;

// 16 characters from an alphabet without look-alikes (no 0/O, 1/l/I).
function generatePassword() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => abc[b % abc.length]).join('');
}

function AddModerator({ onCancel, onCreated }) {
  const [form, setForm] = useState({ name: '', municipality: '', username: '', email: '', password: '' });
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [tried, setTried] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const errors = { ...(tried ? checkModerator(form) : {}), ...serverErrors };
  const set = (key) => (e) => {
    const value = e.target.value;
    const refills = key === 'municipality' && !usernameEdited;
    setServerErrors((prev) => ({ ...prev, [key]: undefined, ...(refills ? { username: undefined } : null) }));
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // Fills in the usual username for the town until it's typed over.
      if (refills) next.username = value ? suggestUsername(value) : '';
      return next;
    });
    if (key === 'username') setUsernameEdited(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(checkModerator(form)).length) return;
    setSaving(true);
    try {
      const data = await moderatorsAPI.create({ ...form, username: form.username.trim().toLowerCase() });
      const m = data.moderator;
      notify(
        `Account made for ${m.municipality}: username “${m.username}”. Give them the password privately; it isn’t shown again.`
          + (data.spotCount === 0 ? ` ${m.municipality} has no spots yet, so their list starts empty.` : ''),
        { tone: 'success' },
      );
      onCreated();
    } catch (err) {
      const body = err?.response?.data;
      if (body?.field) setServerErrors({ [body.field]: body.message });
      else notify(body?.message || 'Couldn’t reach the server. Try again.', { tone: 'danger' });
    }
    setSaving(false);
  };

  const field = (key, label, input, hint) => (
    <div style={add.field}>
      <label htmlFor={`mod-${key}`} style={s.panelLabel}>{label}</label>
      {input}
      {errors[key]
        ? <p id={`mod-${key}-err`} style={add.error}><Icon name="alert-circle" size={13} /> {errors[key]}</p>
        : hint && <p style={add.hint}>{hint}</p>}
    </div>
  );
  const inputProps = (key) => ({
    id: `mod-${key}`, value: form[key], onChange: set(key), className: 'modern-input',
    style: { ...s.select, cursor: 'text', ...(errors[key] ? add.invalid : null) },
    'aria-invalid': !!errors[key], 'aria-describedby': errors[key] ? `mod-${key}-err` : undefined,
  });

  return (
    <form style={add.card} onSubmit={submit} noValidate aria-labelledby="add-mod-title">
      <h2 id="add-mod-title" style={add.title}>New moderator account</h2>
      <p style={add.lead}>
        A moderator looks after the spots of one municipality: they propose changes, and you approve them in the
        Approval Queue. They sign in here with the username and password you set.
      </p>
      <div style={add.grid}>
        {field('name', 'Name', <input {...inputProps('name')} maxLength={80} placeholder="e.g. Malolos Tourism Office" />)}
        {field('municipality', 'Municipality',
          <select {...inputProps('municipality')} style={{ ...s.select, ...(errors.municipality ? add.invalid : null) }}>
            <option value="">Choose…</option>
            {BULACAN_MUNICIPALITIES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>)}
        {field('username', 'Username',
          <input {...inputProps('username')} maxLength={30} autoCapitalize="none" spellCheck={false} placeholder="e.g. malolosmod" />,
          'What they type to sign in.')}
        {field('email', 'Email', <input {...inputProps('email')} type="email" maxLength={254} placeholder="tourism@example.gov.ph" />)}
        {field('password', 'Password',
          <div style={add.passwordRow}>
            <input {...inputProps('password')} type={showPassword ? 'text' : 'password'} autoComplete="new-password" maxLength={128} />
            <Button size="sm" icon={showPassword ? 'eye-off' : 'eye'} onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'} />
            <Button size="sm" icon="lock" onClick={() => { setForm((p) => ({ ...p, password: generatePassword() })); setShowPassword(true); setServerErrors((p) => ({ ...p, password: undefined })); }}>
              Generate
            </Button>
          </div>,
          `At least ${PASSWORD_MIN} characters. Give it to the moderator privately.`)}
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

const add = {
  card:        { ...s.item, padding: '18px 20px', marginBottom: 18 },
  title:       { fontSize: 16, fontWeight: 700, margin: 0, color: t.textPrimary },
  lead:        { fontSize: 13, color: t.textSecondary, lineHeight: 1.5, margin: '4px 0 14px', maxWidth: 680 },
  grid:        { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px 16px' },
  field:       { minWidth: 0 },
  passwordRow: { display: 'flex', gap: 6, alignItems: 'center' },
  hint:        { fontSize: 12, color: t.textMuted, margin: '5px 0 0' },
  error:       { fontSize: 12, color: t.danger, margin: '5px 0 0', display: 'flex', alignItems: 'center', gap: 4 },
  invalid:     { border: `1px solid ${t.danger}` },
};

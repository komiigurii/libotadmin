import { useEffect, useRef, useState } from 'react';
import { accountsAPI, bannedAccountsAPI } from '../api/api';
import { useLiveTick } from '../api/live';
import Drawer from './Drawer';
import { notify, confirmAction, promptAction } from './AppAlert';
import { Button, Loading, StatusPill } from './Layout';
import { Facts, DetailSection, VisitList, detailStyles as d } from './Details';
import { HistoryList } from './StaffAccounts';
import { theme as t } from '../theme';
import { fmtDay, fmtNum, timeAgo } from '../utils/format';

/*
 * One traveler's overview, opened from any table of travelers (2026-10-23):
 * Accounts (super admin), Traveler Progress, Inactive Accounts and
 * Suspensions & Bans (admins). Their standing, progress, latest visits and
 * record; the super admin also gets the actions staff took on the account.
 *
 * children: what the opening page adds under the standing, above the facts
 * (a ban and its appeal). archivedAction(traveler): a button beside the "In
 * the archive" line (the super admin's Restore). moderate: Warn, Suspend and
 * Ban along the bottom (User Management, 2026-10-25), on the same ladders as a
 * review's actions; the backend decides each step's length.
 */

// An account with nothing against it shows no pill ("Good standing" removed,
// user request 2026-10-25).
const STANDING = {
  muted:     { tone: 'warning', icon: 'pause',  label: 'Muted' },
  suspended: { tone: 'danger',  icon: 'pause',  label: 'Suspended' },
  banned:    { tone: 'danger',  icon: 'slash',  label: 'Banned' },
  inactive:  { tone: 'neutral', icon: 'clock',  label: 'Inactive (archived)' },
};
export const Standing = ({ status }) => {
  const st = STANDING[status];
  return st ? <StatusPill tone={st.tone} icon={st.icon}>{st.label}</StatusPill> : null;
};

const ARCHIVE_NAME = { ban: 'banned', inactivity: 'inactive', deleted: 'deleted by the traveler' };

export default function TravelerDrawer({ traveler, onClose, archivedAction, moderate, children }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  // Bumped after an action here, so the standing changes without waiting
  // for the live update.
  const [acted, setActed] = useState(0);
  // Kept current while open; a failed live reload keeps what's shown.
  const changed = useLiveTick(['travelers', 'progress', 'reviews']);
  const seen = useRef(`${changed}|0`);
  useEffect(() => {
    let live = true;
    const key = `${changed}|${acted}`;
    const quiet = seen.current !== key;
    seen.current = key;
    accountsAPI.getTraveler(traveler.id)
      .then((r) => { if (live) { setData(r); setError(''); } })
      .catch((err) => {
        if (!live || quiet) return;
        setError(err?.response?.status === 404 ? 'This account is no longer in the app.' : 'Couldn’t load this traveler.');
      });
    return () => { live = false; };
  }, [traveler.id, changed, acted]);

  const u = data?.traveler;
  const footer = moderate && u
    ? <ModerationBar u={u} name={traveler.name || 'this traveler'} onDone={() => setActed((n) => n + 1)} />
    : null;

  return (
    <Drawer title={traveler.name || 'Traveler'} subtitle={traveler.email} onClose={onClose} footer={footer}>
      <div style={d.stack}>
        {u && (STANDING[u.status] || u.titleName) && (
          <div style={x.pills}>
            <Standing status={u.status} />
            {u.titleName && <StatusPill tone="info" icon="star">{u.titleName}</StatusPill>}
          </div>
        )}
        {u?.archiveReason && (
          <div style={d.strip}>
            <span style={{ minWidth: 0, flex: 1 }}>
              <strong style={{ color: t.textPrimary }}>In the archive</strong> since <span className="sa-mono">{fmtDay(u.archivedAt)}</span>
              {' '}({ARCHIVE_NAME[u.archiveReason] || u.archiveReason}): hidden from the leaderboard, reviews and ratings.
            </span>
            {archivedAction?.(u)}
          </div>
        )}
        {/* The opening page's own part shows at once, from its row. */}
        {children}
        {error ? <p style={{ color: t.danger, margin: 0 }}>{error}</p> : !u ? <Loading label="Loading the traveler…" kind="facts" rows={10} /> : (
          <>
            <Facts items={[
              ['Joined', fmtDay(u.createdAt)],
              ['Last active', u.lastActiveAt ? timeAgo(u.lastActiveAt) : 'Never'],
              ['Lives in', u.municipality || '—'],
              ['Points', fmtNum(u.points)],
              ['Spots visited', fmtNum(u.counts.visits)],
              ['Spot badges', fmtNum(u.counts.badges)],
              ['Municipalities finished', u.counts.towns != null ? fmtNum(u.counts.towns) : null],
              ['Missions done', u.counts.missions != null ? fmtNum(u.counts.missions) : null],
              ['Reviews', fmtNum(u.counts.reviews)],
              ['Days active', fmtNum(u.counts.activeDays)],
            ]} />

            <DetailSection title="Warnings, suspensions and bans">
              <ModerationHistory items={u.moderation || []} />
            </DetailSection>

            {u.recentVisits?.length > 0 && (
              <DetailSection title={u.counts.visits > u.recentVisits.length ? `Latest ${u.recentVisits.length} visits` : 'Visits'}>
                <VisitList visits={u.recentVisits} />
              </DetailSection>
            )}

            {data.entries && (
              <DetailSection title="Actions on this account">
                <HistoryList entries={data.entries} />
              </DetailSection>
            )}
            <p style={d.note}>Days active are counted from 21 Oct 2026, when the system started keeping them.</p>
          </>
        )}
      </div>
    </Drawer>
  );
}

// The whole record, newest first (user request 2026-10-25): each warning,
// suspension and ban with its reason, who gave it and how long it ran, and
// when one was lifted. Built by the backend (routes/accounts.js).
const HISTORY_HUE = { warn: t.warning, suspend: t.danger, ban: t.danger, lift: t.success };
const LIFT_TITLE = { unban: 'Ban lifted', appeal: 'Ban lifted on appeal', restore: 'Restored from the archive' };

function historyTitle(e) {
  if (e.kind === 'warn') return `Warning ${e.n}`;
  if (e.kind === 'suspend') return e.becameBan ? `Suspension ${e.n}, a permanent ban` : `Suspension ${e.n}`;
  if (e.kind === 'ban') return 'Permanent ban';
  return LIFT_TITLE[e.how] || 'Ban lifted';
}

function historyMeta(e) {
  const parts = [];
  if (e.kind === 'warn' && e.until) parts.push(`reviews muted to ${fmtDay(e.until)}`);
  if (e.kind === 'suspend' && e.until) parts.push(`suspended to ${fmtDay(e.until)}`);
  if (e.liftedAt) parts.push(`lifted ${fmtDay(e.liftedAt)}`);
  if (e.by) parts.push(`by ${e.by}`);
  return parts.join(' · ');
}

function ModerationHistory({ items }) {
  if (!items.length) return <p style={d.note}>No warnings, suspensions or bans.</p>;
  return (
    <ul style={x.history}>
      {items.map((e, i) => (
        <li key={i} style={x.entry}>
          <span style={{ ...x.dot, background: HISTORY_HUE[e.kind] }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={x.entryHead}>
              <strong style={{ color: t.textPrimary, opacity: e.liftedAt ? 0.6 : 1 }}>{historyTitle(e)}</strong>
              {e.at && <span className="sa-mono" style={x.when}>{fmtDay(e.at)}</span>}
            </div>
            {e.reason && <p style={x.reason}>{e.reason}</p>}
            {historyMeta(e) && <p style={d.note}>{historyMeta(e)}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}

// Each button asks for the reason (it's recorded, and shown on an appeal),
// then the backend takes the next step and says what it did.
const ACTIONS = [
  {
    key: 'warn', label: 'Warn', icon: 'alert-triangle', variant: 'warning', tone: 'warning',
    call: bannedAccountsAPI.warn,
    ask: (n) => `Warn ${n}? A 1st warning mutes their reviews for 7 days; every later one for 14 days. It doesn't suspend the account.`,
  },
  {
    key: 'suspend', label: 'Suspend', icon: 'clock', variant: 'warning', tone: 'warning',
    call: bannedAccountsAPI.suspend,
    ask: (n) => `Suspend ${n}? They can't use their account until it ends. A 1st suspension lasts 7 days and a 2nd 14 days; a 3rd bans them permanently instead.`,
  },
  {
    key: 'ban', label: 'Ban', icon: 'slash', variant: 'dangerSolid', danger: true,
    call: bannedAccountsAPI.ban,
    ask: (n) => `Permanently ban ${n}? Their account is archived (never deleted), and they have 30 days to appeal.`,
  },
];

function ModerationBar({ u, name, onDone }) {
  const [busy, setBusy] = useState(false);

  // A banned account can't be warned or suspended: its one action is lifting
  // the ban (2026-10-25). Suspensions and warnings are lifted on the Warned,
  // Suspended & Banned tab.
  const liftBan = async () => {
    const question = `Lift the ban on ${name}? Their account leaves the archive and opens again, and their reviews and place on the leaderboard show again.`;
    if (!(await confirmAction(question, { confirmText: 'Lift ban' }))) return;
    setBusy(true);
    try {
      const res = await bannedAccountsAPI.unban(u.id);
      notify(res?.message || 'Lifted.', { tone: 'success' });
      onDone();
    } catch (err) {
      notify(err?.response?.data?.message || 'Couldn’t lift it. Try again.', { tone: 'danger' });
    }
    setBusy(false);
  };

  if (u.status === 'banned') {
    return (
      <div style={x.actions}>
        <Button variant="subtle" icon="unlock" disabled={busy} onClick={liftBan} style={x.action}>Lift ban</Button>
      </div>
    );
  }

  const run = async (a) => {
    const reason = await promptAction(a.ask(name), {
      title: `${a.label} ${name}`,
      label: 'Reason',
      placeholder: `Why is ${name} being ${a.key === 'warn' ? 'warned' : a.key === 'ban' ? 'banned' : 'suspended'}?`,
      confirmText: a.key === 'ban' ? 'Ban permanently' : a.label,
      danger: a.danger,
      tone: a.tone,
    });
    if (reason == null) return;
    setBusy(true);
    try {
      const res = await a.call(u.id, reason);
      notify(res?.message || 'Done.', { tone: 'success' });
      onDone();
    } catch (err) {
      notify(err?.response?.data?.message || 'Couldn’t do that. Try again.', { tone: 'danger' });
    }
    setBusy(false);
  };

  return (
    <div style={x.actions}>
      {ACTIONS.map((a) => (
        <Button key={a.key} variant={a.variant} icon={a.icon} disabled={busy} onClick={() => run(a)} style={x.action}>
          {a.label}
        </Button>
      ))}
    </div>
  );
}

const x = {
  pills:   { display: 'flex', gap: 6, flexWrap: 'wrap' },
  history: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' },
  entry:   { display: 'flex', gap: 10, padding: '8px 0', borderBottom: `1px solid ${t.divider}`, fontSize: 13.5 },
  dot:     { width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 6 },
  entryHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' },
  when:    { color: t.textSecondary, whiteSpace: 'nowrap', fontSize: 13 },
  reason:  { margin: '2px 0', color: t.textSecondary, lineHeight: 1.5, overflowWrap: 'anywhere' },
  actions: { display: 'flex', gap: 8 },
  action:  { flex: 1, justifyContent: 'center' },
};

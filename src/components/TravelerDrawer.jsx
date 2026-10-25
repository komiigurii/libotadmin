import { useEffect, useRef, useState } from 'react';
import { accountsAPI, bannedAccountsAPI } from '../api/api';
import { useLiveTick } from '../api/live';
import Drawer from './Drawer';
import { notify, promptAction } from './AppAlert';
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

const STANDING = {
  active:    { tone: 'success', icon: 'check',  label: 'Good standing' },
  muted:     { tone: 'warning', icon: 'pause',  label: 'Muted' },
  suspended: { tone: 'danger',  icon: 'pause',  label: 'Suspended' },
  banned:    { tone: 'danger',  icon: 'slash',  label: 'Banned' },
  inactive:  { tone: 'neutral', icon: 'clock',  label: 'Inactive (archived)' },
};
export const Standing = ({ status }) => {
  const st = STANDING[status] || STANDING.active;
  return <StatusPill tone={st.tone} icon={st.icon}>{st.label}</StatusPill>;
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
        {u && (
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

            {u.recentVisits?.length > 0 && (
              <DetailSection title={u.counts.visits > u.recentVisits.length ? `Latest ${u.recentVisits.length} visits` : 'Visits'}>
                <VisitList visits={u.recentVisits} />
              </DetailSection>
            )}

            {(u.warningHistory.length > 0 || u.suspensionHistory.length > 0) && (
              <DetailSection title="Record">
                <ul style={d.record}>
                  {u.warningHistory.map((w, i) => (
                    <li key={`w${i}`}>Warning {i + 1}, {fmtDay(w.issuedAt)}{w.reason ? `: ${w.reason}` : ''}</li>
                  ))}
                  {u.suspensionHistory.map((s, i) => (
                    <li key={`s${i}`}>Suspension {i + 1}, {fmtDay(s.issuedAt)}{s.reason ? `: ${s.reason}` : ''}</li>
                  ))}
                </ul>
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

  if (u.status === 'banned') {
    return <p style={d.note}>Banned. The ban is lifted from the Warned, Suspended &amp; Banned tab.</p>;
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
  actions: { display: 'flex', gap: 8 },
  action:  { flex: 1, justifyContent: 'center' },
};

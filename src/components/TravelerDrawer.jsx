import { useEffect, useRef, useState } from 'react';
import { accountsAPI } from '../api/api';
import { useLiveTick } from '../api/live';
import Drawer from './Drawer';
import { Loading, StatusPill } from './Layout';
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
 * the archive" line (the super admin's Restore).
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

export default function TravelerDrawer({ traveler, onClose, archivedAction, children }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  // Kept current while open; a failed live reload keeps what's shown.
  const changed = useLiveTick(['travelers', 'progress', 'reviews']);
  const seen = useRef(changed);
  useEffect(() => {
    let live = true;
    const quiet = seen.current !== changed;
    seen.current = changed;
    accountsAPI.getTraveler(traveler.id)
      .then((r) => { if (live) { setData(r); setError(''); } })
      .catch((err) => {
        if (!live || quiet) return;
        setError(err?.response?.status === 404 ? 'This account is no longer in the app.' : 'Couldn’t load this traveler.');
      });
    return () => { live = false; };
  }, [traveler.id, changed]);

  const u = data?.traveler;

  return (
    <Drawer title={traveler.name || 'Traveler'} subtitle={traveler.email} onClose={onClose}>
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
              ['Towns finished', u.counts.towns != null ? fmtNum(u.counts.towns) : null],
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

const x = {
  pills:  { display: 'flex', gap: 6, flexWrap: 'wrap' },
};

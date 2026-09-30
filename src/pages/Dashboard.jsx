import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  spotAPI, missionAPI, reportAPI, appealAPI, userProgressAPI,
} from '../api/api';
import { theme as t, radius, type } from '../theme';
import {
  Page, PageHeader, Card, Avatar, ErrorBanner, Stat, Button, ApprovalPill, pageStyles,
} from '../components/Layout';
import { fmtNum as fmt, plural, timeAgo } from '../utils/format';
import Icon from '../components/Icon';

/*
 * The landing page for both roles: what's live, what's waiting on you, and
 * how travelers are using the app.
 *
 * Every figure here is a real count from an existing endpoint. There are no
 * sparklines or "+12% this week" deltas, because no endpoint returns anything
 * over time — adding them would mean inventing a trend. If a history endpoint
 * lands on the backend, the stat tiles are where a sparkline would go.
 *
 * Each source loads independently (allSettled): one failing call blanks the
 * figure it feeds and says so, instead of blanking the dashboard.
 */

// Endpoints return a bare array, { [key]: [...] } or { data: [...] } — the
// same shapes each page's own toArray() accepts.
const listOf = (data, key) =>
  Array.isArray(data) ? data
  : Array.isArray(data?.[key]) ? data[key]
  : Array.isArray(data?.data) ? data.data
  : [];
const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

// ── Data ─────────────────────────────────────────────────────────────

// Mirrors how ModRequests.load() assembles the approval queue, so the count
// here matches the one on that page.
async function loadAdmin() {
  const [progress, spots, proposals, pendingSpots, missions, reports, appeals] =
    await Promise.allSettled([
      userProgressAPI.getAll(),
      spotAPI.getAll(),
      spotAPI.getPendingProposals(),
      spotAPI.getPending(),
      missionAPI.getProposals(),
      reportAPI.getAll({ type: 'review', status: 'pending' }),
      appealAPI.getAll('pending'),
    ]);
  const ok = (r) => r.status === 'fulfilled';
  const val = (r) => (ok(r) ? r.value : undefined);

  const approvalParts = [proposals, pendingSpots, missions];
  const approvals = approvalParts.some(ok)
    ? listOf(val(proposals), 'proposals').filter((p) => (p.status || 'pending') === 'pending').length
      + listOf(val(pendingSpots), 'items').filter((sp) => sp.pendingChange || sp.pendingDelete).length
      + listOf(val(missions), 'proposals').length
    : null;

  return {
    progress: val(progress),
    spots: ok(spots) ? listOf(val(spots), 'spots') : null,
    attention: {
      approvals,
      approvalsPartial: approvalParts.some((r) => !ok(r)) && approvals != null,
      reports: ok(reports) ? listOf(val(reports), 'reports').length : null,
      appeals: ok(appeals) ? listOf(val(appeals), 'appeals').length : null,
    },
    failed: [
      !ok(progress) && 'traveler figures',
      !ok(spots) && 'spots',
      approvalParts.some((r) => !ok(r)) && 'part of the approval queue',
      !ok(reports) && 'reported reviews',
      !ok(appeals) && 'appeals',
    ].filter(Boolean),
  };
}

// A moderator's dashboard is about their attractions and their requests —
// the same sources as My Submissions, so the two always agree.
async function loadModerator() {
  const [mySpots, myProposals, myDeletes, myChanges] =
    await Promise.allSettled([
      spotAPI.getMine(),
      spotAPI.getMyProposals(),
      spotAPI.getMyDeleteRequests(),
      spotAPI.getMyChangeRequests(),
    ]);
  const ok = (r) => r.status === 'fulfilled';
  const val = (r) => (ok(r) ? r.value : undefined);

  const spots = ok(mySpots) ? listOf(val(mySpots), 'spots') : null;
  const history = ok(myChanges) ? val(myChanges) : [];
  // Edits sent before the request history existed, still pending.
  const tracked = new Set(history.filter((c) => c.kind === 'spot-edit' && c.status === 'pending').map((c) => String(c.spotId)));

  const submissions = [
    ...history.map((c) => ({
      kind: c.kind === 'mission-location' ? 'Food spot location' : 'Spot edit',
      name: c.targetName, status: c.status, date: c.submittedAt,
    })),
    ...(spots || []).filter((sp) => sp.pendingChange && !tracked.has(String(sp._id))).map((sp) => ({
      kind: 'Spot edit', name: sp.name, status: 'pending', date: sp.pendingChange.submittedAt,
    })),
    ...listOf(val(myProposals), 'proposals').map((p) => ({
      kind: 'New spot', name: p.name, status: p.status || 'pending', date: p.submittedAt || p.createdAt,
    })),
    ...listOf(val(myDeletes), 'requests').map((d) => ({
      kind: 'Deletion', name: d.spotName, status: d.status || 'pending', date: d.submittedAt,
    })),
  ].sort((x, y) => new Date(y.date || 0) - new Date(x.date || 0));

  const sources = [myProposals, myDeletes, myChanges];
  return {
    spots,
    submissions: sources.some(ok) || spots ? submissions : null,
    failed: [
      !ok(mySpots) && 'your spots',
      !sources.every(ok) && 'some of your submissions',
    ].filter(Boolean),
  };
}

// ── Page ─────────────────────────────────────────────────────────────

export default function Dashboard() {
  const isModerator = localStorage.getItem('role') === 'moderator';
  const city = localStorage.getItem('city') || '';

  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    const next = await (isModerator ? loadModerator() : loadAdmin());
    setData(next);
    setRefreshing(false);
  }, [isModerator]);

  useEffect(() => { load(); }, [load]);

  const loading = data === null;
  const stats = data?.progress?.stats;
  const leaderboard = data?.progress?.leaderboard || [];
  const spots = data?.spots;
  // Admin only: everything waiting on a decision, or null if none of it loaded.
  const waiting = data?.attention
    ? sumKnown(Object.values(pick(data.attention, ['approvals', 'reports', 'appeals'])))
    : null;

  // Each section fades in a beat after the one before it.
  const reveal = (i) => ({ animationDelay: `${i * 70}ms` });

  return (
    <Page>
      {/* Same header as every other page — the dashboard used to have its own,
          larger one in a card. */}
      <div className="dash-reveal" style={reveal(0)}>
        <PageHeader
          eyebrow={`${greeting()} · ${new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })}`}
          title="Dashboard"
          subtitle={isModerator
            ? `The spots you look after${city ? ` in ${city}` : ''}, and where each request you’ve sent for approval stands.`
            : 'An overview of what’s live in the app, what’s waiting on you, and how travelers are using it.'}
          actions={<Button icon="refresh-cw" onClick={load} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh'}</Button>}
        />
      </div>

      {data?.failed?.length > 0 && (
        <ErrorBanner>Couldn&rsquo;t load {data.failed.join(', ')}. Everything else below is current.</ErrorBanner>
      )}

      {/* ── KPI row ── The previous numbers stay (dimmed) while a refresh runs,
          instead of flashing back to placeholders. */}
      <section
        aria-label="Key figures"
        className="dash-reveal"
        style={{ ...s.statGrid, ...reveal(1), opacity: refreshing && !loading ? 0.6 : 1, transition: 'opacity 0.2s' }}
      >
        {isModerator ? (
          <>
            <Stat icon="map-pin" label={city ? `Spots in ${city}` : 'Your spots'} to="/spots" value={loading ? '…' : fmt(spots?.length)}
              hint={loading ? null : spots ? `${fmt(spots.filter((x) => x.AR3DModelURL).length)} with an AR model` : null} />
            <Stat icon="send" label="Waiting for approval" to="/my-review-requests" value={loading ? '…' : fmt(data?.submissions?.filter((x) => x.status === 'pending').length)}
              hint={loading ? null : data?.submissions ? `${fmt(data.submissions.filter((x) => x.status === 'rejected').length)} rejected so far` : null} />
            <Stat icon="check-circle" label="Approved" to="/my-review-requests" value={loading ? '…' : fmt(data?.submissions?.filter((x) => x.status === 'approved').length)}
              hint={loading ? null : data?.submissions ? `${fmt(data.submissions.length)} requests sent in total` : null} />
          </>
        ) : (
          <>
            <Stat icon="users" label="Travelers" to="/user-progress" value={loading ? '…' : fmt(stats?.totalUsers)}
              hint={loading ? null : stats ? `${fmt(stats.activeLast7)} active this week` : null} />
            <Stat icon="map-pin" label="Spot visits" to="/user-progress" value={loading ? '…' : fmt(stats?.totalVisits)}
              hint={loading ? null : stats ? `by ${plural(stats.explorers, 'traveler')}` : null} />
            <Stat icon="image" label="Published spots" to="/spots" value={loading ? '…' : fmt(spots?.length)}
              hint={loading ? null : spots ? `across ${plural(new Set(spots.map((x) => (x.city || x.City || '').trim().toLowerCase()).filter(Boolean)).size, 'city', 'cities')}` : null} />
            <Stat icon="inbox" label="Waiting on you" to="/mod-requests"
              emphasis={waiting > 0}
              value={loading ? '…' : fmt(waiting)}
              hint="approvals, reports & appeals" />
          </>
        )}
      </section>

      {/* ── Work ── */}
      <div className="dash-split" style={s.split}>
        <div className="dash-reveal" style={reveal(2)}>
          {isModerator
            ? <SubmissionsCard submissions={data?.submissions} loading={loading} />
            : <AttentionCard attention={data?.attention} loading={loading} />}
        </div>
        <div className="dash-reveal" style={reveal(3)}>
          <QuickActions isModerator={isModerator} />
        </div>
      </div>

      {/* ── Content (+ travelers, for admins) ── */}
      {isModerator ? (
        <div className="dash-reveal" style={reveal(4)}>
          <ContentCard spots={spots} loading={loading} scope={city || 'your area'} />
        </div>
      ) : (
        <div className="dash-split" style={s.split}>
          <div className="dash-reveal" style={reveal(4)}>
            <ContentCard spots={spots} loading={loading} />
          </div>
          <div className="dash-reveal" style={reveal(5)}>
            <TopTravelers rows={leaderboard} loading={loading} failed={!loading && !data?.progress} />
          </div>
        </div>
      )}
    </Page>
  );
}

const pick = (obj = {}, keys) => Object.fromEntries(keys.map((k) => [k, obj[k]]));
// A sum that says "unknown" rather than 0 when nothing loaded.
const sumKnown = (vals) => {
  const known = vals.filter((v) => v != null);
  return known.length ? known.reduce((a, b) => a + b, 0) : null;
};

// ── Pieces ───────────────────────────────────────────────────────────

function CardTitle({ children, to, linkLabel }) {
  return (
    <div style={s.cardHead}>
      <h2 style={s.cardTitle}>{children}</h2>
      {to && (
        <Link to={to} style={s.cardLink}>
          {linkLabel} <Icon name="chevron-right" size={12} />
        </Link>
      )}
    </div>
  );
}

function CountBadge({ count, loading }) {
  if (loading) return <span style={s.badgeMuted}>…</span>;
  if (count == null) return <span style={s.badgeMuted}>Couldn&rsquo;t load</span>;
  if (count === 0) return <span style={s.badgeClear}><Icon name="check" size={11} weight="bold" /> Clear</span>;
  return <span style={s.badgeCount}>{fmt(count)} waiting</span>;
}

function AttentionCard({ attention, loading }) {
  const rows = [
    { icon: 'inbox', label: 'Approval queue', to: '/mod-requests', count: attention?.approvals,
      detail: 'New spots, edits, deletions and food spot locations from moderators' },
    { icon: 'flag', label: 'Reported reviews', to: '/reported-comments', count: attention?.reports,
      detail: 'Reviews that travelers reported from the app' },
    { icon: 'slash', label: 'Ban appeals', to: '/banned-accounts', count: attention?.appeals,
      detail: 'Suspended or banned travelers asking to come back' },
  ];
  const allClear = !loading && rows.every((r) => r.count === 0);
  return (
    <Card style={s.card}>
      <CardTitle>Needs your attention</CardTitle>
      {allClear && (
        <p style={s.allClear}><Icon name="check-circle" size={14} color={t.success} /> Nothing is waiting on you. Nice.</p>
      )}
      <ul style={s.list}>
        {rows.map((r) => (
          <li key={r.to}>
            <Link to={r.to} className="dash-link" style={s.row}>
              <span style={s.rowIcon}><Icon name={r.icon} size={16} /></span>
              <span style={s.rowText}>
                <span style={s.rowLabel}>{r.label}</span>
                <span style={s.rowDetail}>{r.detail}</span>
              </span>
              <CountBadge count={r.count} loading={loading} />
              {/* Icon doesn't forward className, and its colour must be
                  inherited for the hover rule in App.css to recolour it. */}
              <span className="dash-chevron" style={s.chevron}>
                <Icon name="chevron-right" size={13} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {attention?.approvalsPartial && (
        <p style={s.note}>Part of the approval queue didn&rsquo;t load, so its count may be low.</p>
      )}
    </Card>
  );
}

function SubmissionsCard({ submissions, loading }) {
  const recent = (submissions || []).slice(0, 5);
  return (
    <Card style={s.card}>
      <CardTitle to="/my-review-requests" linkLabel="All submissions">Your recent submissions</CardTitle>
      {loading ? (
        <p style={s.muted}>Loading…</p>
      ) : submissions == null ? (
        <p style={s.muted}>Couldn&rsquo;t load your submissions.</p>
      ) : recent.length === 0 ? (
        <p style={s.muted}>
          Nothing sent yet. Changes you make in Spot Management go to an admin for approval, and show up here.
        </p>
      ) : (
        <ul style={s.list}>
          {recent.map((r, i) => {
            return (
              <li key={`${r.kind}-${r.name}-${i}`} style={s.row}>
                <span style={s.rowIcon}>
                  <Icon name={r.kind === 'Food spot location' ? 'utensils' : r.kind === 'Deletion' ? 'trash' : 'map-pin'} size={16} />
                </span>
                <span style={s.rowText}>
                  <span style={s.rowLabel}>{r.name || '—'}</span>
                  <span style={s.rowDetail}>{r.kind} · {timeAgo(r.date)}</span>
                </span>
                <ApprovalPill status={r.status} />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function QuickActions({ isModerator }) {
  const actions = isModerator
    ? [
        { icon: 'plus', label: 'Add a spot', to: '/spots?new=1' },
        { icon: 'map-pin', label: 'Edit a spot', to: '/spots' },
        { icon: 'send', label: 'My submissions', to: '/my-review-requests' },
      ]
    : [
        { icon: 'inbox', label: 'Review approvals', to: '/mod-requests' },
        { icon: 'flag', label: 'Reported reviews', to: '/reported-comments' },
        { icon: 'map-pin', label: 'Browse spots', to: '/spots' },
        { icon: 'award', label: 'Leaderboard', to: '/user-progress' },
      ];
  return (
    <Card style={s.card}>
      <CardTitle>Quick actions</CardTitle>
      <div style={s.actions}>
        {actions.map((a) => (
          <Link key={a.to} to={a.to} className="dash-action" style={s.action}>
            <Icon name={a.icon} size={15} color={t.brand} />
            <span>{a.label}</span>
          </Link>
        ))}
      </div>
    </Card>
  );
}

// What's filled in across the catalogue — the gaps an admin/moderator can
// actually go and fix. Meters: the fill and its track are the same hue
// (data-1 on data-1-track), and the number is always written beside it.
const COVERAGE = [
  { key: 'coords',  label: 'Pinned on the map', test: (x) => x.coordinates?.lat != null && x.coordinates?.lng != null },
  { key: 'ar',      label: 'AR model',          test: (x) => !!x.AR3DModelURL },
  { key: 'trivia',  label: 'AR trivia',         test: (x) => Array.isArray(x.trivia) && x.trivia.length > 0 },
  { key: 'badge',   label: 'Visit badge',       test: (x) => !!x.Badge },
  { key: 'display', label: '3D display model',  test: (x) => !!x.modelUrl },
];

function ContentCard({ spots, loading, scope }) {
  const total = spots?.length || 0;
  const cats = {};
  (spots || []).forEach((x) => {
    const list = Array.isArray(x.category) ? x.category : x.category ? [x.category] : [];
    list.forEach((c) => { cats[c] = (cats[c] || 0) + 1; });
  });
  const catRows = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  const catMax = Math.max(1, ...catRows.map(([, n]) => n));

  return (
    <Card style={s.card}>
      <CardTitle to="/spots" linkLabel="Spot Management">
        Content coverage{scope ? ` · ${scope}` : ''}
      </CardTitle>
      {loading ? (
        <p style={s.muted}>Loading…</p>
      ) : spots == null ? (
        <p style={s.muted}>Couldn&rsquo;t load spots.</p>
      ) : total === 0 ? (
        <p style={s.muted}>No spots yet.</p>
      ) : (
        <div style={s.contentGrid}>
          <div>
            <p style={s.miniHead}>Of {plural(total, 'spot')}, how many have…</p>
            <ul style={s.meterList}>
              {COVERAGE.map((c) => {
                const n = spots.filter(c.test).length;
                return (
                  <li key={c.key} style={s.meterRow}>
                    <div style={s.meterLabels}>
                      <span style={s.meterLabel}>{c.label}</span>
                      <span style={s.meterValue}>{fmt(n)} <span style={s.meterOf}>of {fmt(total)}</span></span>
                    </div>
                    <div style={s.meterTrack} aria-hidden="true">
                      <div style={{ ...s.meterFill, width: `${(n / total) * 100}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
          <div>
            <p style={s.miniHead}>Spots by category</p>
            {/* One hue for every bar: the categories are names, not a scale.
                Values sit at the bar tips, so nothing is read by colour. */}
            <ul style={s.barList}>
              {catRows.map(([name, n]) => (
                <li key={name} style={s.barRow} title={`${name}: ${plural(n, 'spot')}`}>
                  <span style={s.barLabel}>{name}</span>
                  <span style={s.barTrack}>
                    <span style={{ ...s.barFill, width: `${(n / catMax) * 100}%` }} />
                    <span style={s.barValue}>{fmt(n)}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p style={s.note}>A spot can be in more than one category.</p>
          </div>
        </div>
      )}
    </Card>
  );
}

function TopTravelers({ rows, loading, failed }) {
  const top = rows.slice(0, 5);
  return (
    <Card style={s.card}>
      <CardTitle to="/user-progress" linkLabel="Full leaderboard">Top travelers</CardTitle>
      {loading ? (
        <p style={s.muted}>Loading…</p>
      ) : failed ? (
        <p style={s.muted}>Couldn&rsquo;t load the leaderboard.</p>
      ) : top.length === 0 ? (
        <p style={s.muted}>No travelers yet — rankings appear once someone visits a spot.</p>
      ) : (
        <ol style={s.list}>
          {top.map((r) => (
            <li key={r.clerkUserId} style={s.travelerRow}>
              <span style={s.rank}>{r.rank}</span>
              <Avatar src={r.profileImage} name={r.name} size={32} />
              <span style={s.rowText}>
                <span style={s.rowLabel}>{r.name}</span>
                <span style={s.rowDetail}>{plural(r.spotsVisited, 'spot')} visited · {plural(r.badges, 'badge')}</span>
              </span>
              <span style={s.points}>{fmt(r.points)} <span style={s.pointsUnit}>pts</span></span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const s = {
  ...pageStyles,
  split: { display: 'grid', gridTemplateColumns: 'minmax(0, 1.55fr) minmax(0, 1fr)', gap: 18, alignItems: 'start' },

  card: { padding: 18 },
  cardHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 },
  cardTitle: { ...type.cardTitle, color: t.textPrimary, margin: 0 },
  cardLink: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, fontWeight: 600, color: t.brand, textDecoration: 'none', whiteSpace: 'nowrap' },

  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  row: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 10px', margin: '0 -10px',
    borderRadius: radius.md, color: 'inherit', textDecoration: 'none',
  },
  rowIcon: {
    width: 34, height: 34, borderRadius: radius.md, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.sidebarBg, color: t.textSecondary,
  },
  rowText: { display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 },
  rowLabel: { fontSize: 13.5, fontWeight: 600, color: t.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rowDetail: { fontSize: 12, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },

  chevron: { display: 'inline-flex', flexShrink: 0, color: t.textMuted },
  badgeCount: { flexShrink: 0, fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: radius.pill, background: t.accentBg, color: t.textPrimary, border: `1px solid ${t.accent}` },
  badgeClear: { flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: t.success },
  badgeMuted: { flexShrink: 0, fontSize: 12, color: t.textMuted },

  allClear: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: t.textSecondary, margin: '0 0 8px' },
  muted: { fontSize: 13, color: t.textMuted, margin: 0, lineHeight: 1.5 },
  note: { fontSize: 12, color: t.textMuted, margin: '10px 0 0', lineHeight: 1.5 },


  actions: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 },
  action: {
    display: 'flex', alignItems: 'center', gap: 9, padding: '11px 12px', borderRadius: radius.md,
    border: `1px solid ${t.border}`, background: t.sidebarBg, color: t.textPrimary,
    fontSize: 13, fontWeight: 600, textDecoration: 'none', transition: 'border-color 0.15s, background 0.15s',
  },

  contentGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24 },
  miniHead: { ...type.label, color: t.textMuted, margin: '0 0 10px' },
  meterList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 11 },
  meterRow: { display: 'flex', flexDirection: 'column', gap: 5 },
  meterLabels: { display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 },
  meterLabel: { color: t.textPrimary, fontWeight: 500 },
  meterValue: { color: t.textPrimary, fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
  meterOf: { color: t.textMuted, fontWeight: 500 },
  meterTrack: { height: 8, borderRadius: 4, background: t.data1Track, overflow: 'hidden' },
  meterFill: { height: '100%', borderRadius: 4, background: t.data1, transition: 'width 0.5s ease' },

  barList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 9 },
  barRow: { display: 'grid', gridTemplateColumns: '92px minmax(0, 1fr)', alignItems: 'center', gap: 10 },
  barLabel: { fontSize: 13, color: t.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  barTrack: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
  // Square at the baseline, 4px round at the data end; 12px thick (≤ 24).
  barFill: { height: 12, borderRadius: '0 4px 4px 0', background: t.data1, minWidth: 2, flexShrink: 0, maxWidth: 'calc(100% - 30px)' },
  barValue: { fontSize: 12.5, fontWeight: 700, color: t.textPrimary, fontVariantNumeric: 'tabular-nums' },

  travelerRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' },
  rank: { width: 20, textAlign: 'center', fontSize: 13, fontWeight: 700, color: t.textMuted, fontVariantNumeric: 'tabular-nums', flexShrink: 0 },
  points: { flexShrink: 0, fontSize: 13.5, fontWeight: 700, color: t.textPrimary, fontVariantNumeric: 'tabular-nums' },
  pointsUnit: { fontSize: 11.5, fontWeight: 500, color: t.textMuted },
};

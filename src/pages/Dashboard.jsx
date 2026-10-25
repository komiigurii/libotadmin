import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  spotAPI, missionAPI, appealAPI, userProgressAPI, myTravelersAPI,
} from '../api/api';
import { theme as t } from '../theme';
import {
  Page, PageHeader, Avatar, ErrorBanner, ApprovalPill, Loading, FilterTabs,
} from '../components/Layout';
import { Bone } from '../components/Skeleton';
import { fmtNum as fmt, plural, timeAgo, fmtDateTime } from '../utils/format';
import { loadUsage } from '../utils/usage';
import Icon from '../components/Icon';
import UsageCharts, { ColumnChart } from '../components/UsageCharts';
import SuperAdminDashboard from './SuperAdminDashboard';
import { isSuperAdmin } from '../auth/roles';
import { useLive } from '../api/live';

/*
 * The landing page for admins and moderators: what's live, what's waiting on
 * you, and how travelers are using the app.
 *
 * Laid out like the super admin's (2026-10-23, the consoles' look): the band
 * with a stat strip, then two columns that fill the width, with lists under
 * ink heads and charts under plain ones.
 *
 * Every figure here is a real count from an existing endpoint. The day-by-day
 * charts (components/UsageCharts.jsx) and an admin's 30-day review count come
 * from GET /api/admin/stats/usage; nothing else here claims a trend. The strip
 * has no sparks: a quiet month drew them as a bare line that read as an
 * underline (mock defense notes, 2026-10-23).
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
// The leaderboard is User Management's Leaderboard tab (it was its own page,
// /user-progress, whose address now lands there too).
const LEADERBOARD = '/user-management?tab=progress';

// ── Data ─────────────────────────────────────────────────────────────

// Mirrors how ModRequests.load() assembles the approval queue, so the count
// here matches the one on that page.
async function loadAdmin() {
  const [progress, spots, proposals, pendingSpots, missions, appeals] =
    await Promise.allSettled([
      userProgressAPI.getAll(),
      spotAPI.getAll(),
      spotAPI.getPendingProposals(),
      spotAPI.getPending(),
      missionAPI.getProposals(),
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
    at: new Date(),
    progress: val(progress),
    spots: ok(spots) ? listOf(val(spots), 'spots') : null,
    attention: {
      approvals,
      approvalsPartial: approvalParts.some((r) => !ok(r)) && approvals != null,
      appeals: ok(appeals) ? listOf(val(appeals), 'appeals').length : null,
    },
    failed: [
      !ok(progress) && 'traveler figures',
      !ok(spots) && 'spots',
      approvalParts.some((r) => !ok(r)) && 'part of the approval queue',
      !ok(appeals) && 'appeals',
    ].filter(Boolean),
  };
}

// A moderator's dashboard is about their attractions and their requests —
// the same sources as My Submissions, so the two always agree — and the
// travelers who visited them (the Travelers page's list).
async function loadModerator() {
  const [mySpots, myProposals, myDeletes, myChanges, myTravelers] =
    await Promise.allSettled([
      spotAPI.getMine(),
      spotAPI.getMyProposals(),
      spotAPI.getMyDeleteRequests(),
      spotAPI.getMyChangeRequests(),
      myTravelersAPI.getAll(),
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
    at: new Date(),
    spots,
    submissions: sources.some(ok) || spots ? submissions : null,
    travelers: ok(myTravelers) ? (val(myTravelers)?.travelers || []) : null,
    failed: [
      !ok(mySpots) && 'your spots',
      !sources.every(ok) && 'some of your submissions',
      !ok(myTravelers) && 'your municipality’s travelers',
    ].filter(Boolean),
  };
}

// ── Page ─────────────────────────────────────────────────────────────

// The super admin's console holds only the super admin's work, so their
// dashboard is a different page (pages/SuperAdminDashboard.jsx).
export default function Dashboard() {
  return isSuperAdmin() ? <SuperAdminDashboard /> : <StaffDashboard />;
}

function StaffDashboard() {
  const isModerator = localStorage.getItem('role') === 'moderator';
  const city = localStorage.getItem('city') || '';

  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    setData(await (isModerator ? loadModerator() : loadAdmin()));
  }, [isModerator]);

  useEffect(() => { load(); }, [load]);
  // Live updates, no Refresh button. Six requests a time for an admin, so at
  // most every 5 s.
  useLive(isModerator ? ['spots', 'approvals'] : ['spots', 'approvals', 'missions', 'progress', 'travelers'], load, { gap: 5000 });

  // The usage figures behind an admin's review count: the same 30 days the
  // charts below read, shared through utils/usage.js. Asked again after every
  // load, so a live update brings them along.
  const [usage, setUsage] = useState(null);
  useEffect(() => {
    if (isModerator || !data) return undefined;
    let live = true;
    loadUsage(30).then((u) => { if (live) setUsage(u); }).catch(() => {});
    return () => { live = false; };
  }, [isModerator, data]);

  const loading = data === null;
  const figures = data?.progress?.stats;
  const leaderboard = data?.progress?.leaderboard || [];
  const spots = data?.spots;
  const subs = data?.submissions;
  const series = usage?.series;
  // Admin only: everything waiting on a decision, or null if none of it loaded.
  const waiting = data?.attention
    ? sumKnown(Object.values(pick(data.attention, ['approvals', 'appeals'])))
    : null;
  const v = (n) => (loading ? '…' : fmt(n));

  // Hues as everywhere in the consoles: teal travelers, magenta arrivals,
  // orange reviews. The figures with no hue are things, not series.
  const stats = isModerator ? [
    { label: city ? `Spots in ${city}` : 'Your spots', to: '/spots', value: v(spots?.length),
      hint: spots ? `${fmt(spots.filter((x) => x.AR3DModelURL).length)} with an AR model` : null },
    { label: 'Waiting for approval', to: '/my-review-requests', value: v(subs?.filter((x) => x.status === 'pending').length),
      hint: subs ? `${fmt(subs.filter((x) => x.status === 'rejected').length)} rejected so far` : null },
    { label: 'Approved', to: '/my-review-requests', value: v(subs?.filter((x) => x.status === 'approved').length),
      hint: subs ? `${plural(subs.length, 'request')} sent in all` : null },
    { label: 'Travelers', hue: 'teal', to: '/my-travelers', value: v(data?.travelers?.length),
      hint: `visited the spots${city ? ` in ${city}` : ''}` },
  ] : [
    { label: 'Needs attention', value: v(waiting), tone: loading || waiting == null ? undefined : waiting ? 'warn' : 'good',
      hint: loading ? null : waiting ? 'approvals and ban appeals' : 'Nothing waiting on you' },
    { label: 'Travelers', hue: 'teal', to: '/user-management', value: v(figures?.totalUsers),
      hint: figures ? `${fmt(figures.activeLast7)} active this week` : null },
    { label: 'Spot visits', hue: 'magenta', to: LEADERBOARD, value: v(figures?.totalVisits),
      hint: figures ? `by ${plural(figures.explorers, 'traveler')}` : null },
    { label: 'Reviews', hue: 'orange', to: '/comments', value: series ? fmt(sum(series.reviews)) : loading ? '…' : '—',
      hint: 'in the last 30 days' },
    { label: 'Published spots', to: '/spots', value: v(spots?.length),
      hint: spots ? `across ${plural(new Set(spots.map((x) => (x.city || '').trim().toLowerCase()).filter(Boolean)).size, 'city', 'cities')}` : null },
  ];

  const live = (
    <>
      <span>Refreshed <b className="sa-mono">{data ? fmtDateTime(data.at) : <Bone inline w={104} h={13} />}</b></span>
      <span>{isModerator ? <>Looking after <b>{city || 'no municipality yet'}</b></> : <>Looking after <b>all of Bulacan</b></>}</span>
    </>
  );

  return (
    <Page>
      <PageHeader
        title="Dashboard"
        live={live}
        stats={stats}
      />

      {data?.failed?.length > 0 && (
        <ErrorBanner>Couldn&rsquo;t load {data.failed.join(', ')}. Everything else below is current.</ErrorBanner>
      )}

      {/* On a phone the panels come in the order they matter (console.css,
          .sa-o-*). */}
      <div className="sa-grid sa-split sa-dash">
        {isModerator ? (
          <>
            <div className="sa-col">
              <SubmissionsPanel submissions={subs} loading={loading} />
              <VisitsPanel />
              <CoveragePanel spots={spots} loading={loading} scope={city || 'your area'} />
            </div>
            <div className="sa-col">
              <VisitorsPanel travelers={data?.travelers} loading={loading} />
              <QuickActions isModerator />
            </div>
          </>
        ) : (
          <>
            <div className="sa-col">
              <AttentionPanel attention={data?.attention} loading={loading} />
              <div className="sa-usage sa-o-usage"><UsageCharts /></div>
              <QuickActions />
            </div>
            <div className="sa-col">
              <TopTravelers rows={leaderboard} loading={loading} failed={!loading && !data?.progress} />
              <CoveragePanel spots={spots} loading={loading} />
            </div>
          </>
        )}
      </div>
    </Page>
  );
}

const sum = (pts) => (pts || []).reduce((n, p) => n + p.count, 0);
const pick =(obj = {}, keys) => Object.fromEntries(keys.map((k) => [k, obj[k]]));
// A sum that says "unknown" rather than 0 when nothing loaded.
const sumKnown = (vals) => {
  const known = vals.filter((v) => v != null);
  return known.length ? known.reduce((a, b) => a + b, 0) : null;
};

// ── Pieces ───────────────────────────────────────────────────────────

// A panel as on the super admin's dashboard: an ink head for a live list,
// a plain one for charts and the actions.
function Panel({ id, title, dark, meta, to, linkLabel, className = '', children }) {
  return (
    <section className={`sa-panel ${className}`} aria-labelledby={id}>
      <div className={`sa-panel-head${dark ? ' dark' : ''}`}>
        <h2 id={id} className="sa-panel-title">{title}</h2>
        {meta && <span className="sa-panel-meta">{meta}</span>}
        {to && <Link to={to} className={dark ? undefined : 'sa-panel-link'}>{linkLabel} <Icon name="chevron-right" size={13} /></Link>}
      </div>
      {children}
    </section>
  );
}

function Count({ count, loading }) {
  if (loading) return <Bone w={34} h={26} r={8} />;
  if (count == null) return <span style={d.muted}>Couldn&rsquo;t load</span>;
  if (count === 0) return <span style={d.clear}><Icon name="check" size={12} weight="bold" /> Clear</span>;
  return <span style={d.badge}>{fmt(count)}</span>;
}

function AttentionPanel({ attention, loading }) {
  const rows = [
    { icon: 'inbox', label: 'Approval Queue', to: '/spots/approvals', count: attention?.approvals,
      detail: 'Requests from moderators' },
    { icon: 'slash', label: 'Ban appeals', to: '/user-management?tab=bans', count: attention?.appeals,
      detail: 'Suspended or banned travelers Requesting account reinstatement' },
  ];
  const total = sumKnown(rows.map((r) => r.count));
  return (
    <Panel id="dash-attention" title="Needs your attention" dark className="sa-o-attention"
      meta={loading ? <Bone inline w={72} h={11} /> : total ? `${fmt(total)} waiting` : total === 0 ? 'All clear' : null}>
      <ul style={d.list}>
        {rows.map((r) => (
          <li key={r.to} style={d.li}>
            <Link to={r.to} className="dash-link" style={d.row}>
              <span style={d.rowIcon}><Icon name={r.icon} size={17} /></span>
              <span style={d.rowText}>
                <span style={d.rowLabel}>{r.label}</span>
                <span style={d.rowDetail}>{r.detail}</span>
              </span>
              <Count count={r.count} loading={loading} />
              {/* Icon doesn't forward className, and its colour must be
                  inherited for the hover rule in App.css to recolour it. */}
              <span className="dash-chevron" style={d.chevron}><Icon name="chevron-right" size={14} /></span>
            </Link>
          </li>
        ))}
      </ul>
      {attention?.approvalsPartial && (
        <p style={d.pad}>Part of the approval queue didn&rsquo;t load, so its count may be low.</p>
      )}
    </Panel>
  );
}

const SUBMISSIONS_SHOWN = 6;

function SubmissionsPanel({ submissions, loading }) {
  const recent = (submissions || []).slice(0, SUBMISSIONS_SHOWN);
  return (
    <Panel id="dash-submissions" title="Your recent submissions" dark className="sa-o-attention" to="/my-review-requests" linkLabel="My Submissions">
      {loading ? (
        <Loading label="Loading your submissions…" kind="rows" media="icon" rows={5} />
      ) : submissions == null ? (
        <p style={d.pad}>Couldn&rsquo;t load your submissions.</p>
      ) : recent.length === 0 ? (
        <p style={d.pad}>
          Nothing sent yet. Changes you make in Spot Management go to an admin for approval, and show up here.
        </p>
      ) : (
        <ul style={d.list}>
          {recent.map((r, i) => (
            <li key={`${r.kind}-${r.name}-${i}`} style={d.itemRow}>
              <span style={d.rowIcon}>
                <Icon name={r.kind === 'Food spot location' ? 'utensils' : r.kind === 'Deletion' ? 'trash' : 'map-pin'} size={17} />
              </span>
              <span style={d.rowText}>
                <span style={d.rowLabel}>{r.name || '—'}</span>
                <span style={d.rowDetail}>{r.kind} · <span className="sa-mono">{timeAgo(r.date)}</span></span>
              </span>
              <ApprovalPill status={r.status} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// The latest arrivals at the moderator's spots, from the Travelers page's list
// (newest visit first).
const VISITORS_SHOWN = 6;

function VisitorsPanel({ travelers, loading }) {
  const rows = (travelers || []).slice(0, VISITORS_SHOWN);
  return (
    <Panel id="dash-visitors" title="Recent visitors" dark className="sa-o-health" to="/my-travelers" linkLabel="Travelers">
      {loading ? (
        <Loading label="Loading recent visitors…" kind="rows" media="avatar" rows={5} />
      ) : travelers == null ? (
        <p style={d.pad}>Couldn&rsquo;t load your municipality&rsquo;s travelers.</p>
      ) : rows.length === 0 ? (
        <p style={d.pad}>No visits yet. Travelers show here once the app records their arrival at one of your spots.</p>
      ) : (
        <ul style={d.list}>
          {rows.map((r) => (
            <li key={r.id} style={d.personRow}>
              <Avatar src={r.profileImage} name={r.name} size={32} />
              <span style={d.rowText}>
                <span style={d.personName}>{r.name}</span>
                <span style={d.rowDetail}>{(r.spotNames || []).join(', ') || plural(r.spotsVisited, 'spot')}</span>
              </span>
              <span className="sa-mono" style={d.when}>{r.lastVisitAt ? timeAgo(r.lastVisitAt) : '—'}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// Arrivals at the moderator's spots, day by day, from GET /api/moderator/visits
// (2026-10-25: "add graph in dashboard for user visit"). Counted like the
// admin's "Spot arrivals" chart: a traveler's first arrival at a spot. In the
// arrivals hue, magenta. Beside it, the same range per spot.
const VISIT_RANGES = [{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }];
const VISIT_SPOTS_SHOWN = 5;

function VisitsPanel() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  // A live reload (someone arrived) keeps the chart up while it loads, and
  // keeps it if it fails.
  const [changed, setChanged] = useState(0);
  useLive(['progress', 'spots'], () => setChanged((n) => n + 1), { gap: 5000 });
  const seen = useRef(changed);

  useEffect(() => {
    let live = true;
    const quiet = seen.current !== changed;
    seen.current = changed;
    if (!quiet) setLoading(true);
    myTravelersAPI.visits(days)
      .then((res) => { if (live) { setData(res); setError(false); } })
      .catch(() => { if (live && !quiet) setError(true); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [days, changed]);

  const fill = 'var(--chart-arrivals, var(--data-1))';
  const spots = (data?.bySpot || []).filter((x) => x.count > 0).slice(0, VISIT_SPOTS_SHOWN);
  const spotMax = Math.max(1, ...spots.map((x) => x.count));

  return (
    <Panel id="dash-visits" title="Visits to your spots" className="sa-o-usage"
      meta={data ? `${plural(data.total, 'visit')} in ${data.days} days` : loading ? <Bone inline w={88} h={11} /> : null}>
      <div style={vp.body}>
        <FilterTabs label="Time range" value={days} onChange={setDays} options={VISIT_RANGES} pending={!data && loading} />
        {error && !data ? (
          <p style={vp.muted}>Couldn&rsquo;t load the visits.</p>
        ) : !data ? (
          <Loading label="Loading the visits…" kind="charts" rows={1} />
        ) : (
          // The previous range stays, dimmed, while another loads.
          <div style={{ ...vp.grid, opacity: loading ? 0.55 : 1, transition: 'opacity 0.2s' }}>
            <div style={{ minWidth: 0 }}>
              <ColumnChart points={data.series} fill={fill}
                label={`Visits to the spots in your municipality, last ${data.days} days, ${fmt(data.total)} in all`} />
              <p style={vp.note}>A traveler&rsquo;s first arrival at one of your spots, by day.</p>
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={s.miniHead}>Most visited in {data.days} days</p>
              {spots.length === 0 ? (
                <p style={vp.muted}>No visits in these {data.days} days yet.</p>
              ) : (
                <ul style={s.barList}>
                  {spots.map((x) => (
                    <li key={x.id} style={vp.barRow} title={`${x.name}: ${plural(x.count, 'visit')}`}>
                      <span style={s.barLabel}>{x.name}</span>
                      <span style={s.barTrack}>
                        <span style={{ ...s.barFill, background: fill, width: `${(x.count / spotMax) * 100}%` }} />
                        <span style={s.barValue}>{fmt(x.count)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

function QuickActions({ isModerator = false }) {
  const actions = isModerator
    ? [
        { icon: 'plus', label: 'Add a spot', to: '/spots?new=1' },
        { icon: 'map-pin', label: 'Edit a spot', to: '/spots' },
        { icon: 'send', label: 'My submissions', to: '/my-review-requests' },
        { icon: 'users', label: 'Travelers', to: '/my-travelers' },
      ]
    : [
        { icon: 'inbox', label: 'Review approvals', to: '/spots/approvals' },
        { icon: 'plus', label: 'Add a spot', to: '/spots?new=1' },
        { icon: 'message-square', label: 'Rate and Review', to: '/comments' },
        { icon: 'award', label: 'Leaderboard', to: LEADERBOARD },
      ];
  return (
    <Panel id="dash-actions" title="Quick actions">
      <div style={d.actions}>
        {actions.map((a) => (
          <Link key={a.to} to={a.to} className="dash-action" style={d.action}>
            <Icon name={a.icon} size={17} color={t.brand} />
            <span>{a.label}</span>
          </Link>
        ))}
      </div>
    </Panel>
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

function CoveragePanel({ spots, loading, scope }) {
  const total = spots?.length || 0;
  const cats = {};
  (spots || []).forEach((x) => {
    const list = Array.isArray(x.category) ? x.category : x.category ? [x.category] : [];
    list.forEach((c) => { cats[c] = (cats[c] || 0) + 1; });
  });
  const catRows = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  const catMax = Math.max(1, ...catRows.map(([, n]) => n));

  return (
    <Panel id="dash-coverage" title={`Content coverage${scope ? ` · ${scope}` : ''}`} to="/spots" linkLabel="Spot Management">
      {loading ? (
        <Loading label="Loading content coverage…" kind="meters" />
      ) : spots == null ? (
        <p style={d.pad}>Couldn&rsquo;t load spots.</p>
      ) : total === 0 ? (
        <p style={d.pad}>No spots yet.</p>
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
    </Panel>
  );
}

function TopTravelers({ rows, loading, failed }) {
  const top = rows.slice(0, 5);
  return (
    <Panel id="dash-travelers" title="Top travelers" dark className="sa-o-activity" to={LEADERBOARD} linkLabel="Leaderboard">
      {loading ? (
        <Loading label="Loading the top travelers…" kind="rows" media="avatar" rows={5} />
      ) : failed ? (
        <p style={d.pad}>Couldn&rsquo;t load the leaderboard.</p>
      ) : top.length === 0 ? (
        <p style={d.pad}>No travelers yet — rankings appear once someone visits a spot.</p>
      ) : (
        <ol style={d.list}>
          {top.map((r) => (
            <li key={r.clerkUserId} style={d.personRow}>
              <span style={d.rank}>{r.rank}</span>
              <Avatar src={r.profileImage} name={r.name} size={32} />
              <span style={d.rowText}>
                <span style={d.personName}>{r.name}</span>
                <span style={d.rowDetail}>{plural(r.spotsVisited, 'spot')} visited · {plural(r.badges, 'badge')}</span>
              </span>
              <span style={d.points}>{fmt(r.points)} <span style={d.pointsUnit}>pts</span></span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

// Rows and panels, the same metrics as the super admin's dashboard.
const d = {
  list:     { listStyle: 'none', margin: 0, padding: 0 },
  li:       { borderBottom: `1px solid ${t.divider}` },
  row:      { display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', color: 'inherit', textDecoration: 'none' },
  itemRow:  { display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: `1px solid ${t.divider}` },
  rowIcon:  { width: 36, height: 36, borderRadius: 10, flexShrink: 0, display: 'grid', placeItems: 'center', background: t.sidebarBg, color: t.textSecondary, border: `1px solid ${t.divider}` },
  rowText:  { display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 },
  rowLabel: { fontSize: 16, fontWeight: 700, color: t.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rowDetail: { fontSize: 14.5, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  chevron:  { display: 'inline-flex', flexShrink: 0, color: t.textMuted },
  badge:    { flexShrink: 0, minWidth: 30, textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 19, lineHeight: 1, padding: '5px 10px 4px', borderRadius: 8, background: t.accent, color: t.onAccent },
  clear:    { flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 15, fontWeight: 700, color: t.success },
  muted:    { fontSize: 15, color: t.textMuted },
  pad:      { margin: 0, padding: '14px 16px', fontSize: 15, color: t.textMuted, lineHeight: 1.4 },

  personRow:  { display: 'flex', alignItems: 'center', gap: 11, padding: '9px 16px', borderBottom: `1px solid ${t.divider}` },
  personName: { fontSize: 16, fontWeight: 700, color: t.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  when:       { flexShrink: 0, color: t.textMuted, whiteSpace: 'nowrap' },
  rank:       { width: 22, textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 700, color: t.textMuted, flexShrink: 0 },
  points:     { flexShrink: 0, fontFamily: 'var(--font-display)', fontSize: 21, fontWeight: 700, color: t.textPrimary, whiteSpace: 'nowrap' },
  pointsUnit: { fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 400, color: t.textMuted },

  // Two across when the column is wide enough, one when it isn't (tablet).
  actions:  { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, padding: 12 },
  action:   { display: 'flex', alignItems: 'center', gap: 9, padding: '11px 12px', borderRadius: 10, border: `1px solid ${t.border}`, background: t.sidebarBg, color: t.textPrimary, fontSize: 16, fontWeight: 700, textDecoration: 'none' },
};

// The coverage meters and category bars.
const s = {
  contentGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24, padding: '14px 16px 16px' },
  miniHead: { fontSize: 15, fontWeight: 700, color: t.textSecondary, margin: '0 0 10px' },
  meterList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 11 },
  meterRow: { display: 'flex', flexDirection: 'column', gap: 5 },
  meterLabels: { display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 15.5 },
  meterLabel: { color: t.textPrimary },
  meterValue: { color: t.textPrimary, fontWeight: 700 },
  meterOf: { color: t.textMuted, fontWeight: 400 },
  meterTrack: { height: 8, borderRadius: 4, background: t.data1Track, overflow: 'hidden' },
  meterFill: { height: '100%', borderRadius: 4, background: t.data1, transition: 'width 0.5s ease' },

  barList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 9 },
  barRow: { display: 'grid', gridTemplateColumns: '92px minmax(0, 1fr)', alignItems: 'center', gap: 10 },
  barLabel: { fontSize: 15.5, color: t.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  barTrack: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
  // Square at the baseline, 4px round at the data end; 12px thick (≤ 24).
  barFill: { height: 12, borderRadius: '0 4px 4px 0', background: t.data1, minWidth: 2, flexShrink: 0, maxWidth: 'calc(100% - 30px)' },
  barValue: { fontSize: 15, fontWeight: 700, color: t.textPrimary },
  note: { fontSize: 14, color: t.textMuted, margin: '10px 0 0', lineHeight: 1.4 },
};

// The visits panel: the range tabs, then the chart beside the per-spot bars
// (under it when the panel is narrow).
const vp = {
  body:   { display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 16px 16px' },
  grid:   { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px 28px', alignItems: 'start' },
  muted:  { margin: 0, fontSize: 15, color: t.textMuted },
  note:   { fontSize: 14, color: t.textMuted, margin: '6px 0 0', lineHeight: 1.4 },
  // Wider labels than the category bars: these are spot names.
  barRow: { display: 'grid', gridTemplateColumns: 'minmax(0, 150px) minmax(0, 1fr)', alignItems: 'center', gap: 10 },
};

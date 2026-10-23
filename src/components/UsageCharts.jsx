import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { loadUsage, forgetUsage } from '../utils/usage';
import { useLive } from '../api/live';
import { Card, FilterTabs, Button, pageStyles as s } from './Layout';
import { theme as t, radius, type } from '../theme';
import { fmtNum } from '../utils/format';
import { isSuperAdmin } from '../auth/roles';

/*
 * How the app is used, day by day (mock defense 2026-10-21: "optional: graph
 * representation", and the paper's "usage of the application"), from
 * GET /api/admin/stats/usage.
 *
 * Four small charts rather than one with four lines: the measures differ a
 * lot in size (a day's active travelers dwarf its reviews), and one axis for
 * all of them would flatten three into the floor. Each is one series in the
 * one data hue, so there is no legend: the title says what it counts.
 * Columns, because each day is a count of its own. Hover or focus a day for
 * its number; "Show as a table" has every value without hovering.
 */

const RANGES = [{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }];

const SERIES = [
  { key: 'active',   title: 'Travelers using the app', note: 'Each traveler counted once a day.' },
  { key: 'signups',  title: 'New accounts',            note: 'Travelers who signed up.' },
  { key: 'arrivals', title: 'Spot arrivals',           note: 'A traveler’s first arrival at a spot.' },
  { key: 'reviews',  title: 'Reviews written',         note: 'Rate and Review entries.' },
];

const dayLabel = (day, opts = { month: 'short', day: 'numeric' }) =>
  new Date(`${day}T00:00:00+08:00`).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', ...opts });

// 0, a middle and a top tick, rounded to clean numbers.
function ticksFor(max) {
  if (max <= 0) return [0, 1];
  if (max <= 4) return Array.from({ length: max + 1 }, (_, i) => i);
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000].find((n) => max / n <= 4) || Math.ceil(max / 4);
  const top = Math.ceil(max / step) * step;
  const out = [];
  for (let v = 0; v <= top; v += step) out.push(v);
  return out;
}

function useWidth(ref) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    setWidth(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

const H = 132;          // plot height
const AXIS_W = 30;      // room for the y ticks
const X_LABELS_H = 18;

function ColumnChart({ points, label, fill = 'var(--data-1)' }) {
  const wrapRef = useRef(null);
  const width = useWidth(wrapRef);
  const [hover, setHover] = useState(null);
  const plotW = Math.max(0, width - AXIS_W);
  const ticks = ticksFor(Math.max(...points.map((p) => p.count)));
  const top = ticks[ticks.length - 1] || 1;
  const band = points.length ? plotW / points.length : 0;
  // ≤ 24px thick, a 2px surface gap between neighbours.
  const bar = Math.max(1, Math.min(24, band - 2));
  const y = (v) => H - (v / top) * H;
  const r = Math.min(4, bar / 2);
  // A column with a 4px rounded top, square at the baseline.
  const column = (x, h) => {
    if (h <= 0) return '';
    const rr = Math.min(r, h);
    return `M${x},${H} V${H - h + rr} Q${x},${H - h} ${x + rr},${H - h} H${x + bar - rr} Q${x + bar},${H - h} ${x + bar},${H - h + rr} V${H} Z`;
  };
  const labelAt = [0, Math.floor((points.length - 1) / 2), points.length - 1];

  return (
    <div ref={wrapRef} style={c.chartWrap} onPointerLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={H + X_LABELS_H} role="img" aria-label={label} style={{ display: 'block', overflow: 'visible' }}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={AXIS_W} x2={width} y1={y(v)} y2={y(v)} stroke="var(--divider)" strokeWidth={1} />
              <text x={AXIS_W - 6} y={y(v)} dy="0.32em" textAnchor="end" style={c.tick}>{fmtNum(v)}</text>
            </g>
          ))}
          {points.map((p, i) => {
            const x = AXIS_W + i * band + (band - bar) / 2;
            const on = hover === i;
            return (
              <g key={p.day}>
                <path d={column(x, (p.count / top) * H)} fill={fill} opacity={hover == null || on ? 1 : 0.55} />
                {/* The whole day's band is the hover target, not just the column. */}
                <rect
                  x={AXIS_W + i * band} y={0} width={band} height={H} fill="transparent"
                  onPointerEnter={() => setHover(i)} onPointerMove={() => setHover(i)}
                />
              </g>
            );
          })}
          {[...new Set(labelAt)].map((i) => points[i] && (
            <text key={i} x={AXIS_W + i * band + band / 2} y={H + 13}
              textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} style={c.tick}>
              {dayLabel(points[i].day)}
            </text>
          ))}
        </svg>
      )}
      {hover != null && points[hover] && (
        <div role="status" style={{
          ...c.tooltip,
          left: Math.min(Math.max(AXIS_W + hover * band + band / 2, 60), width - 60),
        }}>
          <strong style={c.tipValue}>{fmtNum(points[hover].count)}</strong>
          <span style={c.tipLabel}>{dayLabel(points[hover].day, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
        </div>
      )}
    </div>
  );
}

export default function UsageCharts() {
  const superAdmin = isSuperAdmin();
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [asTable, setAsTable] = useState(false);
  const tableId = useId();

  // Sign-ups, first arrivals and reviews as they happen. A live reload keeps
  // the charts up while it loads, and keeps them if it fails.
  const [changed, setChanged] = useState(0);
  useLive(['travelers', 'progress', 'reviews'], () => { forgetUsage(); setChanged((n) => n + 1); });
  const seen = useRef(changed);

  useEffect(() => {
    let live = true;
    const quiet = seen.current !== changed;
    seen.current = changed;
    if (!quiet) setLoading(true);
    loadUsage(days)
      .then((d) => { if (live) { setData(d); setError(''); } })
      .catch(() => { if (live && !quiet) setError('Couldn’t load the usage figures.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [days, changed]);

  const sinceText = data?.activeSince && data.series.active[0].day < data.activeSince
    ? `Kept since ${dayLabel(data.activeSince, { month: 'short', day: 'numeric', year: 'numeric' })}.`
    : null;

  return (
    <Card style={c.card}>
      <div style={c.head}>
        <h2 style={c.title}>How the app is used</h2>
        <div style={c.controls}>
          <FilterTabs label="Time range" value={days} onChange={setDays} options={RANGES} />
          <Button size="sm" onClick={() => setAsTable((v) => !v)} aria-expanded={asTable} aria-controls={tableId}>
            {asTable ? 'Show as charts' : 'Show as a table'}
          </Button>
        </div>
      </div>
      {error && <p style={c.muted}>{error}</p>}
      {!data && !error && <p style={c.muted}>Loading…</p>}
      {data && (
        // The previous figures stay, dimmed, while another range loads.
        <div style={{ opacity: loading ? 0.55 : 1, transition: 'opacity 0.2s' }}>
          {asTable ? (
            <div id={tableId} className="table-scroll" style={c.tableWrap} tabIndex={0} role="region" aria-label="Usage by day">
              <table style={s.table}>
                <thead>
                  <tr>
                    <th scope="col" style={s.th}>Day</th>
                    {SERIES.map((x) => <th key={x.key} scope="col" style={{ ...s.th, textAlign: 'right' }}>{x.title}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {[...data.series.signups].reverse().map((row, idx, arr) => {
                    const i = arr.length - 1 - idx;
                    return (
                      <tr key={row.day}>
                        <td style={s.td}>{dayLabel(row.day, { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                        {SERIES.map((x) => (
                          <td key={x.key} style={{ ...s.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtNum(data.series[x.key][i].count)}</td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div id={tableId} className="usage-grid" style={c.grid}>
              {SERIES.map((x) => {
                const points = data.series[x.key];
                const total = points.reduce((n, p) => n + p.count, 0);
                const best = points.reduce((m, p) => (p.count > m.count ? p : m), points[0]);
                // The super admin's console gives each measure its own hue
                // (superadmin.css --chart-*), matching its swatch in the
                // dashboard's strip; elsewhere all four stay the one data hue.
                const fill = `var(--chart-${x.key}, var(--data-1))`;
                return (
                  <section key={x.key} style={c.panel} aria-label={x.title}>
                    <div style={c.panelHead}>
                      <h3 style={c.panelTitle}>
                        {superAdmin && <span style={{ ...c.swatch, background: fill }} aria-hidden="true" />}
                        {x.title}
                      </h3>
                      <span style={c.total}>
                        {fmtNum(x.key === 'active' ? best.count : total)}
                        <span style={c.totalUnit}>{x.key === 'active' ? ' on the busiest day' : ` in ${days} days`}</span>
                      </span>
                    </div>
                    <ColumnChart points={points} fill={fill} label={`${x.title}, last ${days} days, ${fmtNum(total)} in all`} />
                    <p style={c.note}>{x.note}{x.key === 'active' && sinceText ? ` ${sinceText}` : ''}</p>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

const c = {
  card:     { padding: 18 },
  head:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 },
  title:    { ...type.cardTitle, color: t.textPrimary, margin: 0 },
  controls: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  muted:    { fontSize: 13, color: t.textMuted, margin: 0 },
  grid:     { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '18px 24px' },
  panel:    { minWidth: 0 },
  panelHead: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 },
  panelTitle: { fontSize: 13.5, fontWeight: 600, color: t.textPrimary, margin: 0, display: 'flex', alignItems: 'center', gap: 7 },
  swatch:   { width: 10, height: 10, borderRadius: 3, flexShrink: 0 },
  total:    { fontSize: 18, fontWeight: 600, color: t.textPrimary },
  totalUnit: { fontSize: 12, fontWeight: 500, color: t.textMuted },
  note:     { fontSize: 12, color: t.textMuted, margin: '6px 0 0', lineHeight: 1.45 },
  chartWrap: { position: 'relative', width: '100%' },
  tick:     { fontSize: 10.5, fill: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' },
  tooltip: {
    position: 'absolute', top: -6, transform: 'translate(-50%, -100%)', pointerEvents: 'none', whiteSpace: 'nowrap',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
    background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: radius.md, padding: '5px 9px',
    boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
  },
  tipValue: { fontSize: 14, color: t.textPrimary },
  tipLabel: { fontSize: 11.5, color: t.textSecondary },
  tableWrap: { maxHeight: 360, overflow: 'auto', border: `1px solid ${t.border}`, borderRadius: radius.md },
};

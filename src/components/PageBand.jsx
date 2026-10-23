import { Link } from 'react-router-dom';
import Icon from './Icon';
import { Bone } from './Skeleton';

/*
 * The band every console page opens with (2026-10-23, the user's reference;
 * the super admin's first, then every console's): the title in bold capitals,
 * one line of what's live, the page's actions, and the stat strip. Layout's
 * PageHeader draws it, so pages pass `stats` and `live` to PageHeader.
 * `statsLabel` names the strip for screen readers when its cells are the
 * page's tabs or filters rather than figures.
 *
 * A stat: { label, value, hint, hue, to, tone, current, small, flag }
 *   hue      a series hue (teal, orange, blue, marigold, violet, magenta,
 *            slate). The whole cell wears it (it was a swatch by the label
 *            until the mock defense notes of 2026-10-23); the same hue marks
 *            that thing in the page's charts and tags, so the strip is the
 *            legend.
 *   tone     'warn' (amber number) or 'good' (green), for a state, never a series.
 *   flag     a short word beside a warning number ("Now").
 * No sparks: a quiet month drew them as a bare line that read as an underline.
 *
 * A value of '…' is the pages' word for "still loading": the cell draws a
 * skeleton bone the size of its number instead, and a hint of null (one
 * that comes with the data) a short line under it. An undefined hint is a
 * cell that has none, so it gets no line. A `count` of '…' is a bone too.
 */
const PENDING = '…';
// `statsBeside`: a short strip (a page's two tabs) sits beside the title
// rather than under it, so the band takes one row.
export default function PageBand({ title, subtitle, count, live, actions, stats, statsLabel, statsBeside = false, children }) {
  const strip = stats?.length > 0 && <StatStrip stats={stats} label={statsLabel} />;
  return (
    <section className="sa-band" aria-label={typeof title === 'string' ? title : undefined}>
      <div className="sa-band-top">
        <div style={{ minWidth: 0, flex: statsBeside ? '0 1 auto' : '1 1 420px' }}>
          <h1 className="sa-band-title">
            {title}
            {count != null && (count === PENDING
              ? <Bone inline w={34} h={18} r={999} style={{ marginLeft: 10, verticalAlign: '0.35em' }} />
              : <span className="sa-band-count" aria-label={`${count} items`}>{count}</span>)}
          </h1>
          {subtitle && <p className="sa-band-sub">{subtitle}</p>}
          {live && <div className="sa-band-live">{live}</div>}
        </div>
        {statsBeside && strip && <div className="sa-band-beside">{strip}</div>}
        {actions && <div className="sa-band-actions">{actions}</div>}
      </div>
      {!statsBeside && strip}
      {children}
    </section>
  );
}

export function StatStrip({ stats, label = 'Figures' }) {
  return (
    // --n: one column per figure on a wide screen, so a row never ends in
    // empty cells (superadmin.css folds six to three on a tablet).
    <div className="sa-strip" role="list" aria-label={label} data-n={stats.length} style={{ '--n': stats.length }}>
      {stats.map((st) => <Cell key={st.label} {...st} />)}
    </div>
  );
}

function Cell({ label, value, hint, hue, to, tone, current, small, flag, onClick }) {
  const pending = value === PENDING;
  const body = (
    <>
      <span className="sa-cell-label">{label}</span>
      <span className="sa-cell-row">
        <span className={`sa-cell-value${small ? ' small' : ''}`}>
          {pending ? <><Bone w={small ? 76 : 58} h={small ? 22 : 30} /><span className="sk-sr">Loading</span></> : value ?? '—'}
        </span>
        {flag && <span className="sa-cell-flag"><Icon name="alert-triangle" size={13} weight="bold" />{flag}</span>}
      </span>
      {hint ? <span className="sa-cell-hint">{hint}</span>
        : pending && hint === null && <span className="sa-cell-hint"><Bone w="64%" h={10} style={{ marginTop: 3 }} /></span>}
    </>
  );
  const cls = `sa-cell${tone ? ` ${tone}` : ''}${hue ? ' hued' : ''}`;
  const tint = hue ? { '--cell-hue': `var(--k-${hue})` } : undefined;
  if (to) return <Link to={to} className={cls} style={tint} role="listitem" aria-current={current ? 'true' : undefined}>{body}</Link>;
  if (onClick) {
    return (
      <button type="button" className={cls} role="listitem" onClick={onClick} aria-pressed={!!current}
        aria-current={current ? 'true' : undefined} style={{ ...tint, border: 'none', textAlign: 'left', cursor: 'pointer', font: 'inherit' }}>
        {body}
      </button>
    );
  }
  return <div className={cls} style={tint} role="listitem">{body}</div>;
}

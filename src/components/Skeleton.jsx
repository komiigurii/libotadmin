import { useEffect, useState } from 'react';
import './Skeleton.css';

/*
 * Loading as skeletons (the user, 2026-10-23: "loading in superadmin, admin,
 * moderator should be skeleton"). What's on its way is drawn in its own shape
 * (a table as a table, the Approval Queue as request cards, a dashboard panel
 * as its rows), so the page doesn't jump when the data lands and you can see
 * what's coming before it does.
 *
 * Bones are plain bars in a muted fill. One slow light crosses all of them at
 * once, because the sheen is fixed to the screen rather than to each bone
 * (Skeleton.css); with reduced motion they hold still.
 *
 * Layout re-exports Loading, so pages keep importing it from there.
 */

/** One bar. Numbers are px. `inline` sits in a line of text (a time, a
 *  count in a sentence); `round` makes a circle (an avatar). */
export function Bone({ w = '100%', h = 12, r, round, inline, style }) {
  return (
    <span
      className={`sk-bone${inline ? ' sk-bone-inline' : ''}`}
      aria-hidden="true"
      style={{ width: w, height: h, borderRadius: round ? '50%' : r, ...style }}
    />
  );
}

// The API's server sleeps when idle and takes 30–60 s to answer the first
// request, so after a few seconds the skeleton says why it's slow.
const WAKING_AFTER_MS = 4000;

/**
 * kind     what's loading, so the skeleton has its shape:
 *   table    a table (cols columns; media="avatar" puts a person first)
 *   list     item cards: reviews, requests (media "avatar" or "thumb")
 *   rows     rows in a panel or a drawer (media "icon", "avatar" or none)
 *   cards    Spot Management's photo cards
 *   tiles    the town badge cards
 *   facts    a drawer's grid of facts
 *   charts   the usage charts
 *   meters   the dashboards' content coverage
 *   form     labelled fields
 *   panels   a page of panels, two columns (System)
 *   thread   a ticket: its band, the messages and the reply box
 *   page     a page whose code is still downloading: a band and a table
 *   line     one line of text
 * label    read to screen readers in place of the bones.
 * flush    rows with no side inset, for a drawer (it has its own padding).
 */
export function Loading({ label = 'Loading…', kind = 'table', rows, cols = 5, media, flush = false }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), WAKING_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);
  const Shape = SHAPES[kind] || SHAPES.table;
  return (
    <div className="sk" role="status" aria-live="polite" aria-busy="true">
      <span className="sk-sr">{label}</span>
      <Shape rows={rows} cols={cols} media={media} flush={flush} />
      {slow && <p className="sk-hint">Waking up the server. The first load can take up to a minute.</p>}
    </div>
  );
}

// Widths that differ row to row but are the same on every render, so lines
// read as text of different lengths and nothing flickers on a re-render.
const WIDTHS = [72, 48, 86, 60, 78, 42, 66, 54, 90, 58];
const pct = (i) => `${WIDTHS[i % WIDTHS.length]}%`;
const times = (n) => Array.from({ length: n }, (_, i) => i);

// A person in a table cell or a row: their photo, name and the line under it.
function Person({ i, size = 32 }) {
  return (
    <span className="sk-inline">
      <Bone w={size} h={size} round />
      <span className="sk-lines">
        <Bone w={pct(i + 3)} h={13} />
        <Bone w={pct(i + 6)} h={10} style={{ maxWidth: '70%' }} />
      </span>
    </span>
  );
}

function TableShape({ rows = 6, cols, media }) {
  return (
    <div className="sk-card" aria-hidden="true">
      <table className="sk-table">
        <thead>
          <tr>
            {times(cols).map((c) => (
              <th key={c} scope="col" style={c === 0 && media === 'avatar' ? { width: '28%' } : null}>
                <Bone w={c === 0 ? 76 : 44 + ((c * 17) % 36)} h={10} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {times(rows).map((r) => (
            <tr key={r}>
              {times(cols).map((c) => (
                <td key={c}>
                  {c === 0 && media === 'avatar' ? <Person i={r} /> : <Bone w={pct(r * 3 + c)} h={c === 0 ? 13 : 11} />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ListShape({ rows = 4, media = 'thumb' }) {
  return (
    <div className="sk-list" aria-hidden="true">
      {times(rows).map((i) => (
        <div key={i} className="sk-item">
          <Bone w={38} h={38} r={10} round={media === 'avatar'} />
          <div className="sk-item-main">
            <span className="sk-inline">
              <Bone w={`${26 + ((i * 11) % 22)}%`} h={14} />
              <Bone w={64} h={10} />
              <Bone w={72} h={20} r={999} />
            </span>
            <Bone w={pct(i + 8)} h={11} />
            <Bone w={pct(i + 1)} h={11} />
            <span className="sk-inline">
              <Bone w={88} h={10} />
              <Bone w={112} h={10} />
            </span>
          </div>
          <Bone w={84} h={32} r={10} />
        </div>
      ))}
    </div>
  );
}

function RowsShape({ rows = 4, media, flush }) {
  return (
    <ul className={`sk-rows${flush ? ' sk-rows-flush' : ''}`} aria-hidden="true">
      {times(rows).map((i) => (
        <li key={i} className="sk-row">
          {media === 'avatar' && <Person i={i} />}
          {media !== 'avatar' && (
            <>
              {media === 'icon' && <Bone w={36} h={36} r={10} />}
              <span className="sk-lines">
                <Bone w={pct(i)} h={13} style={{ maxWidth: '62%' }} />
                <Bone w={pct(i + 4)} h={10} />
              </span>
            </>
          )}
          <Bone w={44} h={20} r={8} />
        </li>
      ))}
    </ul>
  );
}

function CardsShape({ rows = 8 }) {
  return (
    <div className="sk-cards" aria-hidden="true">
      {times(rows).map((i) => (
        <div key={i} className="sk-spot">
          <Bone h={140} r={0} />
          <div className="sk-spot-body">
            <Bone w={pct(i)} h={14} />
            <span className="sk-lines">
              <Bone w="94%" h={10} />
              <Bone w={pct(i + 5)} h={10} />
            </span>
            <span className="sk-lines">
              <Bone w={112} h={10} />
              <Bone w={136} h={10} />
              <Bone w={92} h={10} />
            </span>
            <div className="sk-foot">
              <Bone w={56} h={11} />
              <Bone w={120} h={30} r={10} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TilesShape({ rows = 6 }) {
  return (
    <div className="sk-tiles" aria-hidden="true">
      {times(rows).map((i) => (
        <div key={i} className="sk-tile">
          <Bone w={112} h={112} r={10} />
          <div className="sk-lines" style={{ gap: 9 }}>
            <span className="sk-inline" style={{ justifyContent: 'space-between' }}>
              <Bone w={pct(i + 1)} h={18} style={{ maxWidth: '55%' }} />
              <Bone w={64} h={10} />
            </span>
            <Bone w={70} h={9} />
            <Bone h={34} r={10} />
            <Bone w={84} h={9} />
            <Bone h={52} r={10} />
          </div>
        </div>
      ))}
    </div>
  );
}

function FactsShape({ rows = 6 }) {
  return (
    <div className="sk-facts" aria-hidden="true">
      {times(rows).map((i) => (
        <div key={i} className="sk-fact">
          <Bone w={pct(i + 2)} h={9} style={{ maxWidth: '58%' }} />
          <Bone w={pct(i + 5)} h={15} style={{ maxWidth: '46%' }} />
        </div>
      ))}
    </div>
  );
}

// A day's columns: the heights of a plausible month, not data.
const COLUMNS = [34, 52, 41, 63, 48, 72, 58, 44, 69, 84, 61, 50, 76, 66, 39, 57, 81, 70, 47, 62];

function ChartsShape({ rows = 4 }) {
  return (
    // usage-grid: the dashboards fold these two by two (console.css).
    <div className="usage-grid sk-charts" aria-hidden="true">
      {times(rows).map((i) => (
        <div key={i}>
          <div className="sk-chart-head">
            <Bone w={pct(i + 3)} h={13} style={{ maxWidth: '58%' }} />
            <Bone w={52} h={16} />
          </div>
          <div className="sk-columns">
            {COLUMNS.map((_, k) => <Bone key={k} w="auto" h={`${COLUMNS[(k + i * 5) % COLUMNS.length]}%`} r="3px 3px 0 0" />)}
          </div>
          <Bone w={pct(i + 6)} h={10} style={{ marginTop: 10 }} />
        </div>
      ))}
    </div>
  );
}

function MetersShape({ rows = 5 }) {
  return (
    <div className="sk-meters" aria-hidden="true">
      <div className="sk-lines" style={{ gap: 13 }}>
        <Bone w={170} h={12} />
        {times(rows).map((i) => (
          <span key={i} className="sk-lines" style={{ gap: 6 }}>
            <span className="sk-inline" style={{ justifyContent: 'space-between' }}>
              <Bone w={pct(i + 1)} h={11} style={{ maxWidth: '50%' }} />
              <Bone w={46} h={11} />
            </span>
            <Bone h={8} r={4} />
          </span>
        ))}
      </div>
      <div className="sk-lines" style={{ gap: 13 }}>
        <Bone w={130} h={12} />
        {times(rows).map((i) => (
          <span key={i} className="sk-inline">
            <Bone w={80} h={11} />
            <Bone w={`${70 - i * 12}%`} h={12} r="0 4px 4px 0" />
          </span>
        ))}
      </div>
    </div>
  );
}

function FormShape({ rows = 3 }) {
  return (
    <div className="sk-lines" style={{ gap: 14 }} aria-hidden="true">
      {times(rows).map((i) => (
        <span key={i} className="sk-lines" style={{ gap: 7 }}>
          <Bone w={90 + ((i * 29) % 60)} h={10} />
          <Bone h={i === rows - 1 ? 64 : 38} r={10} />
        </span>
      ))}
      <Bone w={128} h={34} r={10} />
    </div>
  );
}

// A panel as the console draws it (console.css): a head, then a form.
function PanelBones({ i }) {
  return (
    <section className="sa-panel">
      <div className="sa-panel-head"><Bone w={140 + ((i * 37) % 70)} h={15} /></div>
      <div className="sk-panel-body">
        <Bone w={pct(i + 2)} h={11} />
        <FormShape rows={2 + (i % 2)} />
      </div>
    </section>
  );
}

function PanelsShape() {
  return (
    <div className="sa-grid sa-split-even" aria-hidden="true">
      {[0, 1].map((c) => (
        <div key={c} className="sa-col">
          <PanelBones i={c * 2} />
          <PanelBones i={c * 2 + 1} />
        </div>
      ))}
    </div>
  );
}

// The page band (components/PageBand.jsx) before its page knows its title.
function BandBones({ cells }) {
  return (
    <section className="sa-band" aria-hidden="true">
      <div className="sk-lines" style={{ gap: 12 }}>
        <Bone w="min(420px, 72%)" h={30} />
        <Bone w="min(300px, 56%)" h={13} />
      </div>
      {cells > 0 && (
        <div className="sa-strip" data-n={cells} style={{ '--n': cells }}>
          {times(cells).map((i) => (
            <div key={i} className="sa-cell">
              <Bone w={pct(i + 1)} h={11} style={{ maxWidth: '60%' }} />
              <Bone w={pct(i + 4)} h={22} style={{ maxWidth: '76%', marginTop: 6 }} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ThreadShape({ rows = 2 }) {
  return (
    <div className="sk-page" aria-hidden="true">
      <BandBones cells={5} />
      <div className="sa-grid sa-split">
        <div className="sk-lines" style={{ gap: 10 }}>
          {times(rows).map((i) => (
            <div key={i} className="sk-message">
              <span className="sk-inline">
                <Bone w={110} h={13} />
                <Bone w={70} h={10} />
              </span>
              <Bone w="96%" h={11} />
              <Bone w={pct(i + 5)} h={11} />
            </div>
          ))}
        </div>
        <section className="sa-panel">
          <div className="sa-panel-head"><Bone w={120} h={15} /></div>
          <div className="sk-panel-body"><FormShape rows={1} /></div>
        </section>
      </div>
    </div>
  );
}

function PageShape() {
  return (
    <div className="sk-page" aria-hidden="true">
      <BandBones cells={4} />
      <TableShape rows={6} cols={5} />
    </div>
  );
}

function LineShape() {
  return <Bone w="min(320px, 70%)" h={11} />;
}

const SHAPES = {
  table: TableShape, list: ListShape, rows: RowsShape, cards: CardsShape, tiles: TilesShape,
  facts: FactsShape, charts: ChartsShape, meters: MetersShape, form: FormShape,
  panels: PanelsShape, thread: ThreadShape, page: PageShape, line: LineShape,
};

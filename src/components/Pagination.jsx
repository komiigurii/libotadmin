import { useRef, useState } from 'react';
import { theme as t } from '../theme';
import Icon from './Icon';
import { pageNumbers } from '../utils/pagination';
import { fmtNum } from '../utils/format';

/*
 * Page numbers under a long list: Previous · 1 … 4 5 6 … 12 · Next. The same
 * windowing as the mobile app's review list (utils/reviewList.js pageNumbers):
 * the first and last page, the current one and its neighbours, gaps as "…".
 */

// Every list in every console shows ten, then the next page (user rule
// 2026-10-24): the server's pages are asked for ten at a time, and a list
// that comes whole is cut here.
export const PAGE_SIZE = 10;

export default function Pagination({ page, pages, onChange, label = 'Pages' }) {
  if (!pages || pages <= 1) return null;
  const go = (n) => { if (n >= 1 && n <= pages && n !== page) onChange(n); };
  // The buttons are styled in App.css (.pager-btn): the page you're on is a
  // solid fill, the others plain. Inline styles mixed `border` with a
  // `borderColor` override, and React clearing that override left the page
  // you'd just left with a bright edge, so it looked chosen (2026-10-25).
  return (
    <nav aria-label={label} className="pager">
      <button type="button" className="pager-btn" onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Previous page">
        <Icon name="chevron-left" size={15} />
      </button>
      {pageNumbers(page, pages).map((n, i) => (n == null
        ? <span key={`gap-${i}`} className="pager-gap" aria-hidden="true">…</span>
        : (
          <button
            key={n}
            type="button"
            className="pager-btn"
            onClick={() => go(n)}
            aria-current={n === page ? 'page' : undefined}
            aria-label={`Page ${n}`}
          >
            {n}
          </button>
        )))}
      <button type="button" className="pager-btn" onClick={() => go(page + 1)} disabled={page >= pages} aria-label="Next page">
        <Icon name="chevron-right" size={15} />
      </button>
    </nav>
  );
}

/**
 * The line under a list: what's in view on the left, the page numbers on the
 * right. `pinned` keeps it on the bottom edge of the screen while the list
 * runs on below it, and the page drops its bottom gutter for it, so there's
 * no empty band under the numbers (user, 2026-10-25). Lists inside a card or
 * a drawer, or with more of the page after them, leave it unpinned.
 */
export function PagerFoot({ pinned = false, children }) {
  return <div className={`pager-foot${pinned ? ' pinned' : ''}`}>{children}</div>;
}

/**
 * A whole list, shown a page at a time. `resetKey` (the filter and search)
 * starts it again at page 1; a list that gets shorter (a live update, an
 * unban) keeps the page in range. Spread the result into <Paged>.
 */
export function usePaged(items, resetKey = '') {
  const [page, setPage] = useState(1);
  const [key, setKey] = useState(resetKey);
  if (key !== resetKey) {
    setKey(resetKey);
    setPage(1);
  }
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const at = Math.min(page, pages);
  const rows = items.slice((at - 1) * PAGE_SIZE, at * PAGE_SIZE);
  return { rows, page: at, pages, total: items.length, count: rows.length, onChange: setPage };
}

/**
 * A list with "11–20 of 34" and the page numbers under it, nothing more while
 * it fits on one page. Turning the page brings the list's top back into view
 * when it has gone up under the top bar.
 */
export function Paged({ page, pages, total, count, onChange, label, pinned = true, children }) {
  const ref = useRef(null);
  const turn = (n) => {
    onChange(n);
    const el = ref.current;
    if (el && el.getBoundingClientRect().top < TOP_BAR) el.scrollIntoView({ block: 'start' });
  };
  const from = (page - 1) * PAGE_SIZE + 1;
  return (
    <div ref={ref} style={s.paged}>
      {children}
      {pages > 1 && (
        <PagerFoot pinned={pinned}>
          <span style={s.range}>{fmtNum(from)}–{fmtNum(from + count - 1)} of {fmtNum(total)}</span>
          <Pagination page={page} pages={pages} onChange={turn} label={label} />
        </PagerFoot>
      )}
    </div>
  );
}

// The console's sticky top bar (console.css .sa-topbar) and a little air.
const TOP_BAR = 68;

const s = {
  paged: { display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0, scrollMarginTop: TOP_BAR },
  range: { fontSize: 12, color: t.textMuted, fontVariantNumeric: 'tabular-nums' },
};

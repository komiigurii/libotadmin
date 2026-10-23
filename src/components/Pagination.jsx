import { useRef, useState } from 'react';
import { theme as t, radius, type } from '../theme';
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
  return (
    <nav aria-label={label} style={s.wrap}>
      <button type="button" style={{ ...s.btn, ...(page <= 1 ? s.off : null) }} onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Previous page">
        <Icon name="chevron-left" size={14} />
      </button>
      {pageNumbers(page, pages).map((n, i) => (n == null
        ? <span key={`gap-${i}`} style={s.gap} aria-hidden="true">…</span>
        : (
          <button
            key={n}
            type="button"
            onClick={() => go(n)}
            aria-current={n === page ? 'page' : undefined}
            aria-label={`Page ${n}`}
            style={{ ...s.btn, ...(n === page ? s.on : null) }}
          >
            {n}
          </button>
        )))}
      <button type="button" style={{ ...s.btn, ...(page >= pages ? s.off : null) }} onClick={() => go(page + 1)} disabled={page >= pages} aria-label="Next page">
        <Icon name="chevron-right" size={14} />
      </button>
    </nav>
  );
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
export function Paged({ page, pages, total, count, onChange, label, children }) {
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
        <div style={s.foot}>
          <span style={s.range}>{fmtNum(from)}–{fmtNum(from + count - 1)} of {fmtNum(total)}</span>
          <Pagination page={page} pages={pages} onChange={turn} label={label} />
        </div>
      )}
    </div>
  );
}

// The console's sticky top bar (console.css .sa-topbar) and a little air.
const TOP_BAR = 68;

const s = {
  wrap: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, flexWrap: 'wrap' },
  btn: {
    minWidth: 34, height: 34, padding: '0 10px', borderRadius: radius.sm,
    border: `1px solid ${t.border}`, background: t.cardBg, color: t.textSecondary,
    fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', ...type.num,
  },
  on:  { background: t.brandSoft, color: t.brand, borderColor: 'transparent' },
  off: { opacity: 0.45, cursor: 'not-allowed' },
  gap: { color: t.textMuted, padding: '0 4px' },
  paged: { display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0, scrollMarginTop: TOP_BAR },
  foot:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  range: { fontSize: 12, color: t.textMuted, ...type.num },
};

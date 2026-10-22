import { theme as t, radius, type } from '../theme';
import Icon from './Icon';
import { pageNumbers } from '../utils/pagination';

/*
 * Page numbers under a long list: Previous · 1 … 4 5 6 … 12 · Next. The same
 * windowing as the mobile app's review list (utils/reviewList.js pageNumbers):
 * the first and last page, the current one and its neighbours, gaps as "…".
 */

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
};

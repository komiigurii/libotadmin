import { useState } from 'react';
import { theme as t, radius, shadow, type } from '../theme';
import Icon from './Icon';

/*
 * Shared page furniture for the admin panel.
 *
 * Every page had rebuilt these by hand, and they had drifted badly: three
 * different max-widths (1100 / 1200 / unbounded), two page paddings, four
 * header bottom-margins, two title weights and three subtitle sizes. Moving
 * between pages therefore felt like moving between apps — the content shifted
 * sideways and the headings changed size.
 *
 * These components are the single definition of that furniture. A page should
 * describe what it shows; how a page is spaced is decided here, once.
 */

// One rhythm for every page. Changing a number here changes all eight.
export const layout = {
  maxWidth:    1180,   // wide enough for the 7-column tables, narrow enough to read
  padX:        32,
  padY:        28,
  gap:         18,     // vertical space between page sections
  cardPad:     16,
  rowPadY:     12,     // table cell vertical padding
  rowPadX:     16,
};

/* ── Page shell ───────────────────────────────────────────────────
   Owns the outer padding, the max-width and the vertical rhythm, so no page
   sets its own margins between sections — they come from one `gap`. */
export function Page({ children, wide = false }) {
  return (
    // `admin-page` is the hook the responsive rules in App.css use to shrink
    // the gutter on narrow viewports — inline styles can't hold a media query.
    <div className="admin-page" style={{
      padding:       `${layout.padY}px ${layout.padX}px`,
      maxWidth:      wide ? 1400 : layout.maxWidth,
      margin:        '0 auto',
      width:         '100%',
      boxSizing:     'border-box',
      display:       'flex',
      flexDirection: 'column',
      gap:           layout.gap,
    }}>
      {children}
    </div>
  );
}

/* ── Page header ──────────────────────────────────────────────────
   Title, one-line description, and an optional action on the right. */
export function PageHeader({ title, subtitle, count, actions }) {
  return (
    <div style={s.header}>
      <div style={{ minWidth: 0 }}>
        <div style={s.titleRow}>
          <h1 style={s.title}>{title}</h1>
          {count != null && (
            // The bare number was read out as a loose digit next to the
            // heading; this says what it counts.
            <span style={s.countPill} aria-label={`${count} items`}>{count}</span>
          )}
        </div>
        {subtitle && <p style={s.subtitle}>{subtitle}</p>}
      </div>
      {actions && <div style={s.actions}>{actions}</div>}
    </div>
  );
}

/* ── Toolbar ──────────────────────────────────────────────────────
   The search / filter strip. Wraps on narrow screens instead of overflowing. */
export function Toolbar({ children }) {
  return <div style={s.toolbar}>{children}</div>;
}

export function SearchInput({ value, onChange, placeholder = 'Search…' }) {
  return (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      style={s.search}
      className="modern-input"
    />
  );
}

/* ── Card ─────────────────────────────────────────────────────────
   The default surface for content. `pad={false}` for tables, which bring
   their own cell padding. */
export function Card({ children, pad = true, style }) {
  return (
    <div style={{ ...s.card, ...(pad ? { padding: layout.cardPad } : null), ...style }}>
      {children}
    </div>
  );
}

/* ── States ───────────────────────────────────────────────────────
   Loading, error and empty all render at the same size in the same place, so
   a page doesn't jump as it settles. */
export function Loading({ label = 'Loading…' }) {
  return <div style={s.state}>{label}</div>;
}

export function ErrorBanner({ children, onDismiss }) {
  return (
    <div style={s.error}>
      <Icon name="alert-triangle" size={13} />
      <span style={{ flex: 1 }}>{children}</span>
      {onDismiss && (
        <button onClick={onDismiss} style={s.errorClose} aria-label="Dismiss">
          <Icon name="x" size={12} />
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon = 'check', title, subtitle }) {
  return (
    <div style={s.empty}>
      <div style={s.emptyIcon}><Icon name={icon} size={22} color={t.textMuted} /></div>
      <div style={s.emptyTitle}>{title}</div>
      {subtitle && <div style={s.emptySub}>{subtitle}</div>}
    </div>
  );
}

/* ── Table ────────────────────────────────────────────────────────
   One cell padding and one header treatment, rather than 13px here and 10px
   there. `align="right"` for numeric columns. */
export function Table({ head, children, caption }) {
  return (
    <Card pad={false} style={{ overflow: 'hidden' }}>
      {/* A 7-column moderation table has no sensible 360px layout, so on narrow
          viewports it scrolls sideways inside its card rather than reflowing
          into unreadable stacks. tabIndex makes that region keyboard-scrollable,
          which is a WCAG requirement for any scrollable container. */}
      <div className="table-scroll" style={{ overflowX: 'auto' }} tabIndex={0} role="region" aria-label={caption || 'Data table'}>
        <table style={s.table}>
          {caption && <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{caption}</caption>}
          {head && <thead><tr>{head}</tr></thead>}
          <tbody>{children}</tbody>
        </table>
      </div>
    </Card>
  );
}

export function Th({ children, align = 'left', width }) {
  // scope="col" is what lets a screen reader announce the column name when it
  // reads a cell — without it a data table is just a grid of loose values.
  return <th scope="col" style={{ ...s.th, textAlign: align, width }}>{children}</th>;
}

export function Td({ children, align = 'left', muted = false, strong = false, style }) {
  return (
    <td style={{
      ...s.td,
      textAlign: align,
      ...(align === 'right' ? { fontVariantNumeric: 'tabular-nums' } : null),
      ...(muted  ? { color: t.textMuted, fontSize: 12.5 } : null),
      ...(strong ? { color: t.textPrimary, fontWeight: 600 } : null),
      ...style,
    }}>
      {children}
    </td>
  );
}

/* ── Avatar ───────────────────────────────────────────────────────
   A person's profile photo, falling back to their initials.

   Every page drew initials-only circles before, because the endpoints never
   sent a photo. They do now, but a user may still have none, and a photo URL
   can rot — so a broken image swaps back to initials rather than showing the
   browser's torn-page glyph. */
const initialsOf = (name) =>
  (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';

export function Avatar({ src, name, size = 38, rounded = '50%' }) {
  const [broken, setBroken] = useState(false);
  const box = {
    width: size, height: size, borderRadius: rounded, flexShrink: 0,
    objectFit: 'cover', display: 'block',
  };

  if (src && !broken) {
    return <img src={src} alt="" style={box} onError={() => setBroken(true)} loading="lazy" />;
  }
  return (
    <div style={{
      ...box, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: t.brandSoft, color: t.brand,
      fontWeight: 700, fontSize: Math.round(size * 0.36),
    }}>
      {initialsOf(name)}
    </div>
  );
}

/* A spot's photo — same fallback idea, but a square thumbnail and a map-pin
   glyph instead of initials, since a place has no initials worth showing. */
export function SpotThumb({ src, size = 38, radius: r = 10 }) {
  const [broken, setBroken] = useState(false);
  const box = { width: size, height: size, borderRadius: r, flexShrink: 0, objectFit: 'cover', display: 'block' };

  if (src && !broken) {
    return <img src={src} alt="" style={box} onError={() => setBroken(true)} loading="lazy" />;
  }
  return (
    <div style={{
      ...box, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: t.sidebarBg, border: `1px solid ${t.border}`, color: t.textMuted,
    }}>
      <Icon name="map-pin" size={Math.round(size * 0.45)} />
    </div>
  );
}

/* ── Pill ─────────────────────────────────────────────────────────
   Status chips: one shape and size everywhere, colour supplied by the page. */
export function Pill({ children, color = t.textSecondary, background = t.brandSoft, icon }) {
  return (
    <span style={{ ...s.pill, color, background }}>
      {icon && <Icon name={icon} size={10} />}
      {children}
    </span>
  );
}

/* ── Shared style objects ─────────────────────────────────────────
   For pages that keep their own JSX but must match everyone else's metrics.
   Spread these first in a page's own style object:

     const s = { ...pageStyles, myOwnThing: {...} };

   so the page shell, header, toolbar, states and table cells are defined in
   exactly one place. A page may still override a key by listing it after the
   spread — but if it does, that should be a deliberate exception. */
/* ONE canonical definition. These used to be written out twice — an exported
   `pageStyles` and a private `s` — with the same values under different names
   (`pageHeader`/`header`, `pageTitle`/`title`, `filterRow`/`toolbar`,
   `errorBanner`/`error`, `emptyState`/`empty`, `emptyText`/`emptyTitle`). Two
   copies of the same numbers is exactly the drift this file exists to prevent,
   so the aliases below now point at the SAME objects. */
const base = {
  page: {
    padding:   `${layout.padY}px ${layout.padX}px`,
    maxWidth:  layout.maxWidth,
    margin:    '0 auto',
    width:     '100%',
    boxSizing: 'border-box',
    display:   'flex',
    flexDirection: 'column',
    gap:       layout.gap,
  },
  // No bottom margin: the page's `gap` owns the spacing between sections, so
  // headers can't each pick their own (they used to range from 16 to 24).
  pageHeader:  { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' },
  titleRow:    { display: 'flex', alignItems: 'center', gap: 10 },
  // The one serif on the page. A dashboard's headings are the only place a
  // display face earns its keep — tables and controls stay in the sans.
  pageTitle:   { ...type.pageTitle, color: t.textPrimary, margin: 0 },
  countPill: {
    fontSize: 12, fontWeight: 700, color: t.textSecondary, background: t.sidebarBg,
    border: `1px solid ${t.border}`, borderRadius: radius.pill, padding: '2px 9px',
    ...type.num,
  },
  pageSub:     { fontSize: 13.5, color: t.textSecondary, margin: '5px 0 0', maxWidth: 680, lineHeight: 1.45 },
  actions:     { display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 },

  filterRow:   { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  searchInput: {
    flex: 1, minWidth: 220, padding: '9px 13px', borderRadius: radius.md,
    border: `1px solid ${t.border}`, fontSize: 13.5, color: t.textPrimary,
    outline: 'none', background: t.cardBg, boxSizing: 'border-box',
    fontFamily: 'inherit',
  },

  card: {
    background: t.cardBg, border: `1px solid ${t.border}`,
    borderRadius: radius.lg, boxShadow: shadow.sm,
  },

  state: {
    background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: radius.lg,
    padding: 48, textAlign: 'center', color: t.textSecondary, fontSize: 14,
  },

  errorBanner: {
    display: 'flex', alignItems: 'center', gap: 9,
    background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: radius.md,
    padding: '10px 14px', color: t.danger, fontSize: 13,
  },
  errorClose: {
    background: 'none', border: 'none', color: t.danger, cursor: 'pointer',
    display: 'flex', alignItems: 'center', padding: 2, marginLeft: 'auto',
  },

  emptyState: {
    background: t.cardBg, border: `1px dashed ${t.border}`, borderRadius: radius.lg,
    padding: '48px 24px', textAlign: 'center',
  },
  emptyIcon: {
    width: 46, height: 46, borderRadius: '50%', background: t.sidebarBg,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    margin: '0 auto 12px', color: t.textMuted,
  },
  emptyText: { fontSize: 15, fontWeight: 600, color: t.textPrimary },
  emptySub:  { fontSize: 13, color: t.textMuted, marginTop: 4 },

  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    padding: `11px ${layout.rowPadX}px`, textAlign: 'left', fontSize: 11, fontWeight: 700,
    color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em',
    borderBottom: `1px solid ${t.divider}`, whiteSpace: 'nowrap', background: t.sidebarBg,
  },
  td: {
    padding: `${layout.rowPadY}px ${layout.rowPadX}px`, fontSize: 13.5,
    color: t.textPrimary, borderBottom: `1px solid ${t.divider}`,
  },

  pill: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '3px 10px', borderRadius: radius.pill,
    fontSize: 11.5, fontWeight: 700, letterSpacing: '0.02em', whiteSpace: 'nowrap',
  },
};

// Both naming vocabularies are in use across the pages, so both resolve to the
// same object rather than to a second copy of the same numbers.
export const pageStyles = {
  ...base,
  header:     base.pageHeader,
  title:      base.pageTitle,
  subtitle:   base.pageSub,
  toolbar:    base.filterRow,
  search:     base.searchInput,
  error:      base.errorBanner,
  empty:      base.emptyState,
  emptyTitle: base.emptyText,
};

const s = pageStyles;

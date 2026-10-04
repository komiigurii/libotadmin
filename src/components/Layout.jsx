import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
   Title, one-line description, and an optional action on the right.
   EVERY page uses this — the count sits in the pill beside the title (not as
   "6 total" text on one page and "9 shown" on another), and actions sit on
   the right. `eyebrow` is the small line above the title (the dashboard's
   greeting). */
export function PageHeader({ title, subtitle, count, actions, eyebrow }) {
  return (
    <div style={s.header}>
      <div style={{ minWidth: 0 }}>
        {eyebrow && <p style={s.eyebrow}>{eyebrow}</p>}
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
// The API's server sleeps when idle and takes 30–60 s to answer the first
// request, so after a few seconds the loading state says why it's slow.
const WAKING_AFTER_MS = 4000;

export function Loading({ label = 'Loading…' }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), WAKING_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div style={s.state} role="status" aria-live="polite">
      {label}
      {slow && <div style={s.stateHint}>Waking up the server. The first load can take up to a minute.</div>}
    </div>
  );
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

/* Photos a traveler attached to a review (up to 4). Small squares; each opens
   the full photo in a new tab, so an admin judging a review or a report can
   see exactly what was posted. Cloudinary sends a 128px crop for the square
   rather than the full upload. */
const thumbOf = (url) =>
  /res\.cloudinary\.com\/.+\/image\/upload\//.test(url || '')
    ? url.replace('/image/upload/', '/image/upload/c_fill,w_128,h_128,f_auto,q_auto/')
    : url;

export function ReviewPhotos({ photos }) {
  if (!photos?.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0 2px' }}>
      {photos.map((p, i) => (
        <a
          key={p.url}
          href={p.url}
          target="_blank"
          rel="noreferrer"
          title={`Open photo ${i + 1} of ${photos.length}`}
          aria-label={`Open photo ${i + 1} of ${photos.length} in a new tab`}
          style={{ display: 'block', lineHeight: 0, borderRadius: radius.sm, outlineOffset: 2 }}
        >
          <img
            src={thumbOf(p.url)}
            alt=""
            loading="lazy"
            style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: radius.sm, border: `1px solid ${t.border}`, background: t.sidebarBg }}
          />
        </a>
      ))}
    </div>
  );
}

/* ── Pill ─────────────────────────────────────────────────────────
   Status chips: one shape and size everywhere, colour supplied by the page. */
export function Pill({ children, color = t.textSecondary, background = t.brandSoft, icon }) {
  return (
    <span style={{ ...s.pill, color, background }}>
      {icon && <Icon name={icon} size={11} weight="bold" />}
      {children}
    </span>
  );
}

/* ── Status ───────────────────────────────────────────────────────
   Pages used to pick their own status colours — "Pending" was purple on the
   Approval Queue and amber on My Submissions, uppercase on one and title case
   on the other. Tones are named once here; a status is a tone + icon + word,
   never colour alone. */
const TONES = {
  neutral: { color: t.textSecondary, background: t.sidebarBg },
  brand:   { color: t.brand,   background: t.brandSoft },
  info:    { color: t.info,    background: t.infoBg },
  success: { color: t.success, background: t.successBg },
  warning: { color: t.warning, background: t.warningBg },
  danger:  { color: t.danger,  background: t.dangerBg },
};

// The one approval vocabulary, shared by the Approval Queue, My Submissions,
// the dashboard and anything else with a pending → approved/rejected life.
const APPROVAL_STATUS = {
  pending:  { tone: 'warning', icon: 'clock', label: 'Pending' },
  approved: { tone: 'success', icon: 'check', label: 'Approved' },
  rejected: { tone: 'danger',  icon: 'x',     label: 'Rejected' },
};

export function StatusPill({ tone = 'neutral', icon, children }) {
  const c = TONES[tone] || TONES.neutral;
  return <Pill color={c.color} background={c.background} icon={icon}>{children}</Pill>;
}

export function ApprovalPill({ status }) {
  const st = APPROVAL_STATUS[status] || APPROVAL_STATUS.pending;
  return <StatusPill tone={st.tone} icon={st.icon}>{st.label}</StatusPill>;
}

/* ── Tag ──────────────────────────────────────────────────────────
   A neutral, outlined label for WHAT something is (a category, a request
   type, a place) — as opposed to StatusPill, which says what STATE it's in. */
export function Tag({ children, icon, tone }) {
  const danger = tone === 'danger';
  return (
    <span style={{ ...s.tag, ...(danger ? s.tagDanger : null) }}>
      {icon && <Icon name={icon} size={11} />}
      {children}
    </span>
  );
}

/* ── Button ───────────────────────────────────────────────────────
   One button. There were ~20 hand-rolled ones: five paddings, three radii,
   font sizes from 11 to 14, and a yellow "Refresh" — yellow is reserved for
   the one primary action on a screen.
     primary      yellow — the main thing to do here (Add spot, Send)
     secondary    outlined — everything neutral (Refresh, Cancel, View)
     success      soft green — approve / agree
     danger       soft red — reject / delete
     dangerSolid  solid red — irreversible (ban permanently)
   Border colour is a longhand so a variant can override it cleanly. */
export function Button({ variant = 'secondary', size = 'md', icon, children, style, type = 'button', ...rest }) {
  const off = !!rest.disabled;
  return (
    <button
      type={type}
      className="modern-btn"
      style={{ ...s.btn, ...s.btnSize[size], ...s.btnVariant[variant], ...(off ? s.btnOff : null), ...style }}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 12 : 14} />}
      {children}
    </button>
  );
}

/* ── Filter tabs ──────────────────────────────────────────────────
   Status filters were <select> dropdowns, sized differently on each page.
   A segmented row shows every option and its count at once, and switching is
   one click. aria-pressed tells a screen reader which one is on. */
export function FilterTabs({ options, value, onChange, label = 'Filter' }) {
  return (
    <div role="group" aria-label={label} style={s.filterTabs}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            style={{ ...s.filterTab, ...(on ? s.filterTabOn : null) }}
          >
            {o.label}
            {o.count != null && <span style={{ ...s.filterCount, ...(on ? s.filterCountOn : null) }}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ── Stat ─────────────────────────────────────────────────────────
   A headline figure: label · value · one line of context. Shared by the
   dashboard and Traveler Progress so a number looks the same wherever it is.
   With `to`, the whole tile links to the page behind the number. Values are
   proportional figures in the sans — tabular-nums look loose at this size. */
// `emphasis` is the condition itself (e.g. `waiting > 0`), not a flag to
// re-derive from `value` — values arrive formatted ("1,284"), which don't
// parse back to numbers.
export function Stat({ label, value, hint, icon, to, emphasis }) {
  const on = !!emphasis;
  const body = (
    <>
      {(icon || to) && (
        <div style={s.statTop}>
          {icon && <span style={{ ...s.statIcon, ...(on ? s.statIconOn : null) }}><Icon name={icon} size={16} /></span>}
          {to && <span style={s.statChevron}><Icon name="chevron-right" size={13} /></span>}
        </div>
      )}
      <div style={s.statValue}>{value ?? '—'}</div>
      <div style={s.statLabel}>{label}</div>
      {hint && <div style={{ ...s.statHint, ...(on ? { color: t.textSecondary } : null) }}>{hint}</div>}
    </>
  );
  const style = { ...s.stat, ...(on ? s.statOn : null) };
  return to
    ? <Link to={to} className="dash-link" style={style}>{body}</Link>
    : <div style={style}>{body}</div>;
}

/* ── List ─────────────────────────────────────────────────────────
   Item cards (a review, a request, a report) sit in one of these, 12px
   apart. They used to be direct children of the page with their own bottom
   margin, which stacked on top of the page gap. */
export function List({ children }) {
  return <div style={s.list}>{children}</div>;
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
  stateHint: { marginTop: 8, fontSize: 12.5, color: t.textMuted },

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
  tag: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '2px 9px', borderRadius: radius.pill,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.border,
    background: t.sidebarBg, color: t.textSecondary,
    fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap',
  },
  tagDanger: { background: t.dangerBg, borderColor: t.dangerBorder, color: t.danger },

  eyebrow: { ...type.label, color: t.textMuted, margin: '0 0 6px' },

  // ── Button ──
  btn: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: radius.md, borderWidth: 1, borderStyle: 'solid', borderColor: 'transparent',
    fontFamily: 'inherit', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
  },
  btnSize: {
    md: { padding: '8px 15px', fontSize: 13, minHeight: 36 },
    sm: { padding: '5px 11px', fontSize: 12, minHeight: 30 },
  },
  btnVariant: {
    primary:     { background: t.accent,    color: t.onAccent, fontWeight: 700, boxShadow: shadow.sm },
    secondary:   { background: t.cardBg,    color: t.textPrimary, borderColor: t.border },
    subtle:      { background: t.brandSoft, color: t.brand },
    success:     { background: t.successBg, color: t.success },
    danger:      { background: t.dangerBg,  color: t.danger },
    dangerSolid: { background: t.danger,    color: t.onDanger },
    warning:     { background: t.warningBg, color: t.warning },
  },
  btnOff: { opacity: 0.55, cursor: 'not-allowed' },

  // ── Filter tabs ──
  filterTabs: {
    display: 'inline-flex', flexWrap: 'wrap', gap: 2, padding: 3,
    background: t.cardBg, borderWidth: 1, borderStyle: 'solid', borderColor: t.border, borderRadius: radius.md,
  },
  filterTab: {
    display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 12px',
    border: 'none', borderRadius: radius.sm, background: 'transparent',
    color: t.textSecondary, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  // Same language as the sidebar's current-page pill.
  filterTabOn:   { background: t.brandSolid, color: t.onBrandSolid },
  filterCount:   { fontSize: 11, fontWeight: 700, padding: '0 6px', borderRadius: radius.pill, background: t.sidebarBg, color: t.textSecondary, lineHeight: '17px' },
  filterCountOn: { background: t.onBrandSolidSoft, color: t.onBrandSolid },

  // ── Stat ──
  stat: {
    display: 'flex', flexDirection: 'column', padding: '16px 18px', borderRadius: radius.lg,
    backgroundColor: t.cardBg, borderWidth: 1, borderStyle: 'solid', borderColor: t.border, boxShadow: shadow.sm,
    color: 'inherit', textDecoration: 'none', minWidth: 0,
  },
  // Only a figure that asks for action ("Waiting on you") earns the accent,
  // and only while it's above zero.
  statOn:      { borderColor: t.accent, backgroundImage: `linear-gradient(${t.accentBg}, ${t.accentBg})` },
  statTop:     { display: 'flex', alignItems: 'center', marginBottom: 12 },
  statIcon:    { width: 34, height: 34, borderRadius: radius.md, display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.brandSoft, color: t.brand },
  statIconOn:  { background: t.accent, color: t.onAccent },
  statChevron: { marginLeft: 'auto', color: t.textMuted, display: 'inline-flex' },
  statValue:   { fontSize: 30, fontWeight: 650, letterSpacing: '-0.02em', lineHeight: 1, color: t.textPrimary },
  statLabel:   { fontSize: 13, fontWeight: 600, color: t.textPrimary, marginTop: 8 },
  statHint:    { fontSize: 12, color: t.textMuted, marginTop: 3 },
  statGrid:    { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 },

  // ── List + item card ──
  // The one layout for "a thing to review": media on the left, title row with
  // date and pills, body text, small facts, then an optional tinted panel
  // for the form/actions. Reviews, reports, approval requests and a
  // moderator's own submissions all use it.
  list:      { display: 'flex', flexDirection: 'column', gap: 12 },
  item:      { background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: radius.lg, boxShadow: shadow.sm, overflow: 'hidden' },
  // Wraps: on a narrow screen the side buttons drop under the text instead of
  // squeezing it into a sliver.
  itemTop:   { display: 'flex', alignItems: 'flex-start', gap: 14, padding: '16px 18px', flexWrap: 'wrap' },
  itemMain:  { flex: '1 1 260px', minWidth: 0 },
  itemMeta:  { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  itemTitle: { fontSize: 14, fontWeight: 700, color: t.textPrimary },
  itemDate:  { fontSize: 12, color: t.textMuted },
  itemText:  { fontSize: 13.5, color: t.textSecondary, lineHeight: 1.5, margin: '6px 0 0', overflowWrap: 'anywhere' },
  itemFacts: { display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8 },
  itemFact:  { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: t.textMuted },
  itemSide:  { display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' },
  panel:     { borderTop: `1px solid ${t.divider}`, padding: '14px 18px 16px', background: t.sidebarBg },
  panelLabel:{ fontSize: 12, fontWeight: 600, color: t.textPrimary, margin: '0 0 6px' },
  panelNote: { fontSize: 12, color: t.textMuted, lineHeight: 1.5, margin: '10px 0 0' },
  buttonRow: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 },
  textarea: {
    width: '100%', padding: '9px 12px', borderRadius: radius.md, border: `1px solid ${t.border}`,
    fontSize: 13, color: t.textPrimary, background: t.cardBg, resize: 'vertical', outline: 'none',
    boxSizing: 'border-box', fontFamily: 'inherit',
  },
  select: {
    width: '100%', padding: '9px 12px', borderRadius: radius.md, border: `1px solid ${t.border}`,
    fontSize: 13, color: t.textPrimary, background: t.cardBg, outline: 'none', boxSizing: 'border-box',
    cursor: 'pointer', fontFamily: 'inherit',
  },
  // A person in a table cell: avatar, name, and email under it. Traveler
  // Progress, Inactive Accounts and Suspensions & Bans all show people.
  person:     { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 },
  personName: { fontWeight: 600, fontSize: 13.5, color: t.textPrimary, display: 'flex', alignItems: 'center', gap: 7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  personSub:  { fontSize: 12, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },

  // Long text in a table cell: one line, cut with an ellipsis (full text in
  // the title tooltip). Set on an inner block — table cells don't truncate.
  clampCell:   { display: 'block', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: t.textSecondary },
  pillStack:   { display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' },
  cellActions: { display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' },

  // Square icon well used as an item's media when there's no photo.
  mediaIcon: {
    width: 38, height: 38, borderRadius: 10, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: t.sidebarBg, borderWidth: 1, borderStyle: 'solid', borderColor: t.border, color: t.textMuted,
  },
  mediaIconDanger: { background: t.dangerBg, borderColor: t.dangerBorder, color: t.danger },
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

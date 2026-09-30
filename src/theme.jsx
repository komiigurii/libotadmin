import { useEffect, useState, useCallback } from 'react';

/*
 * Design tokens for the admin panel.
 *
 * Every colour below resolves to a CSS custom property defined in index.css,
 * where the light and dark values actually live. That indirection is what makes
 * the theme switchable without touching a single component: this panel styles
 * with module-scope inline style objects, which can't read a React hook, but
 * they can hold the string 'var(--card-bg)' perfectly well.
 *
 * Consequence worth knowing: these are OPAQUE STRINGS, not hex codes. You
 * cannot do arithmetic or string surgery on them — `${t.danger}44` to fake an
 * alpha channel produces 'var(--danger)44', which is invalid CSS and silently
 * drops the whole declaration. When you need a translucent variant, add a token
 * (see `dangerBorder`) rather than appending hex digits.
 */
export const theme = {
  bg:            'var(--bg)',
  sidebarBg:     'var(--sidebar-bg)',
  cardBg:        'var(--card-bg)',
  cardBgHover:   'var(--card-bg-hover)',
  border:        'var(--border)',
  divider:       'var(--divider)',

  textPrimary:   'var(--text-primary)',
  textSecondary: 'var(--text-secondary)',
  textMuted:     'var(--text-muted)',

  brand:           'var(--brand)',
  brandSolid:      'var(--brand-solid)',
  brandSolidHover: 'var(--brand-solid-hover)',
  brandSoft:       'var(--brand-soft)',

  // Yellow is the ONE "do the thing" button on a screen (save, sign in, add,
  // confirm); teal/cyan stays on selection, active states, icons and small
  // accents. Always paired with `onAccent` — white on this yellow fails contrast.
  accent:        'var(--accent)',
  accentBg:      'var(--accent-bg)',
  onAccent:      'var(--on-accent)',

  danger:        'var(--danger)',
  dangerBg:      'var(--danger-bg)',
  // Pre-mixed translucent border. Replaces the four `${t.danger}44` sites that
  // broke the moment colours became var() strings.
  dangerBorder:  'var(--danger-border)',
  // Text on a SOLID danger fill. Needs its own token because --danger flips
  // lightness between themes (dark red on light, pale red on dark), so a
  // hardcoded '#fff' or '#2A0E0E' fails contrast in one of the two.
  onDanger:      'var(--on-danger)',
  success:       'var(--success)',
  successBg:     'var(--success-bg)',
  warning:       'var(--warning)',
  warningBg:     'var(--warning-bg)',
  info:          'var(--info)',
  infoBg:        'var(--info-bg)',
  flagged:       'var(--flagged)',
  flaggedBg:     'var(--flagged-bg)',
  purple:        'var(--purple)',
  purpleBg:      'var(--purple-bg)',

  onBrandSolid:      'var(--on-brand-solid)',
  onBrandSolidMuted: 'var(--on-brand-solid-muted)',
  lattice:           'var(--lattice)',
  // Chart marks only — see index.css for why these aren't --brand.
  data1:             'var(--data-1)',
  data1Track:        'var(--data-1-track)',
};

export const radius = {
  sm: 8,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
};

export const shadow = {
  sm: 'var(--shadow-sm)',
  md: 'var(--shadow-md)',
  lg: 'var(--shadow-lg)',
};

/* ── Type ─────────────────────────────────────────────────────────────────
   Newsreader (display serif) for page titles and numerals that should carry
   weight; Schibsted Grotesk for everything else. Both self-hosted, see the
   @import block at the top of index.css. */
export const fonts = {
  display: "'Newsreader Variable', 'Newsreader', Georgia, serif",
  sans:    "'Schibsted Grotesk Variable', 'Schibsted Grotesk', system-ui, -apple-system, sans-serif",
  // Tables and IDs: tabular figures so columns of numbers line up and a
  // changing count doesn't make the row jitter.
  mono:    "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
};

export const type = {
  pageTitle: { fontFamily: fonts.display, fontSize: 26, fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.2 },
  cardTitle: { fontFamily: fonts.sans,    fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' },
  body:      { fontFamily: fonts.sans,    fontSize: 13.5, lineHeight: 1.5 },
  label:     { fontFamily: fonts.sans,    fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' },
  num:       { fontVariantNumeric: 'tabular-nums' },
};

/* ── Theme preference ─────────────────────────────────────────────────────
   Three-way, matching the mobile app's Settings control: an explicit choice, or
   "system" to follow the OS. Only the toggle UI needs this — colours reach
   components through CSS variables, so changing the theme re-renders nothing. */
const STORAGE_KEY = 'libot_admin_theme';

export const readThemePref = () => {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch { return 'system'; }
};

export const applyThemePref = (pref) => {
  const root = document.documentElement;
  // Removing the attribute hands control back to the prefers-color-scheme
  // media query in index.css, which is exactly what "system" means.
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
};

export function useThemePref() {
  const [pref, setPref] = useState(readThemePref);

  useEffect(() => { applyThemePref(pref); }, [pref]);

  const choose = useCallback((next) => {
    setPref(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* private mode */ }
  }, []);

  return [pref, choose];
}

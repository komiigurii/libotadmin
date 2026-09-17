// Dark theme, recolored to match the mobile app's palette (see
// LibotBulacan/context/ThemeContext.js — dark-mode tokens) instead of the
// old brown/mauve scheme: teal-black surfaces, cyan brand, yellow accent.
export const theme = {
  bg:            '#0E1C1E',   // page background — app's dark `background`
  sidebarBg:     '#0C3438',   // persistent nav column — app's dark `drawer`/hero surface
  cardBg:        '#172C2F',   // app's dark `card`
  cardBgHover:   '#1D3538',
  border:        '#2A4443',   // app's dark `cardBorder`
  divider:       '#233C3C',   // app's dark `divider`

  textPrimary:   '#EAF6F7',
  textSecondary: '#A6BEC0',
  textMuted:     '#7C9698',

  brand:          '#4FD0DC',  // cyan — icons/links/small accents (app's dark `brand`)
  brandSolid:     '#0C7A84',  // solid buttons — app's primary teal (pairs with white text)
  brandSolidHover:'#129AA6',
  brandSoft:      'rgba(79,208,220,0.14)',  // pill / active-state tint

  // Yellow accent — the app's CTA colour (ThemeContext `accent`). Same split of
  // work as the app: yellow is the ONE "do the thing" button on a screen (save,
  // sign in, add, confirm); teal/cyan stays on selection + active states, icons
  // and small accents. Always paired with dark `onAccent` text — white on this
  // yellow fails contrast.
  accent:        '#F2CE1B',
  accentBg:      'rgba(242,206,27,0.16)',
  onAccent:      '#2C2810',

  danger:        '#f87171',
  dangerBg:      'rgba(248,113,113,0.14)',
  success:       '#4ade80',
  successBg:     'rgba(74,222,128,0.14)',
  warning:       '#fbbf24',
  warningBg:     'rgba(251,191,36,0.14)',
  info:          '#60a5fa',
  infoBg:        'rgba(96,165,250,0.14)',
  flagged:       '#fb7185',
  flaggedBg:     'rgba(251,113,133,0.16)',
  purple:        '#a78bfa',
  purpleBg:      'rgba(167,139,250,0.16)',
};

// Static design tokens — mirrors the app's ThemeContext scales (spacing/
// radius/shadow) so the admin panel's corners, spacing and elevation feel
// like the same product instead of a bespoke, page-by-page set of numbers.
export const radius = {
  sm: 8,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
};

export const shadow = {
  sm: '0 4px 14px rgba(0,0,0,0.28)',
  md: '0 10px 28px rgba(0,0,0,0.34)',
  lg: '0 18px 48px rgba(0,0,0,0.42)',
};

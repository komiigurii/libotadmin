import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { theme as t, radius, fonts, useThemePref } from '../theme';
import Icon from './Icon';
import logo from '../assets/logo.png';
import { clearSession } from '../auth/session';
import { confirmAction } from './AppAlert';

/*
 * Persistent left rail.
 *
 * Shape: a plain teal rail holding a cream panel edge to edge. The emblem and
 * title sit on the teal at the top, the links on the panel, a risograph print
 * of Barasoain Church at the foot of the panel whose teal ground runs straight
 * into the band below, and the theme switch and sign-out on that band. The
 * panel's single oversized corner is the same signature as the mobile app's
 * sign-in screens.
 *
 * Responsive behaviour lives in App.css keyed off `.admin-sidebar`, because
 * inline styles can't express a media query:
 *   > 1100px  full 248px rail with labels
 *   ≤ 1100px  68px icon rail — labels are visually hidden, NOT removed, so
 *             screen readers still announce them
 *   ≤ 720px   a slim top bar (emblem, the page you're on, a menu button);
 *             the menu opens this same rail, full labels and all, as a
 *             drawer from the left. It used to be a single row of eight
 *             unlabelled icons plus the theme switch and sign-out, ~560px
 *             wide on a ~390px phone, so it scrolled sideways and you had to
 *             guess what each icon was.
 *   short screens drop the drawing before the links run out of room.
 */

// Grouped by what the work IS rather than listed flat. Names say what the page
// holds in plain words — "Approval Queue", not "Mod Requests"; "Reviews &
// Feedback", because the app calls them reviews — and each page's heading
// uses the same name, so the link and the page it opens always agree.
//
// Paths are unchanged from before the rename, so bookmarks keep working.
const ADMIN_NAV = [
  { group: 'Overview', items: [
    { label: 'Dashboard',          path: '/dashboard',         icon: 'grid' },
  ] },
  { group: 'Content', items: [
    { label: 'Spot Management',    path: '/spots',             icon: 'map-pin' },
    { label: 'Approval Queue',     path: '/mod-requests',      icon: 'inbox' },
  ] },
  { group: 'Community', items: [
    { label: 'Reviews & Feedback', path: '/comments',          icon: 'message-square' },
    { label: 'Reported Reviews',   path: '/reported-comments', icon: 'flag' },
  ] },
  { group: 'Travelers', items: [
    { label: 'Traveler Progress',  path: '/user-progress',     icon: 'award' },
    { label: 'Inactive Accounts',  path: '/inactive-users',    icon: 'clock' },
    { label: 'Suspensions & Bans', path: '/banned-accounts',   icon: 'slash' },
  ] },
];

// A moderator's job is attractions in their municipality and the requests
// they've sent — per the system spec, nothing else. (Reviews, the leaderboard
// and inactive accounts are admin-only, in the panel and on the backend.)
const MODERATOR_NAV = [
  { group: 'Overview', items: [
    { label: 'Dashboard',          path: '/dashboard',          icon: 'grid' },
  ] },
  { group: 'Content', items: [
    { label: 'Spot Management',    path: '/spots',              icon: 'map-pin' },
    { label: 'My Submissions',     path: '/my-review-requests', icon: 'send' },
  ] },
];

/* Barasoain Church, Malolos, as a three-colour risograph print: yellow,
   aqua and teal passes that overprint (multiply) where they cross, each with
   print grain and a slightly-off registration. The church is a solid teal
   silhouette with its windows knocked out, so the yellow pass shows through
   as lit windows. Halftone dots shade the wall.

   The ground at the bottom is NOT an ink: it is the exact frame teal, with
   no grain, so the print runs straight into the band below with no seam.

   Inks are theme variables (index.css), so dark mode prints lighter inks.
   Decorative, so hidden from screen readers. */
const SILHOUETTE =
  // tower, with two arched windows
  'M16 142 V76 H20 V56 Q31 38 42 56 V76 H46 V142 Z ' +
  'M28 70 V64 a3 3 0 0 1 6 0 V70 Z M27 102 V92 a4 4 0 0 1 8 0 V102 Z ' +
  // facade and baroque pediment: rose window, cornice line, two windows, door
  'M46 142 V68 L56 64 Q62 62 64 57 L80 41 L96 57 Q98 62 104 64 L114 68 V142 Z ' +
  'M75 60 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0 Z M48 73 H112 V75 H48 Z ' +
  'M54 102 V92 a4.5 4.5 0 0 1 9 0 V102 Z M97 102 V92 a4.5 4.5 0 0 1 9 0 V102 Z ' +
  'M69 142 V116 a11 11 0 0 1 22 0 V142 Z';

function SidebarArt() {
  const ink = (color) => ({ fill: color, mixBlendMode: 'multiply' });
  return (
    <div className="sidebar-art" style={s.art} aria-hidden="true">
      <svg viewBox="0 0 248 172" style={s.artSvg} preserveAspectRatio="xMidYMax slice">
        <defs>
          {/* Print grain: knocks random specks out of each pass. */}
          <filter id="libot-riso-grain" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="1.15" numOctaves="2" seed="7" result="noise" />
            <feColorMatrix in="noise" type="matrix" result="specks"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -3.2 0 0 0 2.75" />
            <feComposite in="SourceGraphic" in2="specks" operator="in" />
          </filter>
          <pattern id="libot-riso-dots" width="3.4" height="3.4" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
            <circle cx="1.7" cy="1.7" r="0.95" style={{ fill: 'var(--riso-teal)' }} />
          </pattern>
        </defs>

        {/* Yellow pass, a touch off-register up and right. */}
        <g filter="url(#libot-riso-grain)" transform="translate(1.6 -1.1)" style={{ mixBlendMode: 'multiply' }}>
          <circle cx="116" cy="46" r="21" style={ink('var(--riso-yellow)')} />
          <rect x="27" y="62" width="8" height="9" style={ink('var(--riso-yellow)')} />
          <rect x="26" y="88" width="10" height="15" style={ink('var(--riso-yellow)')} />
          <circle cx="80" cy="60" r="6" style={ink('var(--riso-yellow)')} />
          <rect x="53" y="87" width="11" height="16" style={ink('var(--riso-yellow)')} />
          <rect x="96" y="87" width="11" height="16" style={ink('var(--riso-yellow)')} />
          <rect x="68" y="104" width="24" height="38" style={ink('var(--riso-yellow)')} />
        </g>

        {/* Aqua pass, off-register the other way. */}
        <g filter="url(#libot-riso-grain)" transform="translate(-1 0.9)" style={{ mixBlendMode: 'multiply' }}>
          <path d="M-8 74 a13 13 0 0 1 22 -11 a16 16 0 0 1 29 5 a11 11 0 0 1 5 20 H-8 Z" style={ink('var(--riso-aqua)')} />
          <path d="M150 140 a18 18 0 0 1 26 -20 a22 22 0 0 1 40 3 a15 15 0 0 1 28 17 Z" style={ink('var(--riso-aqua)')} />
          {/* Kept clear of the tagline: teal text on aqua would drop below 4.5:1. */}
          <path d="M126 102 a8 8 0 0 1 13 -6 a10 10 0 0 1 18 2 a7 7 0 0 1 6 10 H126 Z" style={ink('var(--riso-aqua)')} />
        </g>

        {/* Teal pass: the church, its crosses, halftone shading, the wall. */}
        <g filter="url(#libot-riso-grain)" style={{ mixBlendMode: 'multiply' }}>
          <path d={SILHOUETTE} fillRule="evenodd" style={ink('var(--riso-teal)')} />
          <path d="M30 42 V30 H32 V42 Z M27 33 H35 V35 H27 Z M79 42 V28 H81 V42 Z M75 31 H85 V33 H75 Z" style={ink('var(--riso-teal)')} />
          <rect x="102" y="68" width="12" height="74" fill="url(#libot-riso-dots)" style={{ mixBlendMode: 'multiply' }} />
          <rect x="0" y="130" width="248" height="2.4" style={ink('var(--riso-teal)')} />
          <rect x="0" y="132" width="248" height="16" fill="url(#libot-riso-dots)" style={{ mixBlendMode: 'multiply' }} />
        </g>

        {/* Ground: plain frame teal, the same colour as the band below. */}
        <path d="M0 152 C 26 142, 46 158, 74 149 S 122 141, 148 150 S 204 158, 248 146 V172 H0 Z"
          style={{ fill: 'var(--brand-solid)' }} />
      </svg>
      <p className="sidebar-tagline" style={s.tagline}>
        Discover,<br />Explore,<br />Experience<br />Bulacan.
      </p>
    </div>
  );
}

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const role     = localStorage.getItem('role');
  const city     = localStorage.getItem('city') || '';
  const [pref, setPref] = useThemePref();

  // Asks first: a stray click on the band at the foot of the rail used to sign
  // you straight out.
  const logout = async () => {
    const ok = await confirmAction('You will need your username and password to sign back in.', {
      title: 'Sign out of the console?', confirmText: 'Sign out', tone: 'warning',
    });
    if (!ok) return;
    clearSession(); // token, role and city — city used to be left behind
    navigate('/login');
  };

  const isModerator = role === 'moderator';
  const nav = isModerator ? MODERATOR_NAV : ADMIN_NAV;
  const home = '/dashboard';
  const current = nav.flatMap((g) => g.items).find((i) => i.path === location.pathname);

  // ── Phone drawer (App.css shows it only at ≤ 720px) ──
  const [menuOpen, setMenuOpen] = useState(false);
  const menuBtnRef = useRef(null);
  const closeBtnRef = useRef(null);
  const wasOpen = useRef(false);

  // Picking a page closes it.
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  // While open: Esc closes, the page behind doesn't scroll, and focus moves
  // into the drawer — then back to the menu button when it closes.
  useEffect(() => {
    if (!menuOpen) {
      if (wasOpen.current) menuBtnRef.current?.focus();
      wasOpen.current = false;
      return undefined;
    }
    wasOpen.current = true;
    closeBtnRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [menuOpen]);

  const themeOptions = [
    { key: 'light',  label: 'Light',  icon: 'sun' },
    { key: 'dark',   label: 'Dark',   icon: 'moon' },
    { key: 'system', label: 'System', icon: 'monitor' },
  ];

  return (
    <>
    <header className="mobile-bar" style={s.mobileBar}>
      <button
        type="button"
        onClick={() => navigate(home)}
        style={s.mobileBrand}
        aria-label="Go to dashboard"
      >
        <img src={logo} alt="" style={s.mobileLogo} />
      </button>
      <div style={s.mobileTitle}>{current?.label || (isModerator ? 'Moderator Console' : 'Admin Console')}</div>
      <button
        ref={menuBtnRef}
        type="button"
        onClick={() => setMenuOpen(true)}
        style={s.menuBtn}
        aria-label="Open menu"
        aria-expanded={menuOpen}
        aria-controls="admin-nav"
      >
        <Icon name="menu" size={22} color={t.onBrandSolid} />
      </button>
    </header>
    {menuOpen && <div className="nav-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />}

    <nav id="admin-nav" className={`admin-sidebar${menuOpen ? ' open' : ''}`} style={s.sidebar} aria-label="Main">
      <button
        ref={closeBtnRef}
        type="button"
        className="drawer-close"
        onClick={() => setMenuOpen(false)}
        style={s.drawerClose}
        aria-label="Close menu"
      >
        <Icon name="x" size={18} color={t.onBrandSolid} />
      </button>
      <div
        className="sidebar-brand"
        style={s.brand}
        onClick={() => navigate(home)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(home); } }}
        aria-label={`Libot Bulacan ${isModerator ? 'Moderator' : 'Admin'} Console — go to dashboard`}
      >
        <span className="sidebar-emblem" style={s.emblem}>
          <img src={logo} alt="" style={s.logo} />
        </span>
        <div className="sidebar-text" style={s.brandText}>
          <div style={s.brandName}>Libot Bulacan</div>
          <div style={s.brandSub}>{isModerator ? 'Moderator Console' : 'Admin Console'}</div>
          <div style={s.scope}>
            <Icon name="map-pin" size={11} color={t.onBrandSolid} />
            {isModerator ? (city || 'No city assigned') : 'All of Bulacan'}
          </div>
        </div>
      </div>

      <div className="sidebar-panel" style={s.panel}>
        <div className="sidebar-section" style={s.navSection}>
          <div className="nav-groups" style={s.groups}>
            {nav.map((section, i) => (
              // The group names used to be printed as headings; a rule between
              // groups does the same job more quietly. The name stays for
              // screen readers.
              <div
                key={section.group}
                role="group"
                aria-label={section.group}
                className="nav-group"
                style={{ ...s.group, ...(i > 0 ? s.groupRule : {}) }}
              >
                <div className="sidebar-links" style={s.links}>
                  {section.items.map((item) => {
                    const active = location.pathname === item.path;
                    return (
                      <button
                        key={item.path}
                        onClick={() => navigate(item.path)}
                        className="nav-link-btn"
                        // aria-current is how a screen reader knows which page
                        // it's on; the filled pill only says it visually.
                        aria-current={active ? 'page' : undefined}
                        title={item.label}
                        style={{ ...s.link, ...(active ? s.linkActive : {}) }}
                      >
                        <Icon
                          name={item.icon}
                          size={17}
                          color={active ? t.onBrandSolid : 'currentColor'}
                          weight={active ? 'fill' : 'regular'}
                        />
                        <span className="sidebar-text">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Inside the scrolling list, pushed to the bottom: with room to
              spare it sits at the foot of the panel, and on a short screen it
              scrolls away below the links instead of squeezing them. */}
          <SidebarArt />
        </div>
      </div>

      <div className="sidebar-footer" style={s.footer}>
        {/* Three-way, matching the mobile app's Settings control. "System"
            follows the OS rather than pinning a choice. */}
        <div className="theme-row" style={s.themeRow} role="radiogroup" aria-label="Colour theme">
          {themeOptions.map((o) => {
            const on = pref === o.key;
            return (
              <button
                key={o.key}
                onClick={() => setPref(o.key)}
                role="radio"
                aria-checked={on}
                aria-label={`${o.label} theme`}
                title={`${o.label} theme`}
                className="theme-btn"
                style={{ ...s.themeBtn, ...(on ? s.themeBtnOn : {}) }}
              >
                <Icon name={o.icon} size={14} color={on ? t.brand : t.onBrandSolid} />
              </button>
            );
          })}
        </div>

        <button onClick={logout} className="logout-btn" style={s.logoutBtn} title="Sign out">
          <Icon name="log-out" size={15} color={t.onBrandSolid} />
          <span className="sidebar-text">Sign out</span>
        </button>
      </div>
    </nav>
    </>
  );
}

/* On the teal frame, a black wash rather than a white one: white text on a
   white-tinted chip drops under 4.5:1, on a darkened chip it rises. The frame
   is teal in both themes, so one value serves both. */
const ON_FRAME_WELL = 'rgba(0,0,0,0.18)';

const s = {
  sidebar: {
    display: 'flex', flexDirection: 'column', width: 248, minWidth: 248,
    // dvh, not vh: on mobile browsers vh includes the collapsing URL bar, so a
    // 100vh rail is taller than the visible viewport and clips its own footer.
    height: '100dvh', boxSizing: 'border-box',
    background: t.brandSolid,
    position: 'sticky', top: 0, flexShrink: 0,
  },

  brand: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
    gap: 12, cursor: 'pointer', padding: '24px 0 20px',
  },
  emblem: {
    display: 'grid', placeItems: 'center', width: 72, height: 72, borderRadius: 24,
    background: ON_FRAME_WELL, boxShadow: 'inset 0 0 0 1px var(--on-brand-solid-soft)',
  },
  logo: { width: 50, height: 50, objectFit: 'contain', borderRadius: 14, display: 'block' },
  brandText: { minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' },
  // 19px, not the 25px "LIBOT" had: "LIBOT BULACAN" in these capitals is
  // 212px wide at 19px (279px at 25px), so it stays one line in the 248px rail
  // with ~18px clear on each side.
  brandName: {
    fontFamily: fonts.display, color: t.onBrandSolid, fontWeight: 700, fontSize: 19,
    lineHeight: 1, letterSpacing: '0.18em', textTransform: 'uppercase', whiteSpace: 'nowrap',
    // Tracking adds space after the last letter too; this evens it out so the
    // word sits on the centre line.
    paddingLeft: '0.18em',
  },
  // nowrap: "Moderator Console" must stay one line in the 248px rail.
  brandSub: {
    marginTop: 7, color: t.onBrandSolidMuted, fontSize: 10, fontWeight: 700,
    letterSpacing: '0.24em', textTransform: 'uppercase', whiteSpace: 'nowrap', paddingLeft: '0.24em',
  },
  scope: {
    marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: 200,
    padding: '4px 11px', borderRadius: radius.pill, background: ON_FRAME_WELL,
    color: t.onBrandSolid, fontSize: 11.5, fontWeight: 600,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },

  // Edge to edge, with one big corner on the top left. No corner at the foot:
  // the print's teal ground carries the panel straight into the band below.
  panel: {
    flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column',
    background: t.sidebarBg, borderRadius: '30px 0 0 0', overflow: 'hidden',
  },
  navSection: {
    flex: '1 1 auto', minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
    display: 'flex', flexDirection: 'column', padding: '20px 12px 0',
  },
  groups:     { display: 'flex', flexDirection: 'column', marginBottom: 18 },
  group:      { display: 'flex', flexDirection: 'column' },
  groupRule:  { marginTop: 10, paddingTop: 10, borderTop: `1px solid ${t.divider}` },
  links:      { display: 'flex', flexDirection: 'column', gap: 3 },
  link: {
    display: 'flex', alignItems: 'center', gap: 12,
    textAlign: 'left', padding: '10px 14px', borderRadius: 12, border: 'none',
    background: 'transparent', color: t.textSecondary, fontWeight: 500, fontSize: 13.5,
    cursor: 'pointer', transition: 'background 0.15s, color 0.15s, box-shadow 0.15s',
    width: '100%', fontFamily: 'inherit', minHeight: 42,
  },
  // A filled pill with a teal glow under it: the current page is the one
  // thing in the rail that should be unmistakable at a glance.
  linkActive: {
    background: t.brandSolid, color: t.onBrandSolid, fontWeight: 600,
    boxShadow: '0 8px 18px -10px var(--brand-solid)',
  },

  // Bleeds to the panel's edges (cancelling the list's 12px padding) and is
  // pushed to the bottom by the auto top margin.
  // isolation: the inks overprint each other, not the panel behind them.
  art: { position: 'relative', flexShrink: 0, height: 172, margin: 'auto -12px 0', isolation: 'isolate' },
  artSvg: { position: 'absolute', left: 0, bottom: 0, width: '100%', height: '100%', display: 'block' },
  // Printed in teal with the yellow pass slipping out from under it — the
  // same misregistration as the print. The teal carries the contrast; the
  // yellow is decoration.
  tagline: {
    position: 'absolute', right: 14, top: 4, margin: 0, textAlign: 'right',
    fontFamily: fonts.display, fontStyle: 'italic', fontWeight: 700, fontSize: 17,
    lineHeight: 1.04, color: t.brand, letterSpacing: '-0.01em',
    textShadow: `1.4px 1.1px 0 ${t.accent}`,
  },

  footer: { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px 16px' },

  // ── Phone top bar + drawer close. Display comes from App.css. ──
  mobileBar: {
    position: 'sticky', top: 0, zIndex: 30, alignItems: 'center', gap: 12,
    minHeight: 56, padding: '8px 10px 8px 12px', boxSizing: 'border-box',
    background: t.brandSolid, color: t.onBrandSolid,
  },
  mobileBrand: {
    display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 12, flexShrink: 0,
    border: 'none', padding: 0, cursor: 'pointer', background: ON_FRAME_WELL,
    boxShadow: 'inset 0 0 0 1px var(--on-brand-solid-soft)',
  },
  mobileLogo: { width: 28, height: 28, objectFit: 'contain', borderRadius: 8, display: 'block' },
  mobileTitle: {
    flex: 1, minWidth: 0, fontSize: 15.5, fontWeight: 650, letterSpacing: '-0.01em',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  menuBtn: {
    display: 'grid', placeItems: 'center', width: 44, height: 44, borderRadius: 12, flexShrink: 0,
    border: 'none', padding: 0, cursor: 'pointer', background: ON_FRAME_WELL,
  },
  drawerClose: {
    position: 'absolute', top: 12, right: 12, zIndex: 1,
    placeItems: 'center', width: 36, height: 36, borderRadius: 10,
    border: 'none', padding: 0, cursor: 'pointer', background: ON_FRAME_WELL,
  },
  themeRow: {
    display: 'flex', gap: 2, padding: 3, borderRadius: radius.md, background: ON_FRAME_WELL,
  },
  themeBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 30, minHeight: 30, borderRadius: radius.sm, border: 'none', background: 'transparent',
    cursor: 'pointer', transition: 'background 0.15s',
  },
  themeBtnOn: { background: t.sidebarBg },
  logoutBtn: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '8px 12px', borderRadius: radius.md,
    border: '1px solid var(--on-brand-solid-soft)', background: 'transparent', color: t.onBrandSolid,
    fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 36,
    transition: 'background 0.15s, border-color 0.15s', fontFamily: 'inherit',
  },
};

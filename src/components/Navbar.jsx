import { useNavigate, useLocation } from 'react-router-dom';
import { theme as t, radius, fonts, useThemePref } from '../theme';
import Icon from './Icon';
import logo from '../assets/logo.png';
import { clearSession } from '../auth/session';

/*
 * Persistent left rail.
 *
 * Shape: a solid teal frame (with the capiz lattice) holding a cream panel.
 * The emblem and title sit on the teal at the top, the links on the panel,
 * a drawing of Barasoain Church at the foot of the panel, and the theme switch
 * and sign-out back on the teal at the bottom. The panel's single oversized
 * corner is the same signature as the mobile app's sign-in screens.
 *
 * Responsive behaviour lives in App.css keyed off `.admin-sidebar`, because
 * inline styles can't express a media query:
 *   > 1100px  full 248px rail with labels
 *   ≤ 1100px  68px icon rail — labels are visually hidden, NOT removed, so
 *             screen readers still announce them
 *   ≤ 720px   horizontal bar across the top
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

/* Barasoain Church, Malolos, in line on the panel colour: bell tower, the
   baroque pediment, rose window and arched door, standing on an adobe wall
   with the sun behind it. Every colour is a theme variable, so it redraws
   itself for dark mode. Decorative, so hidden from screen readers. */
function SidebarArt() {
  const line  = { fill: 'none', stroke: t.brand, strokeWidth: 1.6, strokeLinejoin: 'round', strokeLinecap: 'round' };
  const solid = { ...line, fill: t.cardBg };
  return (
    <div className="sidebar-art" style={s.art} aria-hidden="true">
      <svg viewBox="0 0 228 150" style={s.artSvg} preserveAspectRatio="xMinYMax meet">
        {/* clouds */}
        <path d="M-6 58 a12 12 0 0 1 20 -10 a14 14 0 0 1 26 4 a10 10 0 0 1 4 18 h-50 z" style={{ fill: 'var(--illus-cloud)' }} />
        <path d="M150 128 a16 16 0 0 1 22 -18 a20 20 0 0 1 36 2 a14 14 0 0 1 26 16 z" style={{ fill: 'var(--illus-cloud)' }} />
        {/* sun */}
        <circle cx="108" cy="40" r="17" style={{ fill: t.accent }} />
        {/* bell tower */}
        <path d="M18 128 V72 H46 V128 Z" style={solid} />
        <path d="M21 72 V52 H43 V72" style={solid} />
        <path d="M24 52 Q32 38 40 52" style={solid} />
        <path d="M32 44 V34 M29 37.5 H35" style={line} />
        <path d="M28 66 V60 a4 4 0 0 1 8 0 V66" style={line} />
        <path d="M27 96 V86 a5 5 0 0 1 10 0 V96" style={line} />
        {/* facade and pediment */}
        <path d="M46 128 V64 Q54 52 64 52 Q71 38 80 35 Q89 38 96 52 Q106 52 114 64 V128 Z" style={solid} />
        <path d="M80 35 V24 M76 28 H84" style={line} />
        <circle cx="80" cy="56" r="5.5" style={line} />
        <path d="M46 70 H114" style={line} />
        <path d="M69 128 V106 a11 11 0 0 1 22 0 V128" style={line} />
        <path d="M54 98 V88 a4.5 4.5 0 0 1 9 0 V98 Z M97 98 V88 a4.5 4.5 0 0 1 9 0 V98 Z" style={line} />
        {/* adobe wall */}
        <path d="M0 128 H228 V150 H0 Z" style={{ ...line, fill: 'var(--illus-wall)' }} />
        <path d="M0 139 H228 M14 128 V139 M44 139 V150 M74 128 V139 M104 139 V150 M134 128 V139 M164 139 V150 M194 128 V139 M224 139 V150"
          style={{ ...line, strokeWidth: 1, strokeOpacity: 0.4 }} />
      </svg>
      <p className="sidebar-tagline" style={s.tagline}>
        Discover,<br />Explore,<br />Experience<br /><span style={s.taglineMark}>Bulacan.</span>
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

  const logout = () => {
    clearSession(); // token, role and city — city used to be left behind
    navigate('/login');
  };

  const isModerator = role === 'moderator';
  const nav = isModerator ? MODERATOR_NAV : ADMIN_NAV;
  const home = '/dashboard';

  const themeOptions = [
    { key: 'light',  label: 'Light',  icon: 'sun' },
    { key: 'dark',   label: 'Dark',   icon: 'moon' },
    { key: 'system', label: 'System', icon: 'monitor' },
  ];

  return (
    <nav className="admin-sidebar capiz-lattice" style={s.sidebar} aria-label="Main">
      <div
        className="sidebar-brand"
        style={s.brand}
        onClick={() => navigate(home)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(home); } }}
        aria-label={`Libot ${isModerator ? 'Moderator' : 'Admin'} Console — go to dashboard`}
      >
        <span className="sidebar-emblem" style={s.emblem}>
          <img src={logo} alt="" style={s.logo} />
        </span>
        <div className="sidebar-text" style={s.brandText}>
          <div style={s.brandName}>Libot</div>
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
    // background-COLOR so the capiz-lattice image layer from App.css survives.
    backgroundColor: t.brandSolid,
    paddingLeft: 10,
    position: 'sticky', top: 0, flexShrink: 0,
  },

  brand: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
    gap: 12, cursor: 'pointer',
    // The frame's 10px sits on the left, so pad the right to match and keep
    // the emblem centred on the whole rail.
    padding: '24px 10px 20px 0',
  },
  emblem: {
    display: 'grid', placeItems: 'center', width: 72, height: 72, borderRadius: 24,
    background: ON_FRAME_WELL, boxShadow: 'inset 0 0 0 1px var(--on-brand-solid-soft)',
  },
  logo: { width: 50, height: 50, objectFit: 'contain', borderRadius: 14, display: 'block' },
  brandText: { minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' },
  brandName: {
    fontFamily: fonts.display, color: t.onBrandSolid, fontWeight: 700, fontSize: 25,
    lineHeight: 1, letterSpacing: '0.18em', textTransform: 'uppercase',
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

  // One big corner on the top left, a smaller one at the foot — the panel
  // reads as a sheet tucked into the frame, open towards the page.
  panel: {
    flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column',
    background: t.sidebarBg, borderRadius: '30px 0 0 22px', overflow: 'hidden',
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
  art: { position: 'relative', flexShrink: 0, height: 150, margin: 'auto -12px 0' },
  artSvg: { position: 'absolute', left: 0, bottom: 0, width: '100%', height: '100%', overflow: 'visible' },
  tagline: {
    position: 'absolute', right: 14, top: 6, margin: 0, textAlign: 'right',
    fontFamily: fonts.display, fontStyle: 'italic', fontWeight: 600, fontSize: 17,
    lineHeight: 1.04, color: t.brand, letterSpacing: '-0.01em',
  },
  // The brand yellow as a marker stroke under the last word. Yellow can't be
  // the text colour on cream (it fails contrast), but it can underline it.
  taglineMark: { boxShadow: `inset 0 -0.16em 0 ${t.accent}`, padding: '0 2px' },

  footer: { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px 16px 4px' },
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

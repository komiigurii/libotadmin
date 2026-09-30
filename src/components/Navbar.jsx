import { useNavigate, useLocation } from 'react-router-dom';
import { theme as t, radius, shadow, fonts, useThemePref } from '../theme';
import Icon from './Icon';
import logo from '../assets/logo.png';
import { clearSession } from '../auth/session';

/*
 * Persistent left rail.
 *
 * Responsive behaviour lives in App.css keyed off `.admin-sidebar`, because
 * inline styles can't express a media query:
 *   > 1100px  full 248px rail with labels
 *   ≤ 1100px  68px icon rail — labels are visually hidden, NOT removed, so
 *             screen readers still announce them
 *   ≤ 720px   horizontal bar across the top
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
    <nav className="admin-sidebar" style={s.sidebar} aria-label="Main">
      {/* The one bold surface in the panel: solid brand teal under a capiz
          window lattice — the shell-paned windows of Bulacan's heritage
          houses — so the console has a face of its own instead of a logo
          floating on a grey rail. */}
      <div
        className="sidebar-brand capiz-lattice"
        style={s.brand}
        onClick={() => navigate(home)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(home); } }}
        aria-label={`Libot ${isModerator ? 'Moderator' : 'Admin'} Console — go to dashboard`}
      >
        <img src={logo} alt="" style={s.logo} />
        <div className="sidebar-text" style={s.brandText}>
          <div style={s.brandName}>Libot</div>
          <div style={s.brandSub}>{isModerator ? 'Moderator Console' : 'Admin Console'}</div>
        </div>
      </div>

      <div className="sidebar-section sidebar-identity" style={s.identity}>
        <span style={{ ...s.rolePill, ...(isModerator ? s.rolePillMod : s.rolePillAdmin) }}>
          <span style={{ ...s.roleDot, background: isModerator ? t.info : t.brand }} aria-hidden="true" />
          {isModerator ? 'Moderator' : 'Admin'}
        </span>
        <span className="sidebar-text" style={s.scope}>
          {isModerator ? (city || 'No city assigned') : 'All of Bulacan'}
        </span>
      </div>

      <div className="sidebar-section" style={s.navSection}>
        <div className="nav-groups" style={s.groups}>
          {nav.map((section) => (
            <div key={section.group} className="nav-group" style={s.group}>
              <p className="nav-label" style={s.navLabel}>{section.group}</p>
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
                        size={16}
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
                style={{ ...s.themeBtn, ...(on ? s.themeBtnOn : {}) }}
              >
                <Icon name={o.icon} size={14} color={on ? t.brand : 'currentColor'} />
              </button>
            );
          })}
        </div>

        <button onClick={logout} className="logout-btn" style={s.logoutBtn} title="Sign out">
          <Icon name="log-out" size={14} />
          <span className="sidebar-text">Sign out</span>
        </button>
      </div>
    </nav>
  );
}

const s = {
  sidebar: {
    display: 'flex', flexDirection: 'column', width: 248, minWidth: 248,
    // dvh, not vh: on mobile browsers vh includes the collapsing URL bar, so a
    // 100vh rail is taller than the visible viewport and clips its own footer.
    height: '100dvh',
    background: t.sidebarBg, borderRight: `1px solid ${t.divider}`,
    position: 'sticky', top: 0, flexShrink: 0,
  },

  brand: {
    display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
    margin: 12, padding: '18px 16px', borderRadius: radius.xl,
    backgroundColor: t.brandSolid, boxShadow: shadow.md,
  },
  logo: { width: 40, height: 40, objectFit: 'contain', flexShrink: 0, borderRadius: radius.md },
  brandText: { minWidth: 0 },
  brandName: { fontFamily: fonts.display, color: t.onBrandSolid, fontWeight: 600, fontSize: 24, lineHeight: 1.05, letterSpacing: '-0.015em' },
  // nowrap: "Moderator Console" must stay one line in the 248px rail.
  brandSub:  { marginTop: 4, color: t.onBrandSolidMuted, fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', whiteSpace: 'nowrap' },

  identity: { display: 'flex', alignItems: 'center', gap: 10, padding: '2px 20px 14px', flexWrap: 'wrap' },
  rolePill: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: radius.pill, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.02em' },
  rolePillMod:   { background: t.infoBg, color: t.info },
  rolePillAdmin: { background: t.brandSoft, color: t.brand },
  roleDot: { width: 6, height: 6, borderRadius: '50%', flexShrink: 0 },
  scope: { fontSize: 12, color: t.textMuted, fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },

  navSection: { padding: '6px 12px 12px', overflowY: 'auto', borderTop: `1px solid ${t.divider}` },
  groups:     { display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 12 },
  group:      { display: 'flex', flexDirection: 'column', gap: 4 },
  navLabel:   { fontSize: 10.5, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 10px 2px' },
  links:      { display: 'flex', flexDirection: 'column', gap: 2 },
  link: {
    display: 'flex', alignItems: 'center', gap: 11,
    textAlign: 'left', padding: '9px 12px', borderRadius: radius.md, border: 'none',
    background: 'transparent', color: t.textSecondary, fontWeight: 500, fontSize: 13.5,
    cursor: 'pointer', transition: 'background 0.15s, color 0.15s', width: '100%', fontFamily: 'inherit',
    minHeight: 40,
  },
  // A filled pill, not a tint: the current page is the one thing in the rail
  // that should be unmistakable at a glance.
  linkActive: { background: t.brandSolid, color: t.onBrandSolid, fontWeight: 600, boxShadow: shadow.sm },

  footer: { marginTop: 'auto', padding: '14px 16px 18px', borderTop: `1px solid ${t.divider}` },

  themeRow: {
    display: 'flex', gap: 4, padding: 3, marginBottom: 10,
    background: t.bg, border: `1px solid ${t.border}`, borderRadius: radius.md,
  },
  themeBtn: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '7px 0', borderRadius: radius.sm, border: 'none', background: 'transparent',
    color: t.textMuted, cursor: 'pointer', transition: 'all 0.15s', minHeight: 32,
  },
  themeBtnOn: { background: t.cardBg, color: t.brand, boxShadow: shadow.sm },

  logoutBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '9px 14px', borderRadius: radius.md,
    border: `1px solid ${t.border}`, background: 'transparent', color: t.textSecondary,
    fontSize: 13, fontWeight: 600, cursor: 'pointer', width: '100%',
    transition: 'all 0.15s', fontFamily: 'inherit', minHeight: 40,
  },
};

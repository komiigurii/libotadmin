import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { theme as t, radius, fonts, useThemePref } from '../theme';
import Icon from './Icon';
import logo from '../assets/logo.png';
import { clearSession, getToken } from '../auth/session';
import { roleLabel, isSuperAdmin } from '../auth/roles';
import { useHeartbeat } from '../auth/heartbeat';
import { authAPI } from '../api/api';
import { confirmAction } from './AppAlert';

/*
 * Persistent left rail.
 *
 * Shape: one quiet cream surface with a hairline edge (2026-10-21, "quieter"):
 * the emblem and name at the top, the links, then the theme switch and sign-out.
 * It used to be a saturated teal frame around a cream panel, with a risograph
 * church print and an off-register tagline at its foot; in a tool used for
 * hours that frame out-shouted every page it held. Teal now marks only what
 * matters: the page you're on.
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
 */

// Grouped by what the work IS rather than listed flat. Names say what the page
// holds in plain words — "Approval Queue", not "Mod Requests"; "Reviews &
// Feedback", because the app calls them reviews — and each page's heading
// uses the same name, so the link and the page it opens always agree.
//
// Paths are unchanged from before the rename, so bookmarks keep working.
//
// Mock defense 2026-10-21: everything about spots is in Spot Management (its
// Approval Queue is a tab there, /spots/approvals), reviews are "Rate and
// Review" as the paper calls them, and travelers no longer report reviews —
// the automatic filter masks bad words instead — so Reported Reviews is gone.
const ADMIN_NAV = [
  { group: 'Overview', items: [
    { label: 'Dashboard',          path: '/dashboard',         icon: 'grid' },
  ] },
  { group: 'Content', items: [
    { label: 'Spot Management',    path: '/spots',             icon: 'map-pin', badge: 'approvals' },
  ] },
  { group: 'Community', items: [
    { label: 'Rate and Review',    path: '/comments',          icon: 'message-square' },
  ] },
  { group: 'Travelers', items: [
    { label: 'Traveler Progress',  path: '/user-progress',     icon: 'award' },
    { label: 'Town Badges',        path: '/town-badges',       icon: 'star' },
    { label: 'Inactive Accounts',  path: '/inactive-users',    icon: 'clock' },
    { label: 'Suspensions & Bans', path: '/banned-accounts',   icon: 'slash' },
  ] },
  { group: 'Team', items: [
    { label: 'Moderators',         path: '/moderators',        icon: 'users' },
  ] },
];

// The super admin's console holds only the super admin's own work (the user,
// 2026-10-22: "superadmin panel should only contain superadmin functions"):
// maintenance and the tools, the staff's tickets, every account, and what was
// done in the console. Spots, reviews and travelers are the admins' job.
const SUPER_ADMIN_NAV = [
  { group: 'Overview', items: [
    { label: 'Dashboard',          path: '/dashboard',         icon: 'grid' },
  ] },
  { group: 'System', items: [
    { label: 'System',             path: '/system',            icon: 'tool' },
    { label: 'Tickets',            path: '/tickets',           icon: 'flag', badge: 'tickets' },
  ] },
  { group: 'Accounts', items: [
    { label: 'Accounts',           path: '/accounts',          icon: 'shield' },
    { label: 'Activity Log',       path: '/activity',          icon: 'history' },
  ] },
];

// Every role's bell; admins and moderators also report problems from here
// (the super admin answers them under Tickets).
const inboxNav = (superAdmin) => ({ group: 'Inbox', items: [
  { label: 'Notifications',      path: '/notifications',     icon: 'bell', badge: 'unread' },
  ...(superAdmin ? [] : [{ label: 'Report a Problem', path: '/tickets', icon: 'flag' }]),
] });

// A link is "here" on its own page and on the pages under it (/tickets/12).
const isHere = (item, path) => path === item.path || path.startsWith(`${item.path}/`);

// A moderator's job is attractions in their municipality and the requests
// they've sent, plus a read-only list of the travelers who visited their
// municipality's spots (QA 2026-10-16). Reviews, reports, the full leaderboard and account actions
// stay admin-only, in the panel and on the backend.
const MODERATOR_NAV = [
  { group: 'Overview', items: [
    { label: 'Dashboard',          path: '/dashboard',          icon: 'grid' },
  ] },
  { group: 'Content', items: [
    { label: 'Spot Management',    path: '/spots',              icon: 'map-pin' },
    { label: 'My Submissions',     path: '/my-review-requests', icon: 'send' },
  ] },
  { group: 'Travelers', items: [
    { label: 'Travelers',          path: '/my-travelers',       icon: 'users' },
  ] },
];

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
    // The server ends the session too. Not waited for, so signing out stays
    // instant while the server wakes up, and works offline.
    const token = getToken();
    if (token) authAPI.logout(token).catch(() => {});
    clearSession(); // token, role and city — city used to be left behind
    navigate('/login');
  };

  const isModerator = role === 'moderator';
  const superAdmin = isSuperAdmin(role);
  const consoleName = `${roleLabel(role)} Console`;
  const nav = [
    ...(superAdmin ? SUPER_ADMIN_NAV : isModerator ? MODERATOR_NAV : ADMIN_NAV),
    inboxNav(superAdmin),
  ];
  const home = '/dashboard';
  const current = nav.flatMap((g) => g.items).find((i) => isHere(i, location.pathname));
  const beat = useHeartbeat();
  const badges = { unread: beat?.unread || 0, tickets: beat?.openTickets || 0, approvals: beat?.pendingApprovals || 0 };

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
    {/* The menu button sits on the left, on the side the drawer opens from
        (mock defense 2026-10-21: "location ng burger menu kapag niliitan"). */}
    <header className="mobile-bar" style={s.mobileBar}>
      <button
        ref={menuBtnRef}
        type="button"
        onClick={() => setMenuOpen(true)}
        style={s.menuBtn}
        aria-label="Open menu"
        aria-expanded={menuOpen}
        aria-controls="admin-nav"
      >
        <Icon name="menu" size={22} color={t.textPrimary} />
      </button>
      <div style={s.mobileTitle}>{current?.label || consoleName}</div>
      <button
        type="button"
        onClick={() => navigate(home)}
        style={s.mobileBrand}
        aria-label="Go to dashboard"
      >
        <img src={logo} alt="" style={s.mobileLogo} />
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
        <Icon name="x" size={18} color={t.textPrimary} />
      </button>
      <div
        className="sidebar-brand"
        style={s.brand}
        onClick={() => navigate(home)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(home); } }}
        aria-label={`Libot Bulacan ${consoleName} — go to dashboard`}
      >
        <span className="sidebar-emblem" style={s.emblem}>
          <img src={logo} alt="" style={s.logo} />
        </span>
        <div className="sidebar-text" style={s.brandText}>
          <div style={s.brandName}>Libot Bulacan</div>
          <div style={s.brandSub}>{`${roleLabel(role)} console`}</div>
          <div style={s.brandScope}>
            <Icon name="map-pin" size={11} color={t.textMuted} />
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
                    const active = isHere(item, location.pathname);
                    const count = item.badge ? badges[item.badge] : 0;
                    return (
                      <button
                        key={item.path}
                        onClick={() => navigate(item.path)}
                        className="nav-link-btn"
                        // aria-current is how a screen reader knows which page
                        // it's on; the filled pill only says it visually.
                        aria-current={active ? 'page' : undefined}
                        title={count ? `${item.label} (${count})` : item.label}
                        style={{ ...s.link, ...(active ? s.linkActive : {}) }}
                      >
                        <Icon
                          name={item.icon}
                          size={17}
                          color={active ? t.brand : 'currentColor'}
                          weight={active ? 'fill' : 'regular'}
                        />
                        <span className="sidebar-text">
                          {item.label}
                          {count > 0 && <span className="visually-hidden">, {count} new</span>}
                        </span>
                        {count > 0 && <span className="nav-badge" style={s.badge} aria-hidden="true">{count > 99 ? '99+' : count}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
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
                <Icon name={o.icon} size={14} color={on ? t.brand : t.textMuted} />
              </button>
            );
          })}
        </div>

        {/* Any role, any time (mock defense 2026-10-21). */}
        <button
          onClick={() => navigate('/change-password')}
          className="logout-btn"
          style={{ ...s.keyBtn, ...(location.pathname === '/change-password' ? s.themeBtnOn : null) }}
          title="Change password"
          aria-label="Change password"
          aria-current={location.pathname === '/change-password' ? 'page' : undefined}
        >
          <Icon name="key" size={15} color={t.textSecondary} />
          <span className="sidebar-text">Change password</span>
        </button>
        <button onClick={logout} className="logout-btn" style={s.logoutBtn} title="Sign out">
          <Icon name="log-out" size={15} color={t.textSecondary} />
          <span className="sidebar-text">Sign out</span>
        </button>
      </div>
    </nav>
    </>
  );
}

const s = {
  sidebar: {
    display: 'flex', flexDirection: 'column', width: 248, minWidth: 248,
    // dvh, not vh: on mobile browsers vh includes the collapsing URL bar, so a
    // 100vh rail is taller than the visible viewport and clips its own footer.
    height: '100dvh', boxSizing: 'border-box',
    background: t.sidebarBg, borderRight: `1px solid ${t.border}`,
    position: 'sticky', top: 0, flexShrink: 0,
  },

  // The emblem and the name side by side, left-aligned with the links below.
  brand: {
    display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
    padding: '20px 20px 14px',
  },
  emblem: { display: 'grid', placeItems: 'center', width: 40, height: 40, flexShrink: 0 },
  logo: { width: 40, height: 40, objectFit: 'contain', borderRadius: 11, display: 'block' },
  brandText: { minWidth: 0, display: 'flex', flexDirection: 'column' },
  brandName: {
    fontFamily: fonts.display, color: t.textPrimary, fontWeight: 600, fontSize: 19,
    lineHeight: 1.1, letterSpacing: '-0.01em', whiteSpace: 'nowrap',
  },
  brandSub: {
    marginTop: 3, color: t.textSecondary, fontSize: 12, fontWeight: 500,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  brandScope: {
    marginTop: 2, display: 'flex', alignItems: 'center', gap: 4, color: t.textMuted, fontSize: 12,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },

  panel: { flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' },
  navSection: {
    flex: '1 1 auto', minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
    display: 'flex', flexDirection: 'column', padding: '6px 12px 12px',
  },
  groups:     { display: 'flex', flexDirection: 'column' },
  group:      { display: 'flex', flexDirection: 'column' },
  groupRule:  { marginTop: 10, paddingTop: 10, borderTop: `1px solid ${t.divider}` },
  links:      { display: 'flex', flexDirection: 'column', gap: 2 },
  link: {
    display: 'flex', alignItems: 'center', gap: 12,
    textAlign: 'left', padding: '10px 14px', borderRadius: 10, border: 'none',
    background: 'transparent', color: t.textSecondary, fontWeight: 500, fontSize: 13.5,
    cursor: 'pointer', transition: 'background 0.15s, color 0.15s',
    width: '100%', fontFamily: 'inherit', minHeight: 42, position: 'relative',
  },
  // A tint and the brand colour: still the one thing in the rail you find at a
  // glance, without a solid teal block and its glow competing with the page.
  linkActive: { background: t.brandSoft, color: t.brand, fontWeight: 600 },
  // The bell's unread count: the brand colour, so it reads as "for you", not
  // as an error.
  badge: {
    marginLeft: 'auto', minWidth: 20, height: 20, padding: '0 6px', boxSizing: 'border-box',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    // The card colour on the brand colour: dark on light teal in the dark
    // theme, white on dark teal in the light one.
    borderRadius: radius.pill, background: t.brand, color: t.cardBg,
    fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
  },

  footer: {
    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '12px 14px 16px',
    borderTop: `1px solid ${t.divider}`,
  },

  // ── Phone top bar + drawer close. Display comes from App.css. ──
  mobileBar: {
    position: 'sticky', top: 0, zIndex: 30, alignItems: 'center', gap: 12,
    minHeight: 56, padding: '8px 12px 8px 6px', boxSizing: 'border-box',
    background: t.sidebarBg, color: t.textPrimary, borderBottom: `1px solid ${t.border}`,
  },
  mobileBrand: {
    display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 12, flexShrink: 0,
    border: 'none', padding: 0, cursor: 'pointer', background: 'transparent',
  },
  mobileLogo: { width: 32, height: 32, objectFit: 'contain', borderRadius: 9, display: 'block' },
  mobileTitle: {
    flex: 1, minWidth: 0, fontSize: 15.5, fontWeight: 650, letterSpacing: '-0.01em',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  menuBtn: {
    display: 'grid', placeItems: 'center', width: 44, height: 44, borderRadius: 12, flexShrink: 0,
    border: 'none', padding: 0, cursor: 'pointer', background: 'transparent',
  },
  drawerClose: {
    position: 'absolute', top: 12, right: 12, zIndex: 1,
    placeItems: 'center', width: 36, height: 36, borderRadius: 10,
    border: 'none', padding: 0, cursor: 'pointer', background: t.cardBgHover,
  },
  themeRow: {
    display: 'flex', gap: 2, padding: 3, borderRadius: radius.md, border: `1px solid ${t.border}`,
  },
  themeBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 30, minHeight: 30, borderRadius: radius.sm, border: 'none', background: 'transparent',
    cursor: 'pointer', transition: 'background 0.15s',
  },
  themeBtnOn: { background: t.cardBg, boxShadow: `inset 0 0 0 1px ${t.border}` },
  // Its own row above the theme switch and Sign out; in the icon rail, App.css
  // shrinks it to the key like the other footer buttons.
  keyBtn: {
    flex: '1 1 100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '8px 12px', minHeight: 36, borderRadius: radius.md, border: `1px solid ${t.border}`,
    background: 'transparent', color: t.textSecondary, fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
    cursor: 'pointer', transition: 'background 0.15s, border-color 0.15s',
  },
  logoutBtn: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '8px 12px', borderRadius: radius.md,
    border: `1px solid ${t.border}`, background: 'transparent', color: t.textSecondary,
    fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 36,
    transition: 'background 0.15s, border-color 0.15s', fontFamily: 'inherit',
  },
};

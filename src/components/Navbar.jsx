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
 *   > 1100px  full 240px rail with labels
 *   ≤ 1100px  68px icon rail — labels are visually hidden, NOT removed, so
 *             screen readers still announce them
 *   ≤ 720px   horizontal bar across the top
 */
export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const role     = localStorage.getItem('role');
  const [pref, setPref] = useThemePref();

  const logout = () => {
    clearSession(); // token, role and city — city used to be left behind
    navigate('/login');
  };

  const isModerator = role === 'moderator';

  const navItems = isModerator
    ? [
        //Moderator
        { label: 'Spots',           path: '/spots',              icon: 'map-pin' },
        { label: 'Review Requests', path: '/my-review-requests', icon: 'edit' },
      ]
    : [
        //Admin
        { label: 'Requests',          path: '/mod-requests',     icon: 'hand' },
        { label: 'Comments',          path: '/comments',         icon: 'thumbs-up' },
        { label: 'Reported Comments', path: '/reported-comments',icon: 'flag' },
        { label: 'Banned Accounts',   path: '/banned-accounts',  icon: 'slash' },
        { label: 'Inactive Users',    path: '/inactive-users',   icon: 'clock' },
        { label: 'User Progress',     path: '/user-progress',    icon: 'star' },
      ];

  const home = isModerator ? '/spots' : '/mod-requests';

  const themeOptions = [
    { key: 'light',  label: 'Light',  icon: 'sun' },
    { key: 'dark',   label: 'Dark',   icon: 'moon' },
    { key: 'system', label: 'System', icon: 'monitor' },
  ];

  return (
    <nav className="admin-sidebar" style={s.sidebar} aria-label="Main">
      <div
        className="sidebar-brand"
        style={s.brand}
        onClick={() => navigate(home)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(home); } }}
        aria-label="Libot Admin — go to home"
      >
        <img src={logo} alt="" style={s.logo} />
        <div className="sidebar-text">
          <div style={s.brandName}>Libot</div>
        </div>
      </div>

      <div className="sidebar-section" style={s.roleSection}>
        <p className="sidebar-text" style={s.roleLabel}>Role</p>
        <span style={{ ...s.rolePill, ...(isModerator ? s.rolePillMod : s.rolePillAdmin) }}>
          {isModerator ? 'MOD' : 'ADMIN'}
        </span>
      </div>

      <div className="sidebar-section" style={s.navSection}>
        <p className="nav-label" style={s.navLabel}>Navigation</p>
        <div className="sidebar-links" style={s.links}>
          {navItems.map(item => {
            const active = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="nav-link-btn"
                // aria-current is how a screen reader knows which page it's on.
                // The colour + left border said it visually and nothing said it
                // otherwise.
                aria-current={active ? 'page' : undefined}
                title={item.label}
                style={{ ...s.link, ...(active ? s.linkActive : {}) }}
              >
                <span style={s.linkInner}>
                  <Icon name={item.icon} size={15} color={active ? t.brand : 'currentColor'} />
                  <span className="sidebar-text">{item.label}</span>
                </span>
                {active && <span className="sidebar-text" style={s.linkChevron} aria-hidden="true">›</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="sidebar-footer" style={s.footer}>
        {/* Three-way, matching the mobile app's Settings control. "System"
            follows the OS rather than pinning a choice. */}
        <div style={s.themeRow} role="radiogroup" aria-label="Colour theme">
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

        <button onClick={logout} className="logout-btn" style={s.logoutBtn} title="Logout">
          <Icon name="log-out" size={14} />
          <span className="sidebar-text">Logout</span>
        </button>
        <p className="sidebar-version" style={s.versionText}>v1.0 · Libot Admin</p>
      </div>
    </nav>
  );
}

const s = {
  sidebar: {
    display: 'flex', flexDirection: 'column', width: 240, minWidth: 240,
    // dvh, not vh: on mobile browsers vh includes the collapsing URL bar, so a
    // 100vh rail is taller than the visible viewport and clips its own footer.
    height: '100dvh',
    background: t.sidebarBg, borderRight: `1px solid ${t.divider}`,
    position: 'sticky', top: 0, flexShrink: 0,
    boxShadow: shadow.sm,
  },
  brand: { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '20px 20px 18px' },
  logo: { width: 42, height: 42, objectFit: 'contain', flexShrink: 0, borderRadius: radius.md },
  brandName: { fontFamily: fonts.display, color: t.textPrimary, fontWeight: 600, fontSize: 19, lineHeight: 1.2, letterSpacing: '-0.01em' },

  roleSection: { padding: '4px 20px 16px', borderBottom: `1px solid ${t.divider}` },
  roleLabel:   { fontSize: 10, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 },
  rolePill:    { display: 'inline-block', padding: '5px 14px', borderRadius: radius.pill, fontSize: 12, fontWeight: 700, letterSpacing: '0.03em' },
  rolePillMod:   { background: t.infoBg, color: t.info },
  rolePillAdmin: { background: t.brandSolid, color: '#fff' },

  navSection: { padding: '18px 14px', overflowY: 'auto' },
  navLabel:   { fontSize: 10, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 8px 10px' },
  links:      { display: 'flex', flexDirection: 'column', gap: 2 },
  link: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    textAlign: 'left', padding: '9px 12px', borderRadius: radius.md, border: 'none',
    borderLeft: '3px solid transparent',
    background: 'transparent', color: t.textSecondary, fontWeight: 500, fontSize: 13.5,
    cursor: 'pointer', transition: 'all 0.15s', width: '100%', fontFamily: 'inherit',
    minHeight: 38,
  },
  linkInner:   { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 },
  linkActive:  { background: t.brandSoft, color: t.textPrimary, fontWeight: 600, borderLeft: `3px solid ${t.brand}` },
  linkChevron: { color: t.brand, fontSize: 16, lineHeight: 1 },

  footer: { marginTop: 'auto', padding: '14px 20px 20px', borderTop: `1px solid ${t.divider}` },

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
    border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted,
    fontSize: 13, fontWeight: 500, cursor: 'pointer', width: '100%',
    transition: 'all 0.15s', fontFamily: 'inherit', minHeight: 38,
  },
  versionText: { fontSize: 10.5, color: t.textMuted, textAlign: 'center', marginTop: 10 },
};

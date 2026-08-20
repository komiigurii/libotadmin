import { useNavigate, useLocation } from 'react-router-dom';
import { theme as t } from '../theme';
import logo from '../assets/logo.png';

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const role     = localStorage.getItem('role');

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    navigate('/login');
  };

  const isModerator = role === 'moderator';

  const navItems = isModerator
    ? [
        //Moderator
        { label: 'Spots',           path: '/spots' },
        { label: 'Review Requests', path: '/my-review-requests' },
      ]
    : [
        //Admin
        { label: 'Review Proposed Spot Changes',      path: '/mod-requests' },
        { label: 'All Comments',    path: '/comments' },
        { label: 'Reported Comments',       path: '/reported-comments' },
        { label: 'Inactive Users',  path: '/inactive-users' }
      ];

  const home = isModerator ? '/my-review-requests' : '/comments';

  return (
    <nav style={s.sidebar}>
      <div style={s.brand} onClick={() => navigate(home)}>
        <img
          src={logo}
          alt="Libot Logo"
          style={s.logo}
        />
        <div>
          <div style={s.brandName}>Libot</div>
          <div style={s.brandSub}>Admin Console</div>
        </div>
      </div>

      <div style={s.roleSection}>
        <p style={s.roleLabel}>Role</p>
        <span style={{ ...s.rolePill, ...(isModerator ? s.rolePillMod : s.rolePillAdmin) }}>
          {isModerator ? 'MOD' : 'ADMIN'}
        </span>
      </div>

      <div style={s.navSection}>
        <p style={s.navLabel}>Navigation</p>
        <div style={s.links}>
          {navItems.map(item => {
            const active = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => !item.disabled && navigate(item.path)}
                disabled={item.disabled}
                style={{
                  ...s.link,
                  ...(active ? s.linkActive : {}),
                  ...(item.disabled ? s.linkDisabled : {}) }}
              >
                <span>{item.label}</span>
                {active && <span style={s.linkChevron}>›</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div style={s.footer}>
        <button onClick={logout} style={s.logoutBtn}>
          Logout
        </button>
        <p style={s.versionText}>v1.0 · Libot Admin</p>
      </div>
    </nav>
  );
}

const s = {
  linkDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
    pointerEvents: 'none'
  },
  sidebar: {
    display: 'flex', flexDirection: 'column', width: 240, minWidth: 240, height: '100vh',
    background: t.sidebarBg, borderRight: `1px solid ${t.divider}`, position: 'sticky', top: 0, flexShrink: 0,
  },
  brand: { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '20px 20px 18px' },
  logo: {
  width: 42,
  height: 42,
  objectFit: 'contain',
  flexShrink: 0,
},
  brandName:  { color: t.textPrimary, fontWeight: 700, fontSize: 15, lineHeight: 1.2 },
  brandSub:   { color: t.textMuted, fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase' },

  roleSection: { padding: '4px 20px 16px', borderBottom: `1px solid ${t.divider}` },
  roleLabel:   { fontSize: 10, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 },
  rolePill:    { display: 'inline-block', padding: '5px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, letterSpacing: '0.03em' },
  rolePillMod:   { background: t.infoBg, color: t.info },
  rolePillAdmin: { background: t.brandSolid, color: '#fff' },

  navSection: { padding: '18px 14px', overflowY: 'auto' },
  navLabel:   { fontSize: 10, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 8px 10px' },
  links:      { display: 'flex', flexDirection: 'column', gap: 2 },
  link: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    textAlign: 'left', padding: '9px 12px', borderRadius: 9, border: 'none',
    borderLeft: '3px solid transparent',
    background: 'transparent', color: t.textSecondary, fontWeight: 500, fontSize: 13.5, cursor: 'pointer',
    transition: 'all 0.15s', width: '100%',
  },
  linkActive: { background: t.brandSoft, color: t.textPrimary, fontWeight: 600, borderLeft: `3px solid ${t.brand}` },
  linkChevron: { color: t.brand, fontSize: 16, lineHeight: 1 },

  footer: { marginTop: 'auto', padding: '14px 20px 20px', borderTop: `1px solid ${t.divider}` },
  logoutBtn: {
    padding: '9px 14px', borderRadius: 9,
    border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 13,
    fontWeight: 500, cursor: 'pointer', width: '100%',
  },
  versionText: { fontSize: 10.5, color: t.textMuted, textAlign: 'center', marginTop: 10 },
};
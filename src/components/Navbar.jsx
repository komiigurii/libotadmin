import { useNavigate, useLocation } from 'react-router-dom';
import { theme as t } from '../theme';

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
        { label: 'Dashboard', path: '/dashboard', icon: '⊞' },
        { label: 'Spots',     path: '/spots',     icon: '📍' },
        { label: 'Comments',  path: '/comments',  icon: '💬' },
      ]
    : [
        { label: 'All Comments',    path: '/comments',      icon: '💬' },
        { label: 'Mod Requests',    path: '/mod-requests',  icon: '🛡' },

        { label: 'Inactive Users',  path: '/inactive-users',icon: '👥' },
        { label: 'Spots',           path: '/spots',         icon: '⊞' },
        { label: 'Notifications',   path: '/notifications', icon: '🔔' },
      ];

  const home = isModerator ? '/dashboard' : '/comments';

  return (
    <nav style={s.sidebar}>
      <div style={s.brand} onClick={() => navigate(home)}>
        <div style={s.logoBox}><span style={s.logoLetter}>L</span></div>
        <div>
          <div style={s.brandName}>Libot</div>
          <div style={s.brandSub}>Admin Console</div>
        </div>
      </div>

      <div style={s.roleSection}>
        <p style={s.roleLabel}>Role</p>
        <div style={s.roleRow}>
          <span style={{ ...s.rolePill, ...(isModerator ? s.rolePillMod : s.rolePillAdmin) }}>
            {isModerator ? 'MOD' : 'ADMIN'}
          </span>
        </div>
        <div style={s.roleActive}>
          <span style={s.roleDot} />
          {isModerator ? 'Moderator' : 'Administrator'}
        </div>
      </div>

      <div style={s.navSection}>
        <p style={s.navLabel}>Navigation</p>
        <div style={s.links}>
          {navItems.map(item => {
            const active = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                style={{ ...s.link, ...(active ? s.linkActive : {}) }}
              >
                <span style={s.linkIcon}>{item.icon}</span>
                <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={s.footer}>
        <button onClick={logout} style={s.logoutBtn}>
          <span style={{ fontSize: 14 }}>🚪</span>
          Logout
        </button>
      </div>
    </nav>
  );
}

const s = {
  sidebar: {
    display: 'flex', flexDirection: 'column', width: 272, minWidth: 272, height: '100vh',
    background: t.sidebarBg, borderRight: `1px solid ${t.divider}`, position: 'sticky', top: 0, flexShrink: 0,
  },
  brand: { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '20px 20px 18px' },
  logoBox: { width: 34, height: 34, borderRadius: 9, background: t.brandSolid, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  logoLetter: { color: '#fff', fontWeight: 700, fontSize: 16 },
  brandName:  { color: t.textPrimary, fontWeight: 700, fontSize: 15, lineHeight: 1.2 },
  brandSub:   { color: t.textMuted, fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase' },

  roleSection: { padding: '4px 20px 18px', borderBottom: `1px solid ${t.divider}` },
  roleLabel:   { fontSize: 10, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 },
  roleRow:     { display: 'flex', gap: 6, marginBottom: 10 },
  rolePill:    { padding: '5px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, letterSpacing: '0.03em' },
  rolePillMod:   { background: t.infoBg, color: t.info },
  rolePillAdmin: { background: t.brandSolid, color: '#fff' },
  roleActive:  { display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: t.textSecondary, fontWeight: 500 },
  roleDot:     { width: 6, height: 6, borderRadius: '50%', background: t.success, flexShrink: 0 },

  navSection: { flex: 1, padding: '18px 14px', overflowY: 'auto' },
  navLabel:   { fontSize: 10, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 8px 10px' },
  links:      { display: 'flex', flexDirection: 'column', gap: 2 },
  link: {
    display: 'flex', alignItems: 'center', gap: 11, padding: '9px 12px', borderRadius: 9, border: 'none',
    background: 'transparent', color: t.textSecondary, fontWeight: 500, fontSize: 13.5, cursor: 'pointer',
    transition: 'all 0.15s', width: '100%',
  },
  linkActive: { background: t.brandSoft, color: t.textPrimary, fontWeight: 600 },
  linkIcon: { fontSize: 14, width: 18, textAlign: 'center', flexShrink: 0 },

  footer: { padding: '14px 20px 20px', borderTop: `1px solid ${t.divider}` },
  logoutBtn: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 9,
    border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 13,
    fontWeight: 500, cursor: 'pointer', width: '100%',
  },
};
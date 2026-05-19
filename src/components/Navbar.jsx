import { useNavigate, useLocation } from 'react-router-dom';

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const role     = localStorage.getItem('role');

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    navigate('/login');
  };

  const navItems = role === 'admin'
    ? [{ label: 'Pending Changes', path: '/pending' }]
    : [
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Spots',     path: '/spots' },
        { label: 'Reports',   path: '/reports' },
      ];

  return (
    <nav style={styles.nav}>
      <div style={styles.brand} onClick={() => navigate(role === 'moderator' ? '/pending' : '/dashboard')}>
        <div style={styles.logo}>L</div>
        <span style={styles.brandText}>Libot Admin</span>
      </div>

      <div style={styles.navLinks}>
        {navItems.map(item => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            style={{
              ...styles.navBtn,
              ...(location.pathname === item.path ? styles.navBtnActive : {})
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div style={styles.right}>
        <span style={{ ...styles.roleBadge, ...(role === 'moderator' ? styles.roleBadgeModerator : {}) }}>
          {role === 'moderator' ? 'Moderator' : 'Admin'}
        </span>
        <button onClick={logout} style={styles.logoutBtn}>
          Logout
        </button>
      </div>
    </nav>
  );
}

const styles = {
  nav: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 32px', height: 64,
    background: '#fff',
    borderBottom: '1px solid #f0e0de',
    position: 'sticky', top: 0, zIndex: 100,
    boxShadow: '0 1px 8px rgba(74,46,44,0.06)',
  },
  brand:     { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' },
  logo: {
    width: 34, height: 34, borderRadius: 10,
    background: 'linear-gradient(135deg, #6b4b45, #4a2e2c)',
    color: '#fff', fontWeight: 700, fontSize: 16,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  brandText:          { fontWeight: 700, fontSize: 17, color: '#4a2e2c' },
  navLinks:           { display: 'flex', gap: 4 },
  navBtn: {
    padding: '7px 16px', borderRadius: 8, border: 'none',
    background: 'transparent', color: '#7a5a58',
    fontWeight: 500, fontSize: 14, cursor: 'pointer',
    transition: 'all 0.15s',
  },
  navBtnActive:       { background: '#faf0ee', color: '#4a2e2c', fontWeight: 600 },
  right:              { display: 'flex', alignItems: 'center', gap: 10 },
  roleBadge: {
    padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
    background: '#faf0ee', color: '#6b4b45', border: '1px solid #f0e0de',
  },
  roleBadgeModerator: { background: '#f0f4ff', color: '#3b5bdb', border: '1px solid #dde3ff' },
  logoutBtn: {
    padding: '7px 18px', borderRadius: 8,
    border: '1px solid #f0e0de',
    background: '#fff', color: '#7a5a58',
    fontWeight: 500, fontSize: 14, cursor: 'pointer',
  },
};
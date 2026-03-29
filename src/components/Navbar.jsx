import { useNavigate, useLocation } from 'react-router-dom';

export default function Navbar() {
  const navigate  = useNavigate();
  const location  = useLocation();

  const logout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  const navItems = [
    { label: 'Dashboard', path: '/dashboard' },
    { label: 'Spots',     path: '/spots' },
  ];

  return (
    <nav style={styles.nav}>
      <div style={styles.brand} onClick={() => navigate('/dashboard')}>
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

      <button onClick={logout} style={styles.logoutBtn}>
        Logout
      </button>
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
  brand: {
    display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
  },
  logo: {
    width: 34, height: 34, borderRadius: 10,
    background: 'linear-gradient(135deg, #6b4b45, #4a2e2c)',
    color: '#fff', fontWeight: 700, fontSize: 16,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  brandText: { fontWeight: 700, fontSize: 17, color: '#4a2e2c' },
  navLinks: { display: 'flex', gap: 4 },
  navBtn: {
    padding: '7px 16px', borderRadius: 8, border: 'none',
    background: 'transparent', color: '#7a5a58',
    fontWeight: 500, fontSize: 14, cursor: 'pointer',
    transition: 'all 0.15s',
  },
  navBtnActive: {
    background: '#faf0ee', color: '#4a2e2c', fontWeight: 600,
  },
  logoutBtn: {
    padding: '7px 18px', borderRadius: 8,
    border: '1px solid #f0e0de',
    background: '#fff', color: '#7a5a58',
    fontWeight: 500, fontSize: 14, cursor: 'pointer',
  },
};
import { useNavigate } from 'react-router-dom';

export default function Navbar() {
  const navigate = useNavigate();
  const logout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  return (
    <div style={{ background:'#4a2e2c', padding:'14px 30px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
      <span style={{ color:'#fff', fontWeight:700, fontSize:18 }}>🗺 Libot Admin</span>
      <div style={{ display:'flex', gap:20 }}>
        <span onClick={() => navigate('/spots')}    style={navLink}>Spots</span>
        <span onClick={logout}                      style={navLink}>Logout</span>
      </div>
    </div>
  );
}

const navLink = { color:'#f4c542', cursor:'pointer', fontWeight:600 };
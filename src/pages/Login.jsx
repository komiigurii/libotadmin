import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../api/api';

export default function Login() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      setError('');
      const data = await authAPI.login(email, password);
      console.log('Login response:', data); // 👈 check this in console
      if (data.success && data.token) {
        localStorage.setItem('token', data.token);
        navigate('/dashboard');
      } else {
        setError(data.message || 'Login failed');
      }
    } catch (err) {
      console.error('Login error:', err); // 👈 check this in console
      setError(err?.response?.data?.message || err.message || 'Login failed');
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={{ color: '#4a2e2c', marginBottom: 8 }}>🗺 Libot Admin</h2>
        <p style={{ color: '#7a5a58', marginBottom: 20, fontSize: 14 }}>Sign in to your admin account</p>

        {error && (
          <div style={styles.errorBox}>
            {error}
          </div>
        )}

        <input
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={styles.input}
          type="email"
        />
        <input
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          style={styles.input}
          type="password"
        />
        <button onClick={handleLogin} style={styles.button}>
          Login
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: { display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', background:'#faf5f4' },
  card:      { background:'#fff', padding:40, borderRadius:16, width:340, display:'flex', flexDirection:'column', gap:12, boxShadow:'0 4px 24px rgba(0,0,0,0.08)' },
  input:     { padding:12, borderRadius:8, border:'1px solid #f0e0de', fontSize:14, outline:'none' },
  button:    { padding:14, background:'#6b4b45', color:'#fff', border:'none', borderRadius:8, fontWeight:700, cursor:'pointer', fontSize:15 },
  errorBox:  { background:'#fff0f0', border:'1px solid #ffcccc', borderRadius:8, padding:10, color:'#c0392b', fontSize:13 },
};
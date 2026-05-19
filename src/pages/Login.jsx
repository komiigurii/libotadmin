import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../api/api';

export default function Login() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const navigate = useNavigate();

  const handleLogin = async () => {
    if (!email || !password) { setError('Please fill in all fields'); return; }
    try {
      setError('');
      setLoading(true);
      const data = await authAPI.login(email, password);
      if (data.success && data.token) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('role', data.role || 'admin');
        if (data.role === 'moderator') {
          navigate('/pending');
        } else {
          navigate('/dashboard');
        }
      } else {
        setError(data.message || 'Login failed');
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>

        <div style={styles.logoWrap}>
          <div style={styles.logo}>L</div>
        </div>

        <h1 style={styles.title}>Libot Admin</h1>
        <p style={styles.subtitle}>Sign in to access your account</p>

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.field}>
          <label style={styles.label}>Email</label>
          <input
            type="email"
            placeholder="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            style={styles.input}
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Password</label>
          <input
            type="password"
            placeholder="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            style={styles.input}
          />
        </div>

        <button
          onClick={handleLogin}
          disabled={loading}
          style={{ ...styles.btn, opacity: loading ? 0.7 : 1 }}
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>

      </div>
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#a5a09f', padding: 20 },
  card:      { background: '#fff', borderRadius: 20, padding: '40px 44px', width: '100%', maxWidth: 400, boxShadow: '0 4px 32px rgba(74,46,44,0.1)', border: '1px solid #f0e0de' },
  logoWrap:  { display: 'flex', justifyContent: 'center', marginBottom: 20 },
  logo:      { width: 52, height: 52, borderRadius: 16, background: 'linear-gradient(135deg, #6b4b45, #4a2e2c)', color: '#fff', fontWeight: 700, fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  title:     { fontSize: 22, fontWeight: 700, color: '#2d1f1e', textAlign: 'center', marginBottom: 6 },
  subtitle:  { fontSize: 14, color: '#9a7a78', textAlign: 'center', marginBottom: 28 },
  error:     { background: '#fff0f0', border: '1px solid #ffd0d0', borderRadius: 9, padding: '10px 14px', color: '#c0392b', fontSize: 13, marginBottom: 16 },
  field:     { marginBottom: 16 },
  label:     { display: 'block', fontSize: 12, fontWeight: 600, color: '#9a7a78', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' },
  input:     { width: '100%', padding: '11px 14px', borderRadius: 9, border: '1px solid #f0e0de', fontSize: 14, color: '#2d1f1e', outline: 'none', background: '#fafafa', boxSizing: 'border-box' },
  btn:       { width: '100%', padding: 13, borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #6b4b45, #4a2e2c)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', marginTop: 8 },
};
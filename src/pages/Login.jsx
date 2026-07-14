import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../api/api';
import { theme as t } from '../theme';

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
          navigate('/dashboard');
        } else {
          navigate('/comments');
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
  container: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.bg, padding: 20 },
  card:      { background: t.cardBg, borderRadius: 20, padding: '40px 44px', width: '100%', maxWidth: 400, boxShadow: '0 4px 32px rgba(0,0,0,0.4)', border: `1px solid ${t.border}` },
  logoWrap:  { display: 'flex', justifyContent: 'center', marginBottom: 20 },
  logo:      { width: 52, height: 52, borderRadius: 16, background: t.brandSolid, color: '#fff', fontWeight: 700, fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  title:     { fontSize: 22, fontWeight: 700, color: t.textPrimary, textAlign: 'center', marginBottom: 6 },
  subtitle:  { fontSize: 14, color: t.textSecondary, textAlign: 'center', marginBottom: 28 },
  error:     { background: t.dangerBg, border: `1px solid ${t.danger}44`, borderRadius: 9, padding: '10px 14px', color: t.danger, fontSize: 13, marginBottom: 16 },
  field:     { marginBottom: 16 },
  label:     { display: 'block', fontSize: 12, fontWeight: 600, color: t.textSecondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' },
  input:     { width: '100%', padding: '11px 14px', borderRadius: 9, border: `1px solid ${t.border}`, fontSize: 14, color: t.textPrimary, outline: 'none', background: t.sidebarBg, boxSizing: 'border-box' },
  btn:       { width: '100%', padding: 13, borderRadius: 10, border: 'none', background: t.brandSolid, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', marginTop: 8 },
};
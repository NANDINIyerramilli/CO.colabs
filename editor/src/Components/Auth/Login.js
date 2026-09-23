import React, { useState } from 'react';
import { Link, useHistory, useLocation } from 'react-router-dom';
import { useAuth } from '../../Context/AuthContext';
import styles from './auth.module.css';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const history = useHistory();
  const location = useLocation();

  const from = (location.state && location.state.from) ? location.state.from.pathname : '/dashboard';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      history.push(from);
    } catch (err) {
      const msg = err.response && err.response.data && err.response.data.error
        ? err.response.data.error
        : 'Failed to log in. Please check your credentials.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.authContainer}>
      <div className={styles.authCard}>
        <div className={styles.brandHeader}>
          <div className={styles.brandIcon}>C</div>
          <div>
            <h1 className={styles.brandTitle}>COcolabs</h1>
            <p className={styles.brandSubtitle}>Collaborative Real-Time Coding</p>
          </div>
        </div>

        <h2 className={styles.formTitle}>Welcome back</h2>
        <p className={styles.formSubtitle}>Enter your details to access your workspace</p>

        {error && <div className={styles.errorBanner}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Email Address</label>
            <input
              type="email"
              className={styles.input}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Password</label>
            <input
              type="password"
              className={styles.input}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className={styles.footerText}>
          Don't have an account?
          <Link to="/signup" className={styles.link}>Create an account</Link>
        </p>
      </div>
    </div>
  );
};

export default Login;

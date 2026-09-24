import React, { useState } from 'react';
import { Link, useHistory } from 'react-router-dom';
import { useAuth } from '../../Context/AuthContext';
import styles from './auth.module.css';

const Signup = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const { signup } = useAuth();
  const history = useHistory();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);

    try {
      const result = await signup(name, email, password);
      if (result && result.needsEmailConfirmation) {
        setSuccessMessage(result.message || 'Please check your email inbox to confirm your account before logging in.');
        return;
      }
      history.push('/dashboard');
    } catch (err) {
      const msg = err.response && err.response.data && err.response.data.error
        ? err.response.data.error
        : 'Failed to create account. Please try again.';
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

        <h2 className={styles.formTitle}>Create an account</h2>
        <p className={styles.formSubtitle}>Join thousands of developers pair programming live</p>

        {error && <div className={styles.errorBanner}>{error}</div>}

        {successMessage ? (
          <div style={{
            padding: '16px',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '8px',
            color: '#10b981',
            marginBottom: '20px',
            lineHeight: '1.5'
          }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '1rem', fontWeight: 600 }}>✉ Confirmation Email Sent</h3>
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#e2e8f0' }}>{successMessage}</p>
            <div style={{ marginTop: '16px' }}>
              <Link to="/login" className={styles.submitBtn} style={{ display: 'inline-block', textAlign: 'center', textDecoration: 'none' }}>
                Go to Sign In
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Full Name</label>
              <input
                type="text"
                className={styles.input}
                placeholder="Ada Lovelace"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Email Address</label>
              <input
                type="email"
                className={styles.input}
                placeholder="ada@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Password (minimum 6 characters)</label>
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
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>
        )}

        <p className={styles.footerText}>
          Already have an account?
          <Link to="/login" className={styles.link}>Sign in</Link>
        </p>
      </div>
    </div>
  );
};

export default Signup;

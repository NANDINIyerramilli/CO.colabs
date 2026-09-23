import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../Context/AuthContext';
import styles from './main.module.css';

const HomeComponent = ({ createId }) => {
  const { isAuthenticated, user } = useAuth();

  return (
    <div className={styles.homeContainer}>
      {/* Top Navbar */}
      <nav className={styles.navbar}>
        <div className={styles.brand}>
          <div className={styles.brandIcon}>C</div>
          <h1 className={styles.brandTitle}>COcolabs</h1>
        </div>

        <div className={styles.navLinks}>
          {isAuthenticated ? (
            <Link to="/dashboard" className="btn_primary">
              Dashboard ({user?.name || 'My Rooms'})
            </Link>
          ) : (
            <>
              <Link to="/login" className="btn_outline">
                Sign In
              </Link>
              <Link to="/signup" className="btn_primary">
                Get Started
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section className={styles.heroSection}>
        <div className={styles.tagline}>
          REAL-TIME COLLABORATIVE CODE RUNNER
        </div>

        <h1 className={styles.heroTitle}>
          Pair program, interview, and execute code{' '}
          <span className={styles.heroTitleHighlight}>in real-time</span>.
        </h1>

        <p className={styles.heroDescription}>
          Run sandboxed code in C++, Java, and Python with live input/output, version history,
          and role-based permissions.
        </p>

        <div className={styles.ctaGroup}>
          <Link
            to={isAuthenticated ? "/dashboard" : "/signup"}
            className={styles.primaryCta}
          >
            {isAuthenticated ? "Go to Dashboard" : "Start Coding Free"} →
          </Link>

          <Link to={`/${createId()}`} className={styles.secondaryCta}>
            Instant Quick Session
          </Link>
        </div>

        {/* Features Highlight */}
        <div className={styles.featuresGrid}>

          <div className={styles.featureCard}>
            <div className={`${styles.featureIcon} ${styles.iconGold}`}>
              <span role="img" aria-label="shield">🛡️</span>
            </div>
            <h3 className={styles.featureTitle}>Sandboxed Execution</h3>
            <p className={styles.featureText}>
              Safe code running with strict timeout, memory limit, CPU constraints, and isolated environment.
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={`${styles.featureIcon} ${styles.iconCoral}`}>
              <span role="img" aria-label="clock">🕒</span>
            </div>
            <h3 className={styles.featureTitle}>Version History</h3>
            <p className={styles.featureText}>
              Point-in-time code snapshots with instant one-click rollback across active collaborators.
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={`${styles.featureIcon} ${styles.iconBlush}`}>
              <span role="img" aria-label="users">👥</span>
            </div>
            <h3 className={styles.featureTitle}>Role-Based Access</h3>
            <p className={styles.featureText}>
              Configurable Owner, Editor, and Viewer roles tailored for technical interviews.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HomeComponent;
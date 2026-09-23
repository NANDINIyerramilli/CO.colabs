import React, { useState, useEffect } from 'react';
import { Link, useHistory } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../Context/AuthContext';
import styles from './dashboard.module.css';

const serverURL = process.env.REACT_APP_SERVER_URL || 'http://localhost:5000';

const Dashboard = () => {
  const { user, logout } = useAuth();
  const history = useHistory();

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [joinRoomId, setJoinRoomId] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newLang, setNewLang] = useState('cpp');
  const [createSubmitting, setCreateSubmitting] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${serverURL}/api/projects`);
      setProjects(res.data.projects || []);
    } catch (err) {
      console.error('[Dashboard] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    let cleanId = joinRoomId.trim();
    if (!cleanId) return;

    // If a full link was pasted, extract the room code from the URL
    if (cleanId.includes('/')) {
      const parts = cleanId.split('/').filter(Boolean);
      cleanId = parts[parts.length - 1];
    }

    history.push(`/${cleanId}`);
  };

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setCreateSubmitting(true);
    try {
      const res = await axios.post(`${serverURL}/api/projects`, {
        title: newTitle.trim(),
        language: newLang
      });
      setShowCreateModal(false);
      setNewTitle('');
      if (res.data && res.data.project) {
        history.push(`/${res.data.project.id}`);
      } else {
        fetchProjects();
      }
    } catch (err) {
      alert('Failed to create room: ' + (err.response?.data?.error || err.message));
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleDeleteProject = async (id, title) => {
    if (!window.confirm(`Are you sure you want to delete "${title}"?`)) return;
    try {
      await axios.delete(`${serverURL}/api/projects/${id}`);
      setProjects(projects.filter((p) => p.id !== id));
    } catch (err) {
      alert('Delete failed: ' + (err.response?.data?.error || err.message));
    }
  };

  return (
    <div className={styles.dashboardContainer}>
      {/* Top Navbar */}
      <header className={styles.navbar}>
        <div className={styles.brand}>
          <div className={styles.brandIcon}>C</div>
          <h1 className={styles.brandTitle}>COcolabs</h1>
        </div>

        <div className={styles.userMenu}>
          <div className={styles.userBadge}>
            <div className={styles.avatar}>
              {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <span className={styles.userName}>{user?.name || user?.email}</span>
          </div>
          <button className={styles.logoutBtn} onClick={logout}>
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className={styles.mainContent}>
        <div className={styles.actionHeader}>
          <div className={styles.headingArea}>
            <h1>Collaborative Workspaces</h1>
            <p>Create or join a live room to code in real-time with peers and interviewers</p>
          </div>

          <div className={styles.actionsRight}>
            <form onSubmit={handleJoinRoom} className={styles.joinForm}>
              <input
                type="text"
                className={styles.joinInput}
                placeholder="Enter Room ID"
                value={joinRoomId}
                onChange={(e) => setJoinRoomId(e.target.value)}
              />
              <button type="submit" className={styles.joinBtn}>
                Join
              </button>
            </form>

            <button
              className={styles.createBtn}
              onClick={() => setShowCreateModal(true)}
            >
              + New Room
            </button>
          </div>
        </div>

        {/* Projects Grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#6c757d' }}>
            Loading workspaces...
          </div>
        ) : projects.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <span role="img" aria-label="rocket">🚀</span>
            </div>
            <h3>No Workspaces Yet</h3>
            <p style={{ color: '#6c757d', marginBottom: '20px' }}>
              Create your first pair-programming room or join one using a room ID.
            </p>
            <button
              className={styles.createBtn}
              style={{ margin: '0 auto' }}
              onClick={() => setShowCreateModal(true)}
            >
              Create Your First Room
            </button>
          </div>
        ) : (
          <div className={styles.projectsGrid}>
            {projects.map((project) => (
              <div key={project.id} className={styles.projectCard}>
                <div>
                  <div className={styles.cardTop}>
                    <h3 className={styles.projectTitle}>{project.title}</h3>
                    <div className={styles.badges}>
                      <span className={styles.langBadge}>{project.language}</span>
                      <span className={styles.roleBadge}>{project.role || 'owner'}</span>
                    </div>
                  </div>
                  <div className={styles.projectMeta}>
                    <span>Room Code: <strong style={{ fontFamily: 'var(--font-mono)' }}>{project.id}</strong></span>
                    <br />
                    <span>
                      Updated:{' '}
                      {new Date(project.updated_at || project.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className={styles.cardActions}>
                  <Link to={`/${project.id}`} className={styles.openBtn}>
                    Open Workspace
                  </Link>

                  {project.role === 'owner' && (
                    <button
                      className={styles.deleteBtn}
                      onClick={() => handleDeleteProject(project.id, project.title)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create Room Modal */}
      {showCreateModal && (
        <div className={styles.modalOverlay} onClick={() => setShowCreateModal(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Create New Room</h2>
            <form onSubmit={handleCreateRoom}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>
                  Project Name
                </label>
                <input
                  type="text"
                  className={styles.joinInput}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  placeholder="e.g. Binary Search Tree Implementation"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>
                  Primary Language
                </label>
                <select
                  className={styles.joinInput}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  value={newLang}
                  onChange={(e) => setNewLang(e.target.value)}
                >
                  <option value="cpp">C++</option>
                  <option value="java">Java</option>
                  <option value="python">Python 3</option>
                </select>
              </div>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.createBtn}
                  disabled={createSubmitting}
                >
                  {createSubmitting ? 'Creating...' : 'Create Room'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;

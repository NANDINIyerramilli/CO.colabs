import React, { useState } from 'react';
import MonacoEditor from 'react-monaco-editor';
import { Link } from 'react-router-dom';
import styles from './main.module.css';

const EditorComponent = (props) => {
  const {
    title,
    handleTitleChange,
    handleTitleBlur,
    roomId,
    role,
    lang,
    handleLang,
    code,
    editorDidMount,
    editorOnChange,
    readOnly,
    input,
    handleInput,
    output,
    stderr,
    executionTimeMs,
    executionStatus,
    runCodeDisabled,
    handleRun,
    versions,
    showVersionDrawer,
    toggleVersionDrawer,
    handleSaveVersion,
    handleRenameVersion,
    handleDeleteVersion,
    handleRestoreVersion,
    showMembersModal,
    toggleMembersModal,
    members,
    handleUpdateMemberRole,
    editorTheme,
    toggleTheme
  } = props;

  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [editingVerId, setEditingVerId] = useState(null);
  const [editingVerText, setEditingVerText] = useState('');

  const copyRoomCode = () => {
    if (!roomId) return;
    navigator.clipboard.writeText(roomId);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const copyRoomLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const startRename = (ver) => {
    setEditingVerId(ver.id);
    setEditingVerText(ver.label || `v${ver.version_number}`);
  };

  const saveRename = (verId) => {
    if (editingVerText.trim() && handleRenameVersion) {
      handleRenameVersion(verId, editingVerText.trim());
    }
    setEditingVerId(null);
  };

  const isViewer = role === 'viewer';
  const isDark = editorTheme === 'vs-dark';
  const fileName = lang === 'python' ? 'main.py' : lang === 'java' ? 'Main.java' : 'main.cpp';

  const monacoOptions = {
    selectOnLineNumbers: true,
    minimap: { enabled: false },
    readOnly: readOnly,
    automaticLayout: true,
    fontSize: 13.5,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, Consolas, monospace",
    lineHeight: 22,
    letterSpacing: 0.2,
    renderLineHighlight: 'all',
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    cursorSmoothCaretAnimation: true,
    cursorBlinking: 'smooth',
    tabSize: 4,
    insertSpaces: true,
    renderIndentGuides: true,
    scrollbar: {
      verticalScrollbarSize: 8,
      horizontalScrollbarSize: 8,
      alwaysConsumeMouseWheel: false
    }
  };

  return (
    <div className={`${styles.workspaceContainer} ${isDark ? styles.darkTheme : styles.lightTheme}`}>
      {/* Top Navigation Bar */}
      <header className={styles.topNav}>
        <div className={styles.navLeft}>
          <Link to="/dashboard" className={styles.brandLink} title="Back to Dashboard">
            <div className={styles.brandIcon}>C</div>
          </Link>

          {/* Editable Title for Owner/Editor */}
          {role === 'owner' ? (
            <input
              type="text"
              className={styles.titleInput}
              value={title}
              onChange={handleTitleChange}
              onBlur={handleTitleBlur}
              placeholder="Untitled Project"
            />
          ) : (
            <span className={styles.titleStatic}>{title}</span>
          )}

          {/* Room Code Badge with Copy Code and Copy Link */}
          <div className={styles.roomCodeContainer}>
            <span className={styles.roomCodeLabel}>ROOM:</span>
            <span className={styles.roomCodeValue}>{roomId}</span>
            <button
              className={styles.copyCodeBtn}
              onClick={copyRoomCode}
              title="Copy Room Code to clipboard"
            >
              {copiedCode ? '✓ Copied' : 'Copy Code'}
            </button>
            <button
              className={styles.copyLinkBtn}
              onClick={copyRoomLink}
              title="Copy browser link to clipboard"
            >
              {copiedLink ? '✓ Copied' : 'Copy Link'}
            </button>
          </div>
        </div>

        <div className={styles.navRight}>
          {/* User Role Badge */}
          <span
            className={`${styles.roleBadge} ${
              role === 'owner'
                ? styles.roleOwner
                : role === 'editor'
                ? styles.roleEditor
                : styles.roleViewer
            }`}
          >
            {role ? role.toUpperCase() : 'VIEWER'}
          </span>

          {/* Language Selector */}
          <select
            className={styles.selectLang}
            value={lang}
            onChange={(e) => handleLang(e.target.value)}
            disabled={isViewer}
          >
            <option value="cpp">C++</option>
            <option value="java">Java</option>
            <option value="python">Python 3</option>
          </select>

          {/* Theme Toggle */}
          <button
            className="btn_outline"
            onClick={toggleTheme}
            title="Toggle Dark/Light Editor"
          >
            {isDark ? '☀️ Light' : '🌙 Dark'}
          </button>

          {/* Version History Toggle */}
          <button
            className="btn_outline"
            onClick={toggleVersionDrawer}
          >
            <span role="img" aria-label="history">🕒</span> History ({versions ? versions.length : 0})
          </button>

          {/* Save Version Snapshot */}
          {!isViewer && (
            <button
              className="btn_gold"
              onClick={handleSaveVersion}
              title="Snapshot code as a new version"
            >
              <span role="img" aria-label="save">💾</span> Save
            </button>
          )}

          {/* Manage Members (Owner Only) */}
          {role === 'owner' && (
            <button
              className="btn_outline"
              onClick={toggleMembersModal}
            >
              <span role="img" aria-label="members">👥</span> Roles
            </button>
          )}

          {/* Run Code Button */}
          <button
            className={`btn_success ${runCodeDisabled || isViewer ? 'disabled' : ''}`}
            onClick={handleRun}
            disabled={runCodeDisabled || isViewer}
          >
            {runCodeDisabled ? (
              '⏳ Executing...'
            ) : (
              <span>
                <span role="img" aria-label="play">▶</span> Run Code
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Main Split Layout */}
      <div className={styles.editorWorkspace}>
        {/* Left: Monaco Editor Workspace */}
        <div className={styles.editorPane}>
          {/* Professional IDE File Tab Bar */}
          <div className={styles.editorTabBar}>
            <div className={styles.editorTab}>
              <span className={`${styles.langDot} ${styles[`dot_${lang}`]}`}></span>
              <span className={styles.tabFileName}>{fileName}</span>
              {isViewer && <span className={styles.tabReadOnlyBadge}>READ-ONLY</span>}
            </div>
            <div className={styles.tabBarMeta}>
              <span className={styles.metaBadge}>UTF-8</span>
              <span className={styles.metaBadge}>{lang === 'cpp' ? 'C++ 17' : lang === 'java' ? 'Java 17' : 'Python 3'}</span>
            </div>
          </div>

          {isViewer && (
            <div className={styles.viewerOverlayBanner}>
              <span role="img" aria-label="lock">🔒</span> Read-Only Mode (Viewer)
            </div>
          )}

          <div className={styles.monacoWrapper}>
            <MonacoEditor
              automaticLayout={true}
              language={lang === 'python' ? 'python' : lang === 'java' ? 'java' : 'cpp'}
              theme={editorTheme}
              value={code}
              options={monacoOptions}
              editorDidMount={editorDidMount}
              onChange={editorOnChange}
            />
          </div>
        </div>

        {/* Right: Interviewer Stdin Test & Output Console */}
        <div className={styles.sideConsole}>
          <div className={styles.consoleHeader}>
            <h3 className={styles.consoleTitle}>
              <span role="img" aria-label="flask">🧪</span> Test Console
            </h3>

            {executionStatus && (
              <span
                className={`${styles.statusPill} ${
                  executionStatus === 'success'
                    ? styles.statusSuccess
                    : executionStatus === 'timeout'
                    ? styles.statusTimeout
                    : styles.statusError
                }`}
              >
                {executionStatus.toUpperCase()}
              </span>
            )}
          </div>

          <div className={styles.consoleBody}>
            {/* Custom Test Input Card (stdin) */}
            <div className={styles.consoleCard}>
              <div className={styles.cardHeader}>
                <div>
                  <span className={styles.cardTitle}>Test Input (stdin)</span>
                  <span className={styles.cardSubtitle}>Custom interviewer test data</span>
                </div>
                <span className={styles.cardBadge}>optional</span>
              </div>
              <textarea
                className={styles.testTextarea}
                placeholder="Enter test inputs here (e.g. 5&#10;1 2 3 4 5)..."
                value={input}
                onChange={handleInput}
                disabled={isViewer}
                spellCheck="false"
              />
            </div>

            {/* Execution Output Card (stdout & stderr) */}
            <div className={`${styles.consoleCard} ${styles.outputCard}`}>
              <div className={styles.cardHeader}>
                <span className={styles.cardTitle}>Execution Output</span>
                {executionTimeMs !== undefined && executionTimeMs !== null && (
                  <span className={styles.executionBadge}>
                    ⏱ {executionTimeMs} ms
                  </span>
                )}
              </div>

              <div className={styles.terminalOutput}>
                {output ? (
                  <div>{output}</div>
                ) : (
                  <span className={styles.terminalPlaceholder}>
                    Click "Run Code" to view stdout results...
                  </span>
                )}

                {stderr && (
                  <div className={styles.stderrText}>
                    <div className={styles.stderrHeader}>STDERR / Diagnostic:</div>
                    <div>{stderr}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Slide-out Version History Drawer */}
        {showVersionDrawer && (
          <aside className={styles.versionDrawer}>
            <div className={styles.drawerHeader}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>
                Version History
              </h3>
              <button
                className="btn_outline"
                style={{ padding: '2px 8px', fontSize: '12px' }}
                onClick={toggleVersionDrawer}
              >
                ✕ Close
              </button>
            </div>

            <div className={styles.drawerList}>
              {!versions || versions.length === 0 ? (
                <p style={{ color: '#6c757d', fontSize: '13px' }}>
                  No snapshots recorded yet. Hit "Save" to record a version!
                </p>
              ) : (
                versions.map((ver) => (
                  <div key={ver.id} className={styles.versionItem}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className={styles.vNumber}>v{ver.version_number}</span>
                        {ver.label && (
                          <span style={{ fontWeight: 600, fontSize: '12px', color: 'var(--color-text-main)' }}>
                            {ver.label}
                          </span>
                        )}
                      </div>

                      {editingVerId === ver.id ? (
                        <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
                          <input
                            type="text"
                            className={styles.renameInput}
                            value={editingVerText}
                            onChange={(e) => setEditingVerText(e.target.value)}
                            autoFocus
                          />
                          <button className={styles.actionBtnSm} onClick={() => saveRename(ver.id)}>
                            Save
                          </button>
                          <button className={styles.actionBtnSm} onClick={() => setEditingVerId(null)}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className={styles.vAuthor}>
                            By: {ver.created_by_name || 'Anonymous'}
                          </div>
                          <div className={styles.vTime}>
                            {new Date(ver.created_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}{' '}
                            • {new Date(ver.created_at).toLocaleDateString()}
                          </div>
                        </>
                      )}
                    </div>

                    {!isViewer && (
                      <div className={styles.versionActions}>
                        {editingVerId !== ver.id && (
                          <>
                            <button
                              className={styles.actionBtnSm}
                              onClick={() => startRename(ver)}
                              title="Rename this version"
                            >
                              Rename
                            </button>
                            <button
                              className={styles.deleteBtnSm}
                              onClick={() => {
                                if (window.confirm(`Delete version v${ver.version_number}?`)) {
                                  handleDeleteVersion(ver.id);
                                }
                              }}
                              title="Delete this snapshot"
                            >
                              Delete
                            </button>
                          </>
                        )}
                        <button
                          className={styles.restoreBtn}
                          onClick={() => handleRestoreVersion(ver.id)}
                        >
                          Restore
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Members & Roles Modal (Owner Only) */}
      {showMembersModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={toggleMembersModal}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '480px',
              width: '100%',
              boxShadow: '0 16px 36px rgba(0,0,0,0.15)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>
                Manage Room Roles & Permissions
              </h2>
              <button
                className="btn_outline"
                style={{ padding: '2px 8px', fontSize: '12px' }}
                onClick={toggleMembersModal}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '13px', color: '#6c757d', marginBottom: '16px' }}>
              Control who can edit and execute code in this interview workspace:
            </p>

            <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
              {!members || members.length === 0 ? (
                <p style={{ fontSize: '13px', color: '#6c757d' }}>No other members have joined yet.</p>
              ) : (
                members.map((m) => (
                  <div key={m.user_id} className={styles.memberItem}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '14px' }}>{m.name}</div>
                      <div style={{ fontSize: '12px', color: '#6c757d' }}>{m.email}</div>
                    </div>

                    {m.role === 'owner' ? (
                      <span className={styles.roleOwner} style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>
                        Owner
                      </span>
                    ) : (
                      <select
                        value={m.role}
                        onChange={(e) => handleUpdateMemberRole(m.user_id, e.target.value)}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '6px',
                          border: '1px solid var(--color-border)',
                          fontSize: '12px'
                        }}
                      >
                        <option value="editor">Editor (Edit & Run)</option>
                        <option value="viewer">Viewer (Read Only)</option>
                      </select>
                    )}
                  </div>
                ))
              )}
            </div>

            <div style={{ marginTop: '20px', textAlign: 'right' }}>
              <button className="btn_primary" onClick={toggleMembersModal}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditorComponent;

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Determine database mode
const databaseUrl = process.env.DATABASE_URL;
let pool = null;
let useMemoryFallback = false;

// In-memory fallback store for local dev without PostgreSQL installed
const memoryStore = {
  users: [],
  projects: [],
  project_members: [],
  version_history: []
};

// Persistent JSON file path for fallback dev mode
const fallbackFilePath = path.join(__dirname, 'local_dev_db.json');

function loadFallbackData() {
  try {
    if (fs.existsSync(fallbackFilePath)) {
      const data = JSON.parse(fs.readFileSync(fallbackFilePath, 'utf8'));
      memoryStore.users = data.users || [];
      memoryStore.projects = data.projects || [];
      memoryStore.project_members = data.project_members || [];
      memoryStore.version_history = data.version_history || [];
    }
  } catch (err) {
    console.warn('[DB] Could not load local dev fallback file, using clean state:', err.message);
  }
}

function persistFallbackData() {
  try {
    fs.writeFileSync(fallbackFilePath, JSON.stringify(memoryStore, null, 2), 'utf8');
  } catch (err) {
    console.warn('[DB] Failed to persist local dev state:', err.message);
  }
}

async function initDb() {
  if (databaseUrl) {
    try {
      pool = new Pool({
        connectionString: databaseUrl,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      });

      // Test connection
      const client = await pool.connect();
      console.log('[DB] Connected successfully to PostgreSQL.');
      client.release();

      // Create schema
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(64) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS projects (
          id VARCHAR(64) PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          owner_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
          language VARCHAR(32) NOT NULL DEFAULT 'cpp',
          current_code TEXT DEFAULT '',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS project_members (
          project_id VARCHAR(64) REFERENCES projects(id) ON DELETE CASCADE,
          user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
          role VARCHAR(32) NOT NULL DEFAULT 'editor',
          joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (project_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS version_history (
          id VARCHAR(64) PRIMARY KEY,
          project_id VARCHAR(64) REFERENCES projects(id) ON DELETE CASCADE,
          version_number INT NOT NULL,
          code TEXT NOT NULL,
          language VARCHAR(32) NOT NULL,
          created_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
          created_by_name VARCHAR(255),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('[DB] PostgreSQL schema initialized.');
      return;
    } catch (err) {
      console.warn('[DB] PostgreSQL connection failed. Falling back to local dev storage:', err.message);
      useMemoryFallback = true;
      loadFallbackData();
    }
  } else {
    console.log('[DB] DATABASE_URL not set. Running in resilient local dev mode.');
    useMemoryFallback = true;
    loadFallbackData();
  }
}

// User Helpers
async function createUser({ name, email, passwordHash }) {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  if (!useMemoryFallback && pool) {
    const res = await pool.query(
      `INSERT INTO users (id, name, email, password_hash, created_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, created_at`,
      [id, name, email.toLowerCase(), passwordHash, createdAt]
    );
    return res.rows[0];
  }

  // Fallback
  const existing = memoryStore.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    const err = new Error('User already exists with this email');
    err.code = '23505';
    throw err;
  }
  const user = { id, name, email: email.toLowerCase(), password_hash: passwordHash, created_at: createdAt };
  memoryStore.users.push(user);
  persistFallbackData();
  return { id, name, email: user.email, created_at: createdAt };
}

async function findUserByEmail(email) {
  if (!useMemoryFallback && pool) {
    const res = await pool.query(`SELECT * FROM users WHERE LOWER(email) = $1`, [email.toLowerCase()]);
    return res.rows[0] || null;
  }
  return memoryStore.users.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
}

async function findUserById(id) {
  if (!useMemoryFallback && pool) {
    const res = await pool.query(`SELECT id, name, email, created_at FROM users WHERE id = $1`, [id]);
    return res.rows[0] || null;
  }
  const u = memoryStore.users.find(user => user.id === id);
  if (!u) return null;
  return { id: u.id, name: u.name, email: u.email, created_at: u.created_at };
}

async function upsertUser({ id, name, email }) {
  const createdAt = new Date().toISOString();
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = (name && name.trim()) || cleanEmail.split('@')[0];
  const cleanId = id || crypto.randomUUID();

  if (!useMemoryFallback && pool) {
    const res = await pool.query(
      `INSERT INTO users (id, name, email, password_hash, created_at)
       VALUES ($1, $2, $3, 'supabase_auth', $4)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email
       RETURNING id, name, email, created_at`,
      [cleanId, cleanName, cleanEmail, createdAt]
    );
    return res.rows[0];
  }

  let u = memoryStore.users.find(user => user.id === cleanId || user.email.toLowerCase() === cleanEmail);
  if (u) {
    u.id = cleanId;
    u.name = cleanName;
    u.email = cleanEmail;
  } else {
    u = { id: cleanId, name: cleanName, email: cleanEmail, password_hash: 'supabase_auth', created_at: createdAt };
    memoryStore.users.push(u);
  }
  persistFallbackData();
  return { id: u.id, name: u.name, email: u.email, created_at: u.created_at };
}

// Project Helpers
async function createProject({ id, title, ownerId, language, initialCode }) {
  const projectId = id ? id.trim() : crypto.randomBytes(4).toString('hex');
  const now = new Date().toISOString();
  const lang = language || 'cpp';
  const code = initialCode !== undefined ? initialCode : getDefaultCode(lang);

  if (!useMemoryFallback && pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query(
        `INSERT INTO projects (id, title, owner_id, language, current_code, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [projectId, title || 'Untitled Project', ownerId, lang, code, now, now]
      );
      // Automatically add owner to members with role 'owner'
      await client.query(
        `INSERT INTO project_members (project_id, user_id, role, joined_at)
         VALUES ($1, $2, 'owner', $3) ON CONFLICT DO NOTHING`,
        [projectId, ownerId, now]
      );
      // Save initial v1 version snapshot
      const versionId = crypto.randomUUID();
      await client.query(
        `INSERT INTO version_history (id, project_id, version_number, code, language, created_by, created_by_name, label, created_at)
         VALUES ($1, $2, 1, $3, $4, $5, 'Initial Setup', 'Initial Version', $6)`,
        [versionId, projectId, code, lang, ownerId, now]
      );
      await client.query('COMMIT');
      return res.rows[0];
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // Fallback
  const project = {
    id: projectId,
    title: title || 'Untitled Project',
    owner_id: ownerId,
    language: lang,
    current_code: code,
    created_at: now,
    updated_at: now
  };
  memoryStore.projects.push(project);
  memoryStore.project_members.push({ project_id: projectId, user_id: ownerId, role: 'owner', joined_at: now });
  memoryStore.version_history.push({
    id: crypto.randomUUID(),
    project_id: projectId,
    version_number: 1,
    code,
    language: lang,
    created_by: ownerId,
    created_by_name: 'Initial Setup',
    label: 'Initial Version',
    created_at: now
  });
  persistFallbackData();
  return project;
}

async function getProjectById(id) {
  if (!useMemoryFallback && pool) {
    const res = await pool.query(
      `SELECT p.*, u.name as owner_name, u.email as owner_email 
       FROM projects p 
       LEFT JOIN users u ON p.owner_id = u.id 
       WHERE p.id = $1`,
      [id]
    );
    return res.rows[0] || null;
  }
  const p = memoryStore.projects.find(project => project.id === id);
  if (!p) return null;
  const owner = memoryStore.users.find(u => u.id === p.owner_id);
  return { ...p, owner_name: owner ? owner.name : 'Unknown', owner_email: owner ? owner.email : '' };
}

async function listProjectsForUser(userId) {
  if (!useMemoryFallback && pool) {
    const res = await pool.query(
      `SELECT p.*, pm.role, u.name as owner_name 
       FROM projects p
       JOIN project_members pm ON p.id = pm.project_id
       LEFT JOIN users u ON p.owner_id = u.id
       WHERE pm.user_id = $1
       ORDER BY p.updated_at DESC`,
      [userId]
    );
    return res.rows;
  }

  const userMemberships = memoryStore.project_members.filter(m => m.user_id === userId);
  const result = [];
  for (const m of userMemberships) {
    const p = memoryStore.projects.find(proj => proj.id === m.project_id);
    if (p) {
      const owner = memoryStore.users.find(u => u.id === p.owner_id);
      result.push({
        ...p,
        role: m.role,
        owner_name: owner ? owner.name : 'Unknown'
      });
    }
  }
  return result.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
}

async function updateProject(id, { title, language, currentCode }) {
  const now = new Date().toISOString();
  if (!useMemoryFallback && pool) {
    const res = await pool.query(
      `UPDATE projects 
       SET title = COALESCE($1, title),
           language = COALESCE($2, language),
           current_code = COALESCE($3, current_code),
           updated_at = $4
       WHERE id = $5 RETURNING *`,
      [title, language, currentCode, now, id]
    );
    return res.rows[0];
  }

  const p = memoryStore.projects.find(project => project.id === id);
  if (!p) return null;
  if (title !== undefined) p.title = title;
  if (language !== undefined) p.language = language;
  if (currentCode !== undefined) p.current_code = currentCode;
  p.updated_at = now;
  persistFallbackData();
  return p;
}

async function deleteProject(id) {
  if (!useMemoryFallback && pool) {
    await pool.query(`DELETE FROM projects WHERE id = $1`, [id]);
    return true;
  }
  memoryStore.projects = memoryStore.projects.filter(p => p.id !== id);
  memoryStore.project_members = memoryStore.project_members.filter(m => m.project_id !== id);
  memoryStore.version_history = memoryStore.version_history.filter(v => v.project_id !== id);
  persistFallbackData();
  return true;
}

// Role and Member Management
async function getMemberRole(projectId, userId) {
  if (!useMemoryFallback && pool) {
    const res = await pool.query(
      `SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2`,
      [projectId, userId]
    );
    return res.rows[0] ? res.rows[0].role : null;
  }
  const m = memoryStore.project_members.find(mem => mem.project_id === projectId && mem.user_id === userId);
  return m ? m.role : null;
}

async function addMember(projectId, userId, role = 'editor') {
  const now = new Date().toISOString();
  if (!useMemoryFallback && pool) {
    const res = await pool.query(
      `INSERT INTO project_members (project_id, user_id, role, joined_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role
       RETURNING *`,
      [projectId, userId, role, now]
    );
    return res.rows[0];
  }
  const existing = memoryStore.project_members.find(m => m.project_id === projectId && m.user_id === userId);
  if (existing) {
    existing.role = role;
  } else {
    memoryStore.project_members.push({ project_id: projectId, user_id: userId, role, joined_at: now });
  }
  persistFallbackData();
  return { project_id: projectId, user_id: userId, role };
}

async function updateMemberRole(projectId, userId, role) {
  if (!useMemoryFallback && pool) {
    const res = await pool.query(
      `UPDATE project_members SET role = $1 WHERE project_id = $2 AND user_id = $3 RETURNING *`,
      [role, projectId, userId]
    );
    return res.rows[0] || null;
  }
  const m = memoryStore.project_members.find(mem => mem.project_id === projectId && mem.user_id === userId);
  if (!m) return null;
  m.role = role;
  persistFallbackData();
  return m;
}

async function getProjectMembers(projectId) {
  if (!useMemoryFallback && pool) {
    const res = await pool.query(
      `SELECT pm.user_id, pm.role, pm.joined_at, u.name, u.email
       FROM project_members pm
       JOIN users u ON pm.user_id = u.id
       WHERE pm.project_id = $1
       ORDER BY pm.joined_at ASC`,
      [projectId]
    );
    return res.rows;
  }
  const members = memoryStore.project_members.filter(m => m.project_id === projectId);
  return members.map(m => {
    const u = memoryStore.users.find(user => user.id === m.user_id);
    return {
      user_id: m.user_id,
      role: m.role,
      joined_at: m.joined_at,
      name: u ? u.name : 'Unknown User',
      email: u ? u.email : ''
    };
  });
}

// Version History
async function saveVersion({ projectId, code, language, createdBy, createdByName, label }) {
  const versionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const versionLabel = label || null;

  if (!useMemoryFallback && pool) {
    const maxRes = await pool.query(
      `SELECT COALESCE(MAX(version_number), 0) as max_v FROM version_history WHERE project_id = $1`,
      [projectId]
    );
    const nextVersion = parseInt(maxRes.rows[0].max_v, 10) + 1;
    const res = await pool.query(
      `INSERT INTO version_history (id, project_id, version_number, code, language, created_by, created_by_name, label, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [versionId, projectId, nextVersion, code, language, createdBy, createdByName, versionLabel, now]
    );
    // Also update project's current_code and updated_at
    await pool.query(
      `UPDATE projects SET current_code = $1, language = $2, updated_at = $3 WHERE id = $4`,
      [code, language, now, projectId]
    );
    return res.rows[0];
  }

  const existingVersions = memoryStore.version_history.filter(v => v.project_id === projectId);
  const nextVersion = existingVersions.length + 1;
  const versionRecord = {
    id: versionId,
    project_id: projectId,
    version_number: nextVersion,
    code,
    language,
    created_by: createdBy,
    created_by_name: createdByName,
    label: versionLabel,
    created_at: now
  };
  memoryStore.version_history.push(versionRecord);

  // Update project
  const p = memoryStore.projects.find(proj => proj.id === projectId);
  if (p) {
    p.current_code = code;
    p.language = language;
    p.updated_at = now;
  }
  persistFallbackData();
  return versionRecord;
}

async function renameVersion(versionId, projectId, newLabel) {
  if (!useMemoryFallback && pool) {
    const res = await pool.query(
      `UPDATE version_history SET label = $1 WHERE id = $2 AND project_id = $3 RETURNING *`,
      [newLabel, versionId, projectId]
    );
    return res.rows[0] || null;
  }
  const v = memoryStore.version_history.find(ver => ver.id === versionId && ver.project_id === projectId);
  if (!v) return null;
  v.label = newLabel;
  persistFallbackData();
  return v;
}

async function deleteVersion(versionId, projectId) {
  if (!useMemoryFallback && pool) {
    await pool.query(`DELETE FROM version_history WHERE id = $1 AND project_id = $2`, [versionId, projectId]);
    return true;
  }
  memoryStore.version_history = memoryStore.version_history.filter(
    ver => !(ver.id === versionId && ver.project_id === projectId)
  );
  persistFallbackData();
  return true;
}

async function getVersionsByProjectId(projectId) {
  if (!useMemoryFallback && pool) {
    const res = await pool.query(
      `SELECT * FROM version_history WHERE project_id = $1 ORDER BY version_number DESC`,
      [projectId]
    );
    return res.rows;
  }
  return memoryStore.version_history
    .filter(v => v.project_id === projectId)
    .sort((a, b) => b.version_number - a.version_number);
}

async function getVersionById(versionId) {
  if (!useMemoryFallback && pool) {
    const res = await pool.query(`SELECT * FROM version_history WHERE id = $1`, [versionId]);
    return res.rows[0] || null;
  }
  return memoryStore.version_history.find(v => v.id === versionId) || null;
}

function getDefaultCode(lang) {
  switch (lang) {
    case 'python':
      return `print("Hello, World!")\n`;
    case 'java':
      return `public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}\n`;
    case 'cpp':
    default:
      return `#include <iostream>\n\nusing namespace std;\n\nint main() {\n    cout << "Hello, World!" << endl;\n    return 0;\n}\n`;
  }
}

module.exports = {
  initDb,
  createUser,
  upsertUser,
  findUserByEmail,
  findUserById,
  createProject,
  getProjectById,
  listProjectsForUser,
  updateProject,
  deleteProject,
  getMemberRole,
  addMember,
  updateMemberRole,
  getProjectMembers,
  saveVersion,
  renameVersion,
  deleteVersion,
  getVersionsByProjectId,
  getVersionById,
  getDefaultCode
};

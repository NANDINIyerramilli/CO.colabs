const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware, optionalAuth } = require('../Middleware/auth');

// Get all projects for current user
router.get('/', authMiddleware, async (req, res) => {
  try {
    const projects = await db.listProjectsForUser(req.user.id);
    res.json({ projects });
  } catch (err) {
    console.error('[Projects] List error:', err);
    res.status(500).json({ error: 'Failed to fetch projects.' });
  }
});

// Create a new project
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, language, initialCode } = req.body;
    const project = await db.createProject({
      title: title || 'Untitled Project',
      ownerId: req.user.id,
      language: language || 'cpp',
      initialCode
    });
    res.status(201).json({ project, role: 'owner' });
  } catch (err) {
    console.error('[Projects] Create error:', err);
    res.status(500).json({ error: 'Failed to create project.' });
  }
});

// Get project by ID and determine current user's role
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const cleanId = id ? id.trim() : '';
    let project = await db.getProjectById(cleanId) || await db.getProjectById(cleanId.toLowerCase());

    // If project does not exist yet (e.g. legacy room ID or direct link), create it on the fly
    if (!project) {
      const ownerId = req.user ? req.user.id : 'anonymous';
      project = await db.createProject({
        id: cleanId,
        title: `Room ${cleanId.slice(0, 8)}`,
        ownerId,
        language: 'cpp'
      });
    }

    let role = 'viewer';
    if (req.user) {
      if (project.owner_id === req.user.id) {
        role = 'owner';
      } else {
        const existingRole = await db.getMemberRole(id, req.user.id);
        if (existingRole) {
          role = existingRole;
        } else {
          // Auto-join as editor by default for collaboration
          await db.addMember(id, req.user.id, 'editor');
          role = 'editor';
        }
      }
    } else {
      // Unauthenticated visitor is viewer
      role = 'viewer';
    }

    res.json({ project, role });
  } catch (err) {
    console.error('[Projects] Get error:', err);
    res.status(500).json({ error: 'Failed to fetch project details.' });
  }
});

// Update project (Title, Language, Code)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const project = await db.getProjectById(id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    const role = await db.getMemberRole(id, req.user.id) || (project.owner_id === req.user.id ? 'owner' : null);
    if (!role || role === 'viewer') {
      return res.status(403).json({ error: 'You have read-only permissions for this project.' });
    }

    const { title, language, currentCode } = req.body;
    const updated = await db.updateProject(id, { title, language, currentCode });
    res.json({ project: updated });
  } catch (err) {
    console.error('[Projects] Update error:', err);
    res.status(500).json({ error: 'Failed to update project.' });
  }
});

// Delete project (Owner only)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const project = await db.getProjectById(id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    if (project.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the project owner can delete this room.' });
    }

    await db.deleteProject(id);
    res.json({ message: 'Project deleted successfully.' });
  } catch (err) {
    console.error('[Projects] Delete error:', err);
    res.status(500).json({ error: 'Failed to delete project.' });
  }
});

// List project members
router.get('/:id/members', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const members = await db.getProjectMembers(id);
    res.json({ members });
  } catch (err) {
    console.error('[Projects] Members error:', err);
    res.status(500).json({ error: 'Failed to fetch members.' });
  }
});

// Update member role (Owner only)
router.put('/:id/members/:userId', authMiddleware, async (req, res) => {
  try {
    const { id, userId } = req.params;
    const { role } = req.body; // 'editor' | 'viewer'

    if (!['editor', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be editor or viewer.' });
    }

    const project = await db.getProjectById(id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    if (project.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the owner can modify roles.' });
    }

    if (userId === project.owner_id) {
      return res.status(400).json({ error: 'Cannot change owner role.' });
    }

    const updated = await db.updateMemberRole(id, userId, role);
    res.json({ member: updated });
  } catch (err) {
    console.error('[Projects] Update role error:', err);
    res.status(500).json({ error: 'Failed to update member role.' });
  }
});

// Get version history
router.get('/:id/versions', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const versions = await db.getVersionsByProjectId(id);
    res.json({ versions });
  } catch (err) {
    console.error('[Projects] Versions error:', err);
    res.status(500).json({ error: 'Failed to fetch version history.' });
  }
});

// Save a new version snapshot
router.post('/:id/versions', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { code, language } = req.body;

    const project = await db.getProjectById(id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    const role = await db.getMemberRole(id, req.user.id) || (project.owner_id === req.user.id ? 'owner' : null);
    if (!role || role === 'viewer') {
      return res.status(403).json({ error: 'Viewers cannot create version snapshots.' });
    }

    const version = await db.saveVersion({
      projectId: id,
      code,
      language: language || project.language,
      createdBy: req.user.id,
      createdByName: req.user.name
    });

    res.status(201).json({ version });
  } catch (err) {
    console.error('[Projects] Save version error:', err);
    res.status(500).json({ error: 'Failed to save version.' });
  }
});

// Restore a version snapshot
router.post('/:id/versions/:versionId/restore', authMiddleware, async (req, res) => {
  try {
    const { id, versionId } = req.params;
    const project = await db.getProjectById(id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    const role = await db.getMemberRole(id, req.user.id) || (project.owner_id === req.user.id ? 'owner' : null);
    if (!role || role === 'viewer') {
      return res.status(403).json({ error: 'Viewers cannot restore versions.' });
    }

    const targetVersion = await db.getVersionById(versionId);
    if (!targetVersion || targetVersion.project_id !== id) {
      return res.status(404).json({ error: 'Version not found.' });
    }

    // Save a new snapshot marking the restore
    const restoredVersion = await db.saveVersion({
      projectId: id,
      code: targetVersion.code,
      language: targetVersion.language,
      createdBy: req.user.id,
      createdByName: `${req.user.name} (Restored v${targetVersion.version_number})`
    });

    res.json({
      message: `Restored to version ${targetVersion.version_number}`,
      restoredCode: targetVersion.code,
      language: targetVersion.language,
      newVersion: restoredVersion
    });
  } catch (err) {
    console.error('[Projects] Restore version error:', err);
    res.status(500).json({ error: 'Failed to restore version.' });
  }
});

// Rename a version snapshot
router.put('/:id/versions/:versionId', authMiddleware, async (req, res) => {
  try {
    const { id, versionId } = req.params;
    const { label } = req.body;

    const project = await db.getProjectById(id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    const role = await db.getMemberRole(id, req.user.id) || (project.owner_id === req.user.id ? 'owner' : null);
    if (!role || role === 'viewer') {
      return res.status(403).json({ error: 'Viewers cannot rename versions.' });
    }

    const updated = await db.renameVersion(versionId, id, label || 'Version');
    if (!updated) {
      return res.status(404).json({ error: 'Version not found.' });
    }

    res.json({ message: 'Version renamed successfully', version: updated });
  } catch (err) {
    console.error('[Projects] Rename version error:', err);
    res.status(500).json({ error: 'Failed to rename version.' });
  }
});

// Delete a version snapshot
router.delete('/:id/versions/:versionId', authMiddleware, async (req, res) => {
  try {
    const { id, versionId } = req.params;

    const project = await db.getProjectById(id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    const role = await db.getMemberRole(id, req.user.id) || (project.owner_id === req.user.id ? 'owner' : null);
    if (!role || role === 'viewer') {
      return res.status(403).json({ error: 'Viewers cannot delete versions.' });
    }

    await db.deleteVersion(versionId, id);
    res.json({ message: 'Version snapshot deleted successfully.' });
  } catch (err) {
    console.error('[Projects] Delete version error:', err);
    res.status(500).json({ error: 'Failed to delete version.' });
  }
});

module.exports = router;


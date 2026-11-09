const router = require('express').Router();
const { executeCode } = require('../Services/codeRunner');
const db = require('../db');
const { authMiddleware } = require('../Middleware/auth');

router.post('/run', authMiddleware, async (req, res) => {
  try {
    const { code, input = '', id, lang = 'cpp' } = req.body;

    // Validate code payload
    if (!code || typeof code !== 'string') {
      return res.status(400).json({
        stdout: '',
        stderr: 'No code provided to execute.',
        status: 'error',
        executionTimeMs: 0
      });
    }

    // Validate project ID
    if (!id || typeof id !== 'string' || !id.trim()) {
      return res.status(400).json({
        stdout: '',
        stderr: 'Project ID is required for execution authorization.',
        status: 'error',
        executionTimeMs: 0
      });
    }

    const projectId = id.trim();

    // Verify project exists
    const project = await db.getProjectById(projectId);
    if (!project) {
      return res.status(404).json({
        stdout: '',
        stderr: 'Project not found.',
        status: 'error',
        executionTimeMs: 0
      });
    }

    // Role check: only owners and editors may execute code
    const isOwner = project.owner_id === req.user.id;
    const memberRole = await db.getMemberRole(projectId, req.user.id);
    const isAuthorized = isOwner || memberRole === 'editor' || memberRole === 'owner';

    if (!isAuthorized) {
      return res.status(403).json({
        stdout: '',
        stderr: 'Execution denied: Viewers have read-only access and cannot run code.',
        status: 'forbidden',
        executionTimeMs: 0
      });
    }

    // Execute code inside isolated runner
    const result = await executeCode({ code, input, lang });

    // Send rich result object
    res.json(result);
  } catch (err) {
    console.error('[CodeRun] Error:', err);
    res.status(500).json({
      stdout: '',
      stderr: 'Internal execution server error: ' + err.message,
      status: 'error',
      executionTimeMs: 0
    });
  }
});

module.exports = router;

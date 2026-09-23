const router = require('express').Router();
const { executeCode } = require('../Services/codeRunner');
const db = require('../db');
const { optionalAuth } = require('../Middleware/auth');

router.post('/run', optionalAuth, async (req, res) => {
  try {
    const { code, input = '', id, lang = 'cpp' } = req.body;

    if (!code) {
      return res.status(400).json({
        stdout: '',
        stderr: 'No code provided to execute.',
        status: 'error',
        executionTimeMs: 0
      });
    }

    // Role check: if user is authenticated and project exists, check permissions
    if (req.user && id) {
      const project = await db.getProjectById(id);
      if (project && project.owner_id !== req.user.id) {
        const role = await db.getMemberRole(id, req.user.id);
        if (role === 'viewer') {
          return res.status(403).json({
            stdout: '',
            stderr: 'Execution denied: Viewers have read-only access and cannot run code.',
            status: 'forbidden',
            executionTimeMs: 0
          });
        }
      }
    }

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
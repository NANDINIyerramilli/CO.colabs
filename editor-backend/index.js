require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const url = require('url');
const WebSocket = require('ws');
const shareDB = require('sharedb');
const WebSocketJSONStream = require('@teamwork/websocket-json-stream');

const db = require('./db');
const { verifyToken } = require('./Middleware/auth');
const authRouter = require('./Routes/auth');
const projectsRouter = require('./Routes/projects');
const codeRunRouter = require('./Routes/codeRun');

const PORT = process.env.PORT || 5000;

// ShareDB server instance with presence tracking
const share = new shareDB({ presence: true });

// ShareDB Middleware: Attach authenticated user identity to agent on connection
share.use('connect', (context, next) => {
  if (context.req) {
    context.agent.user = context.req.user || null;
    context.agent.projectId = context.req.projectId || null;
  }
  next();
});

// ShareDB Middleware: Authorize document reads
share.use('readSnapshots', async (context, next) => {
  // Allow internal server synchronization
  if (context.agent.isServer) return next();
  if (context.collection !== 'examples') return next(new Error('Invalid document collection.'));

  try {
    for (const snapshot of context.snapshots) {
      const project = await db.getProjectById(snapshot.id);
      if (!project) {
        return next(new Error('Document not found or unauthorized.'));
      }
    }
    next();
  } catch (err) {
    next(err);
  }
});

// ShareDB Middleware: Authorize document mutations (submit)
share.use('submit', async (context, next) => {
  // Allow internal server synchronization
  if (context.agent.isServer) return next();
  if (context.collection !== 'examples') return next(new Error('Invalid document collection.'));

  const user = context.agent.user;
  if (!user) {
    return next(new Error('Unauthorized: Authentication required to edit documents.'));
  }

  try {
    const projectId = context.id;
    const project = await db.getProjectById(projectId);
    if (!project) {
      return next(new Error('Project not found.'));
    }

    const isOwner = project.owner_id === user.id;
    const memberRole = await db.getMemberRole(projectId, user.id);
    const canEdit = isOwner || memberRole === 'editor' || memberRole === 'owner';

    if (!canEdit) {
      return next(new Error('Unauthorized: Viewers have read-only permissions and cannot modify documents.'));
    }

    next();
  } catch (err) {
    next(err);
  }
});

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// Mount API routes
app.use('/auth', authRouter);
app.use('/api/projects', projectsRouter);
app.use('/code', codeRunRouter);

// WebSocket server for ShareDB real-time operational transformation
const wss = new WebSocket.Server({ noServer: true });
wss.on('connection', (ws, request) => {
  const stream = new WebSocketJSONStream(ws);
  stream.on('error', (error) => {
    console.warn('[ShareDB Stream Error]:', error.message);
  });
  share.listen(stream, request);
});

// ShareDB connection for server-side persistence integration
const connection = share.connect();
connection.agent.isServer = true;

// Document initialization & PostgreSQL synchronization endpoint
app.post('/', async (req, res) => {
  const id = req.body.id;
  if (!id) {
    return res.status(400).send('Project ID is required.');
  }

  try {
    // Look up project in database
    let project = await db.getProjectById(id);
    const initialLang = project ? project.language : 'cpp';
    const initialCode = project ? project.current_code : db.getDefaultCode(initialLang);

    const doc = connection.get('examples', id);
    doc.fetch((err) => {
      if (err) {
        console.error('[ShareDB] Fetch error:', err);
        return res.status(500).send('Error fetching document');
      }

      if (doc.type == null) {
        doc.create({
          content: initialCode,
          output: [''],
          input: [''],
          lang: [initialLang]
        });

        // Listen for document changes and debounce-sync back to database
        setupDocumentSync(doc, id);
      }

      res.json({
        message: 'Document ready',
        id,
        language: initialLang
      });
    });
  } catch (err) {
    console.error('[Document Init Error]:', err);
    res.status(500).send('Internal server error');
  }
});

// Debounce-sync document changes to Postgres
const debounceTimers = new Map();
function setupDocumentSync(doc, projectId) {
  doc.on('op', (op, source) => {
    if (debounceTimers.has(projectId)) {
      clearTimeout(debounceTimers.get(projectId));
    }

    const timer = setTimeout(async () => {
      try {
        if (doc.data && doc.data.content !== undefined) {
          const currentCode = doc.data.content;
          const currentLang = doc.data.lang && doc.data.lang[0] ? doc.data.lang[0] : 'cpp';
          await db.updateProject(projectId, {
            currentCode,
            language: currentLang
          });
        }
      } catch (err) {
        console.warn(`[Sync Error for ${projectId}]:`, err.message);
      } finally {
        debounceTimers.delete(projectId);
      }
    }, 3000); // Debounce by 3 seconds

    debounceTimers.set(projectId, timer);
  });
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// HTTP Server setup
const server = app.listen(PORT, async () => {
  await db.initDb();
  console.log(`[Cocolabs Backend] Server running on port ${PORT}`);
});

// Upgrade HTTP to WebSocket for ShareDB (/bar or /ws) with JWT validation
server.on('upgrade', async (request, socket, head) => {
  const parsedUrl = url.parse(request.url, true);
  const pathname = parsedUrl.pathname;

  if (pathname === '/bar' || pathname === '/ws') {
    const token = parsedUrl.query.token;
    let user = null;

    if (token) {
      user = await verifyToken(token);
      if (!user) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
    }

    request.user = user;
    request.projectId = parsedUrl.query.projectId || null;

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

module.exports = { app, server, share };

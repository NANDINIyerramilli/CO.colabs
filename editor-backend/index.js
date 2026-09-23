require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const url = require('url');
const WebSocket = require('ws');
const shareDB = require('sharedb');
const WebSocketJSONStream = require('@teamwork/websocket-json-stream');

const db = require('./db');
const authRouter = require('./Routes/auth');
const projectsRouter = require('./Routes/projects');
const codeRunRouter = require('./Routes/codeRun');

const PORT = process.env.PORT || 5000;

// ShareDB server instance with presence tracking
const share = new shareDB({ presence: true });

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// Mount API routes
app.use('/auth', authRouter);
app.use('/api/projects', projectsRouter);
app.use('/code', codeRunRouter);

// WebSocket server for ShareDB real-time operational transformation
const wss = new WebSocket.Server({ noServer: true });
wss.on('connection', (ws) => {
  const stream = new WebSocketJSONStream(ws);
  stream.on('error', (error) => {
    console.warn('[ShareDB Stream Error]:', error.message);
  });
  share.listen(stream);
});

// ShareDB connection for server-side persistence integration
const connection = share.connect();

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

// Upgrade HTTP to WebSocket for ShareDB (/bar or /ws)
server.on('upgrade', (request, socket, head) => {
  const pathname = url.parse(request.url).pathname;

  if (pathname === '/bar' || pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws);
    });
  } else {
    socket.destroy();
  }
});
const assert = require('assert');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authMiddleware, verifyToken, JWT_SECRET } = require('../Middleware/auth');
const codeRunRouter = require('../Routes/codeRun');
const projectsRouter = require('../Routes/projects');
const { share } = require('../index');

// Helper to mock Express req, res, next
function mockReqRes(reqData = {}) {
  const req = {
    headers: reqData.headers || {},
    body: reqData.body || {},
    params: reqData.params || {},
    query: reqData.query || {},
    user: reqData.user || null
  };

  const res = {
    statusCode: 200,
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.data = data;
      return this;
    },
    send(data) {
      this.data = data;
      return this;
    }
  };

  return { req, res };
}

async function runSecurityUnitTests() {
  console.log('--- Starting Comprehensive In-Process Security & Authorization Tests ---');

  // 1. Initialize database (fallback or PostgreSQL)
  await db.initDb();

  // 2. Create test users
  const ownerUser = await db.createUser({
    name: 'Sec Owner',
    email: `owner_${Date.now()}@example.com`,
    passwordHash: 'hashed123'
  });
  const ownerToken = jwt.sign({ id: ownerUser.id, name: ownerUser.name, email: ownerUser.email }, JWT_SECRET);

  const viewerUser = await db.createUser({
    name: 'Sec Viewer',
    email: `viewer_${Date.now()}@example.com`,
    passwordHash: 'hashed123'
  });
  const viewerToken = jwt.sign({ id: viewerUser.id, name: viewerUser.name, email: viewerUser.email }, JWT_SECRET);

  const editorUser = await db.createUser({
    name: 'Sec Editor',
    email: `editor_${Date.now()}@example.com`,
    passwordHash: 'hashed123'
  });
  const editorToken = jwt.sign({ id: editorUser.id, name: editorUser.name, email: editorUser.email }, JWT_SECRET);

  // 3. Create test project
  const project = await db.createProject({
    title: 'Security Room',
    ownerId: ownerUser.id,
    language: 'python',
    initialCode: 'print("initial")'
  });
  await db.addMember(project.id, viewerUser.id, 'viewer');
  await db.addMember(project.id, editorUser.id, 'editor');

  // TEST 1: authMiddleware rejects missing Authorization header with 401
  const { req: req1, res: res1 } = mockReqRes();
  let nextCalled1 = false;
  await authMiddleware(req1, res1, () => { nextCalled1 = true; });
  assert.strictEqual(res1.statusCode, 401, 'Missing token must return 401');
  assert.strictEqual(nextCalled1, false, 'Next must not be called when token is missing');
  console.log('✔ Test 1 Passed: authMiddleware rejects missing token with 401');

  // TEST 2: authMiddleware rejects invalid / malformed token with 401
  const { req: req2, res: res2 } = mockReqRes({ headers: { authorization: 'Bearer bogus.token.xyz' } });
  let nextCalled2 = false;
  await authMiddleware(req2, res2, () => { nextCalled2 = true; });
  assert.strictEqual(res2.statusCode, 401, 'Invalid token must return 401');
  assert.strictEqual(nextCalled2, false, 'Next must not be called when token is invalid');
  console.log('✔ Test 2 Passed: authMiddleware rejects invalid token with 401');

  // TEST 3: authMiddleware accepts valid token and attaches user
  const { req: req3, res: res3 } = mockReqRes({ headers: { authorization: `Bearer ${ownerToken}` } });
  let nextCalled3 = false;
  await authMiddleware(req3, res3, () => { nextCalled3 = true; });
  assert.strictEqual(nextCalled3, true, 'Next must be called when token is valid');
  assert.strictEqual(req3.user.id, ownerUser.id, 'Attached user ID must match token payload');
  console.log('✔ Test 3 Passed: authMiddleware accepts valid token and attaches user identity');

  // Extract the /code/run route handler
  const codeRunHandler = codeRunRouter.stack.find(s => s.route && s.route.path === '/run').route.stack[1].handle;

  // TEST 4: /code/run rejects missing code with 400
  const { req: req4, res: res4 } = mockReqRes({ user: ownerUser, body: { id: project.id } });
  await codeRunHandler(req4, res4);
  assert.strictEqual(res4.statusCode, 400, 'Missing code must return 400');
  console.log('✔ Test 4 Passed: /code/run rejects missing code with 400');

  // TEST 5: /code/run rejects missing project ID with 400
  const { req: req5, res: res5 } = mockReqRes({ user: ownerUser, body: { code: 'print(1)' } });
  await codeRunHandler(req5, res5);
  assert.strictEqual(res5.statusCode, 400, 'Missing project ID must return 400');
  console.log('✔ Test 5 Passed: /code/run rejects missing project ID with 400');

  // TEST 6: /code/run rejects non-existent project with 404
  const { req: req6, res: res6 } = mockReqRes({ user: ownerUser, body: { code: 'print(1)', id: 'nonexistent_project_id' } });
  await codeRunHandler(req6, res6);
  assert.strictEqual(res6.statusCode, 404, 'Nonexistent project must return 404');
  console.log('✔ Test 6 Passed: /code/run rejects nonexistent project with 404');

  // TEST 7: /code/run rejects Viewer role with 403
  const { req: req7, res: res7 } = mockReqRes({ user: viewerUser, body: { code: 'print("hacked")', id: project.id } });
  await codeRunHandler(req7, res7);
  assert.strictEqual(res7.statusCode, 403, 'Viewer role executing code must be rejected with 403');
  assert.ok(res7.data.stderr.includes('Viewers have read-only access'));
  console.log('✔ Test 7 Passed: /code/run blocks Viewer with 403');

  // TEST 8: /code/run allows Owner to execute code
  const { req: req8, res: res8 } = mockReqRes({ user: ownerUser, body: { code: 'print("owner_run_ok")', id: project.id, lang: 'python' } });
  await codeRunHandler(req8, res8);
  assert.strictEqual(res8.statusCode, 200, 'Owner must be permitted to execute code');
  assert.ok(res8.data.stdout.includes('owner_run_ok'), 'Owner execution should return stdout');
  console.log('✔ Test 8 Passed: /code/run allows Owner code execution');

  // TEST 9: /code/run allows Editor to execute code
  const { req: req9, res: res9 } = mockReqRes({ user: editorUser, body: { code: 'print("editor_run_ok")', id: project.id, lang: 'python' } });
  await codeRunHandler(req9, res9);
  assert.strictEqual(res9.statusCode, 200, 'Editor must be permitted to execute code');
  assert.ok(res9.data.stdout.includes('editor_run_ok'), 'Editor execution should return stdout');
  console.log('✔ Test 9 Passed: /code/run allows Editor code execution');

  // TEST 10: ShareDB submit middleware blocks unauthenticated write op
  const submitMiddlewareFns = share.middleware.submit;
  assert.ok(submitMiddlewareFns && submitMiddlewareFns.length > 0, 'ShareDB submit middleware must be registered');
  const submitFn = submitMiddlewareFns[0];

  let unauthErr = null;
  await new Promise((resolve) => {
    const context = {
      collection: 'examples',
      id: project.id,
      agent: { user: null }
    };
    submitFn(context, (err) => {
      unauthErr = err;
      resolve();
    });
  });
  assert.ok(unauthErr, 'Unauthenticated submit op must produce an error');
  assert.ok(unauthErr.message.includes('Authentication required'));
  console.log('✔ Test 10 Passed: ShareDB submit middleware rejects unauthenticated write');

  // TEST 11: ShareDB submit middleware blocks Viewer write op
  let viewerErr = null;
  await new Promise((resolve) => {
    const context = {
      collection: 'examples',
      id: project.id,
      agent: { user: viewerUser }
    };
    submitFn(context, (err) => {
      viewerErr = err;
      resolve();
    });
  });
  assert.ok(viewerErr, 'Viewer submit op must produce an error');
  assert.ok(viewerErr.message.includes('Viewers have read-only permissions'));
  console.log('✔ Test 11 Passed: ShareDB submit middleware rejects Viewer write op');

  // TEST 12: ShareDB submit middleware allows Owner write op
  let ownerErr = null;
  await new Promise((resolve) => {
    const context = {
      collection: 'examples',
      id: project.id,
      agent: { user: ownerUser }
    };
    submitFn(context, (err) => {
      ownerErr = err;
      resolve();
    });
  });
  assert.strictEqual(ownerErr, undefined, 'Owner submit op must be authorized');
  console.log('✔ Test 12 Passed: ShareDB submit middleware allows Owner write op');

  // TEST 13: ShareDB submit middleware allows Editor write op
  let editorErr = null;
  await new Promise((resolve) => {
    const context = {
      collection: 'examples',
      id: project.id,
      agent: { user: editorUser }
    };
    submitFn(context, (err) => {
      editorErr = err;
      resolve();
    });
  });
  assert.strictEqual(editorErr, undefined, 'Editor submit op must be authorized');
  console.log('✔ Test 13 Passed: ShareDB submit middleware allows Editor write op');

  // TEST 14: ShareDB readSnapshots middleware authorizes existing document
  const readFns = share.middleware.readSnapshots;
  assert.ok(readFns && readFns.length > 0, 'ShareDB readSnapshots middleware must be registered');
  const readFn = readFns[0];

  let readErr = null;
  await new Promise((resolve) => {
    const context = {
      collection: 'examples',
      snapshots: [{ id: project.id }],
      agent: { user: null }
    };
    readFn(context, (err) => {
      readErr = err;
      resolve();
    });
  });
  assert.strictEqual(readErr, undefined, 'Reading existing project document must be authorized');
  console.log('✔ Test 14 Passed: ShareDB readSnapshots middleware permits read of existing project');

  // TEST 15: ShareDB readSnapshots middleware blocks non-existent document
  let nonExistentReadErr = null;
  await new Promise((resolve) => {
    const context = {
      collection: 'examples',
      snapshots: [{ id: 'completely_invalid_doc_id' }],
      agent: { user: null }
    };
    readFn(context, (err) => {
      nonExistentReadErr = err;
      resolve();
    });
  });
  assert.ok(nonExistentReadErr, 'Reading non-existent document must be rejected');
  console.log('✔ Test 15 Passed: ShareDB readSnapshots middleware rejects non-existent document');

  // TEST 16: Direct-link anonymous room creation via projectsRouter GET /:id
  const directLinkRoomId = `direct_${Date.now()}`;
  const getProjectHandler = projectsRouter.stack.find(s => s.route && s.route.path === '/:id').route.stack[1].handle;
  const { req: req16, res: res16 } = mockReqRes({ params: { id: directLinkRoomId } });
  await getProjectHandler(req16, res16);
  assert.strictEqual(res16.statusCode, 200, 'Direct link anonymous room creation must return 200');
  assert.strictEqual(res16.data.project.owner_id, 'anonymous', 'Direct link room must be owned by anonymous user');
  assert.strictEqual(res16.data.role, 'viewer', 'Unauthenticated guest must receive viewer role');
  console.log('✔ Test 16 Passed: Direct-link room creation succeeds with anonymous owner and viewer role');

  // TEST 17: Authenticated user visits anonymous room and claims ownership
  const { req: req17, res: res17 } = mockReqRes({ params: { id: directLinkRoomId }, user: ownerUser });
  await getProjectHandler(req17, res17);
  assert.strictEqual(res17.statusCode, 200);
  assert.strictEqual(res17.data.project.owner_id, ownerUser.id, 'Authenticated user must claim ownership');
  assert.strictEqual(res17.data.role, 'owner', 'Authenticated user must be assigned owner role');
  console.log('✔ Test 17 Passed: First authenticated visitor claims ownership of direct-link anonymous room');

  console.log('\n============================================================');
  console.log('🎉 ALL 17 COMPREHENSIVE SECURITY & AUTHORIZATION TESTS PASSED!');
  console.log('============================================================\n');
  process.exit(0);
}

runSecurityUnitTests().catch((err) => {
  console.error('❌ Security Unit Test Failure:', err);
  process.exit(1);
});

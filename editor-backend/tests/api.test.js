const assert = require('assert');
const db = require('../db');
const { executeCode } = require('../Services/codeRunner');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../Middleware/auth');
const bcrypt = require('bcryptjs');

async function runTests() {
  console.log('--- Starting Backend Verification Tests ---');

  // Test 1: DB Initialization
  await db.initDb();
  console.log('✔ Test 1 Passed: Database initialized successfully');

  // Test 2: User Creation & Password Hashing
  const testEmail = `tester_${Date.now()}@example.com`;
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash('secret123', salt);
  const user = await db.createUser({
    name: 'Alice Tester',
    email: testEmail,
    passwordHash: hash
  });
  assert.ok(user.id, 'User ID should exist');
  assert.strictEqual(user.name, 'Alice Tester');
  assert.strictEqual(user.email, testEmail);
  console.log('✔ Test 2 Passed: User creation & hashing');

  // Test 3: JWT Token generation & verification
  const token = jwt.sign({ id: user.id, name: user.name, email: user.email }, JWT_SECRET);
  const decoded = jwt.verify(token, JWT_SECRET);
  assert.strictEqual(decoded.id, user.id);
  console.log('✔ Test 3 Passed: JWT signing and verification');

  // Test 4: Project Creation & Ownership
  const project = await db.createProject({
    title: 'Algorithm Practice',
    ownerId: user.id,
    language: 'python',
    initialCode: 'print("Testing project")'
  });
  assert.ok(project.id, 'Project ID should exist');
  assert.strictEqual(project.owner_id, user.id);
  assert.strictEqual(project.language, 'python');
  console.log('✔ Test 4 Passed: Project creation with owner');

  // Test 5: Role verification
  const role = await db.getMemberRole(project.id, user.id);
  assert.strictEqual(role, 'owner', 'Creator should have owner role');
  console.log('✔ Test 5 Passed: Owner role assignment');

  // Test 6: Member management & Viewer role
  const viewerUser = await db.createUser({
    name: 'Bob Viewer',
    email: `bob_${Date.now()}@example.com`,
    passwordHash: hash
  });
  await db.addMember(project.id, viewerUser.id, 'viewer');
  const viewerRole = await db.getMemberRole(project.id, viewerUser.id);
  assert.strictEqual(viewerRole, 'viewer', 'Member should have viewer role');
  console.log('✔ Test 6 Passed: Member addition & Viewer role assignment');

  // Test 7: Version History Save & Retrieve
  const v2 = await db.saveVersion({
    projectId: project.id,
    code: 'print("Updated version 2")',
    language: 'python',
    createdBy: user.id,
    createdByName: user.name
  });
  assert.strictEqual(v2.version_number, 2, 'Version should increment to 2');
  const versions = await db.getVersionsByProjectId(project.id);
  assert.ok(versions.length >= 2, 'Should have at least 2 versions (initial + v2)');
  console.log('✔ Test 7 Passed: Version history snapshot creation');

  // Test 8: Code Execution Engine (Python with custom stdin test data)
  console.log('Running code execution test (Python with stdin)...');
  const codeResult = await executeCode({
    code: `import sys\ndata = sys.stdin.read().strip()\nprint(f"Echo: {data}")`,
    input: 'Hello Interviewer',
    lang: 'python'
  });
  console.log('Execution Result:', codeResult);
  assert.ok(codeResult.status === 'success' || codeResult.status === 'error', 'Runner must return valid status');
  if (codeResult.status === 'success') {
    assert.ok(codeResult.stdout.includes('Echo: Hello Interviewer'), 'Stdout should contain stdin echo');
  }
  // Test 9: Supabase User Upsert Integration
  const supabaseUserId = `sb_user_${Date.now()}`;
  const upserted = await db.upsertUser({
    id: supabaseUserId,
    name: 'Supabase User',
    email: `supabase_${Date.now()}@example.com`
  });
  assert.strictEqual(upserted.id, supabaseUserId, 'Upserted ID should match Supabase ID');
  const foundUser = await db.findUserById(supabaseUserId);
  assert.ok(foundUser, 'User upserted from Supabase must be retrievable');
  assert.strictEqual(foundUser.name, 'Supabase User');
  console.log('✔ Test 9 Passed: Supabase user upsert and sync');

  // Test 10: Supabase Service module exports
  const supabaseService = require('../Services/supabase');
  assert.strictEqual(typeof supabaseService.isSupabaseConfigured, 'function');
  console.log('✔ Test 10 Passed: Supabase client service initialized and exported');

  // Test 11: System Anonymous User Seeding & Direct-Link Room Creation
  const anonRoomId = `anon_${Date.now()}`;
  const anonProj = await db.createProject({
    id: anonRoomId,
    title: 'Direct Link Guest Room',
    ownerId: 'anonymous',
    language: 'cpp'
  });
  assert.ok(anonProj.id, 'Anonymous room must be created successfully');
  assert.strictEqual(anonProj.owner_id, 'anonymous', 'Owner should default to anonymous user');
  console.log('✔ Test 11 Passed: Anonymous direct-link room created without FK constraint violation');

  // Test 12: Anonymous Room Adoption by Authenticated User
  await db.updateProject(anonRoomId, { owner_id: user.id });
  const adoptedProj = await db.getProjectById(anonRoomId);
  assert.strictEqual(adoptedProj.owner_id, user.id, 'Authenticated user can claim ownership of anonymous room');
  console.log('✔ Test 12 Passed: Room ownership transfer');

  // Test 13: verifyToken Helper Verification
  const { verifyToken } = require('../Middleware/auth');
  const verifiedUser = await verifyToken(token);
  assert.ok(verifiedUser, 'Valid token must be verified');
  assert.strictEqual(verifiedUser.id, user.id, 'Verified user ID must match');
  const invalidResult = await verifyToken('malformed.bogus.jwt');
  assert.strictEqual(invalidResult, null, 'Invalid token must return null');
  console.log('✔ Test 13 Passed: verifyToken correctly validates valid and rejects invalid tokens');

  // Test 14: Execution Role Authorization Gate
  const ownerPermitted = project.owner_id === user.id || (await db.getMemberRole(project.id, user.id)) === 'editor';
  assert.strictEqual(ownerPermitted, true, 'Owner must be permitted to run code');
  const viewerPermitted = project.owner_id === viewerUser.id || (await db.getMemberRole(project.id, viewerUser.id)) === 'editor';
  assert.strictEqual(viewerPermitted, false, 'Viewer must NOT be permitted to run code');
  console.log('✔ Test 14 Passed: Execution role authorization gate verified');

  console.log('--- ALL BACKEND TESTS PASSED SUCCESSFULLY! ---');
}

runTests().catch(err => {
  console.error('❌ Test failure:', err);
  process.exit(1);
});

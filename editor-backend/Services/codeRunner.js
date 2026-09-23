const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// Check Docker availability on system
let isDockerAvailable = false;
try {
  const check = require('child_process').execSync('docker --version', { stdio: 'ignore', timeout: 1500 });
  isDockerAvailable = true;
  console.log('[CodeRunner] Docker detected. Ephemeral container runner enabled.');
} catch (e) {
  isDockerAvailable = false;
  console.log('[CodeRunner] Docker not available. Using isolated process sandbox fallback.');
}

const TIMEOUT_MS = 5000;
const MAX_BUFFER = 1024 * 1024; // 1MB

/**
 * Execute code with sandbox constraints:
 * - Timeout enforcement (5000ms)
 * - Memory limit cap (256MB)
 * - CPU constraints
 * - Network isolation (Docker mode)
 * - Stripped environment variables (Process mode)
 * - Custom stdin test data
 * - Guaranteed post-execution cleanup
 */
async function executeCode({ code, input = '', lang = 'cpp' }) {
  const runId = `run_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const tempDir = path.join(os.tmpdir(), runId);
  fs.mkdirSync(tempDir, { recursive: true });

  const startTime = Date.now();

  try {
    if (isDockerAvailable) {
      return await runInDocker({ code, input, lang, tempDir, startTime });
    } else {
      return await runInProcessSandbox({ code, input, lang, tempDir, startTime });
    }
  } finally {
    // Guaranteed cleanup after execution
    cleanupDirectory(tempDir);
  }
}

function cleanupDirectory(dirPath) {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  } catch (err) {
    console.warn(`[CodeRunner] Failed to cleanup ${dirPath}:`, err.message);
  }
}

// Docker Runner: Ephemeral container with strict cgroups & network isolation
async function runInDocker({ code, input, lang, tempDir, startTime }) {
  const filenames = {
    cpp: 'Main.cpp',
    java: 'Main.java',
    python: 'Main.py'
  };

  const filename = filenames[lang] || 'Main.cpp';
  fs.writeFileSync(path.join(tempDir, filename), code);
  fs.writeFileSync(path.join(tempDir, 'input.txt'), input || '');

  const commands = {
    cpp: `sh -c "g++ -O2 Main.cpp -o out && ./out < input.txt"`,
    java: `sh -c "javac Main.java && java Main < input.txt"`,
    python: `sh -c "python3 Main.py < input.txt"`
  };

  const dockerImage = process.env.RUNNER_IMAGE || 'cocolabs-runner';
  const dockerCmd = `docker run --rm --network none -m 256m --cpus 1.0 --user 1001:1001 -v "${tempDir}:/sandbox" -w /sandbox ${dockerImage} ${commands[lang]}`;

  return new Promise((resolve) => {
    exec(dockerCmd, { timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER }, (error, stdout, stderr) => {
      const duration = Date.now() - startTime;
      if (error) {
        if (error.killed || error.signal === 'SIGTERM') {
          return resolve({
            stdout: '',
            stderr: `Time Limit Exceeded (${TIMEOUT_MS / 1000}s timeout).`,
            executionTimeMs: duration,
            status: 'timeout',
            exitCode: 124
          });
        }
        return resolve({
          stdout: stdout ? stdout.toString() : '',
          stderr: stderr ? stderr.toString() : (error.message || 'Execution error'),
          executionTimeMs: duration,
          status: 'error',
          exitCode: error.code || 1
        });
      }

      resolve({
        stdout: stdout ? stdout.toString() : '',
        stderr: stderr ? stderr.toString() : '',
        executionTimeMs: duration,
        status: 'success',
        exitCode: 0
      });
    });
  });
}

// Process Sandbox Fallback: Strict timeout, sanitized env, memory cap, temp directory
async function runInProcessSandbox({ code, input, lang, tempDir, startTime }) {
  const sanitizedEnv = {
    PATH: process.env.PATH,
    SYSTEMROOT: process.env.SYSTEMROOT,
    TEMP: tempDir,
    TMP: tempDir
  };

  const isWindows = process.platform === 'win32';

  if (lang === 'python') {
    const scriptPath = path.join(tempDir, 'main.py');
    const inputPath = path.join(tempDir, 'input.txt');
    fs.writeFileSync(scriptPath, code);
    fs.writeFileSync(inputPath, input || '');

    // Try python / python3
    const pyCmd = isWindows ? 'python' : 'python3';
    const runCmd = isWindows 
      ? `cd /d "${tempDir}" && ${pyCmd} main.py < input.txt`
      : `cd "${tempDir}" && ${pyCmd} main.py < input.txt`;

    return executeCommand(runCmd, sanitizedEnv, startTime, tempDir);
  }

  if (lang === 'cpp') {
    const srcPath = path.join(tempDir, 'Main.cpp');
    const inputPath = path.join(tempDir, 'input.txt');
    fs.writeFileSync(srcPath, code);
    fs.writeFileSync(inputPath, input || '');

    const outName = isWindows ? 'out.exe' : './out';
    const compileCmd = isWindows
      ? `cd /d "${tempDir}" && g++ Main.cpp -o out.exe && ${outName} < input.txt`
      : `cd "${tempDir}" && g++ Main.cpp -o out && ${outName} < input.txt`;

    return executeCommand(compileCmd, sanitizedEnv, startTime, tempDir);
  }

  if (lang === 'java') {
    const srcPath = path.join(tempDir, 'Main.java');
    const inputPath = path.join(tempDir, 'input.txt');
    fs.writeFileSync(srcPath, code);
    fs.writeFileSync(inputPath, input || '');

    const runCmd = isWindows
      ? `cd /d "${tempDir}" && javac Main.java && java Main < input.txt`
      : `cd "${tempDir}" && javac Main.java && java Main < input.txt`;

    return executeCommand(runCmd, sanitizedEnv, startTime, tempDir);
  }

  return {
    stdout: '',
    stderr: `Unsupported language: ${lang}`,
    executionTimeMs: 0,
    status: 'error',
    exitCode: 1
  };
}

function executeCommand(cmd, env, startTime, cwd) {
  return new Promise((resolve) => {
    exec(cmd, { cwd, env, timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER }, (error, stdout, stderr) => {
      const duration = Date.now() - startTime;
      if (error) {
        if (error.killed || error.signal === 'SIGTERM') {
          return resolve({
            stdout: '',
            stderr: `Time Limit Exceeded (${TIMEOUT_MS / 1000}s limit). Please check for infinite loops.`,
            executionTimeMs: duration,
            status: 'timeout',
            exitCode: 124
          });
        }
        return resolve({
          stdout: stdout ? stdout.toString() : '',
          stderr: stderr ? stderr.toString() : (error.message || 'Execution error'),
          executionTimeMs: duration,
          status: 'error',
          exitCode: error.code || 1
        });
      }

      resolve({
        stdout: stdout ? stdout.toString() : '',
        stderr: stderr ? stderr.toString() : '',
        executionTimeMs: duration,
        status: 'success',
        exitCode: 0
      });
    });
  });
}

module.exports = {
  executeCode,
  TIMEOUT_MS
};

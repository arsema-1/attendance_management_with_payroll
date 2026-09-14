const fs = require('fs');
const { execSync, spawn } = require('child_process');

const PORT = 3500;

// 1. Kill any existing process on port
try {
  execSync(`npx kill-port ${PORT}`, { stdio: 'ignore' });
  console.log(`✓ Killed stale process on port ${PORT}`);
} catch (_) {}

// 2. Delete .next cache (fixes broken styles / stale webpack chunks)
const nextDir = '.next';
if (fs.existsSync(nextDir)) {
  fs.rmSync(nextDir, { recursive: true, force: true });
  console.log('✓ Cleared .next cache');
}

// 3. Start dev server
console.log(`🚀 Starting dev server on http://localhost:${PORT}`);
const child = spawn('npx', ['next', 'dev', '-p', String(PORT)], {
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => process.exit(code));

// Pre-startup cleanup: stop the ports and related processes this demo uses.
// Automatically run from npm's `predev`, so `npm run dev` always means "stop everything → start".
// Targets include port 3000 (= shared with a2a_demo), which is intentionally killed since they can't run at the same time.
import { execSync } from 'node:child_process';

const PORTS = [3000, 5273, 5601, 5602, 5603, 5604, 5605];
// Patterns that target only processes under this project (so we don't affect other projects)
const PATTERNS = ['aibuddy_demo/examples/agents/domain.mjs', 'aibuddy_demo/backend/src/index.js'];

const sh = (cmd) => {
  try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch { return ''; }
};

const pids = new Set();

// 1) Processes LISTENing on the target ports
for (const port of PORTS) {
  const out = sh(`lsof -tiTCP:${port} -sTCP:LISTEN`);
  out.split('\n').filter(Boolean).forEach((p) => pids.add(p.trim()));
}
// 2) Related processes under this project (to catch what the watcher misses)
for (const pat of PATTERNS) {
  const out = sh(`pgrep -f "${pat}"`);
  out.split('\n').filter(Boolean).forEach((p) => pids.add(p.trim()));
}

const self = String(process.pid);
const targets = [...pids].filter((p) => p && p !== self);

if (!targets.length) {
  console.log('[stop] Nothing to stop (clean).');
} else {
  console.log(`[stop] Stopping: PID ${targets.join(', ')}`);
  for (const pid of targets) sh(`kill ${pid}`);
  // Wait a moment, then SIGKILL any survivors
  const wait = Date.now() + 800;
  while (Date.now() < wait) { /* busy wait (synchronous, short) */ }
  for (const pid of targets) {
    if (sh(`ps -p ${pid} -o pid=`)) sh(`kill -9 ${pid}`);
  }
  console.log('[stop] Done.');
}

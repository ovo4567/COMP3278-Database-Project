const { spawn } = require('node:child_process');

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function startDev(workspace) {
  return spawn(npmCommand, ['-w', workspace, 'run', 'dev'], {
    stdio: 'inherit',
    shell: false,
  });
}

const processes = [startDev('server'), startDev('client')];
let shuttingDown = false;

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of processes) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }
}

for (const child of processes) {
  child.on('exit', (code) => {
    if (shuttingDown) return;

    // If either dev server exits unexpectedly, stop both and fail fast.
    shuttingDown = true;
    for (const other of processes) {
      if (other !== child && !other.killed) {
        other.kill('SIGTERM');
      }
    }

    process.exit(code ?? 1);
  });
}

process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});

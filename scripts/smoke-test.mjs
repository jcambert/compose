import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

const projectRoot = process.cwd();
const cliEntrypoint = join(projectRoot, 'dist', 'cli', 'index.js');
const packageMetadata = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf-8'));
const tempRoot = await mkdtemp(join(tmpdir(), 'compose-smoke-'));
const smokeEnvironment = {
  ...process.env,
  COMPOSE_CONFIG_PATH: join(tempRoot, 'config.json'),
};

await assertCliEntrypoint();
runSmokeCommand(['--version'], packageMetadata.version);
runSmokeCommand(['--help']);
runSmokeCommand(['scan', '--help']);
runSmokeCommand(['browse', '--help']);
runSmokeCommand(['workspace', '--help']);
runSmokeCommand(['doctor', '--help']);
runSmokeCommand(['doctor', '--skip-docker']);

async function assertCliEntrypoint() {
  const content = await readFile(cliEntrypoint, 'utf-8');

  if (!content.startsWith('#!/usr/bin/env node')) {
    throw new Error('dist/cli/index.js is missing the Node.js shebang.');
  }
}

function runSmokeCommand(args, expectedOutput) {
  const result = spawnSync(process.execPath, [cliEntrypoint, ...args], {
    cwd: projectRoot,
    env: smokeEnvironment,
    encoding: 'utf-8',
  });

  if (result.status !== 0) {
    throw new Error(
      [
        `Smoke command failed: compose ${args.join(' ')}`,
        `Exit code: ${result.status}`,
        result.stdout,
        result.stderr,
      ].join('\n'),
    );
  }

  if (expectedOutput !== undefined && result.stdout.trim() !== expectedOutput) {
    throw new Error(
      [
        `Smoke command returned unexpected output: compose ${args.join(' ')}`,
        `Expected: ${expectedOutput}`,
        `Actual: ${result.stdout.trim()}`,
      ].join('\n'),
    );
  }
}

import { execFile } from 'node:child_process';
import { log } from 'node:console';
import { access, mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const windows = process.platform === 'win32';
const npmExecutable = windows ? 'npm.cmd' : 'npm';
const root = await mkdtemp(join(tmpdir(), 'compose-installed-smoke-'));
const packRoot = join(root, 'pack');
const installRoot = join(root, 'install');
const stackRoot = join(root, 'workspace with spaces', 'demo');
await mkdir(packRoot, { recursive: true });
await mkdir(stackRoot, { recursive: true });
await writeFile(join(stackRoot, 'compose.yaml'), 'services:\n  api:\n    image: node:22-alpine\n', 'utf8');

const npmOptions = { shell: windows };
const { stdout: packOutput } = await exec(
  npmExecutable,
  ['pack', '--json', '--pack-destination', packRoot],
  { ...npmOptions, cwd: process.cwd() },
);
const packResult = JSON.parse(packOutput);
const tarball = resolve(packRoot, packResult[0].filename);
await exec(npmExecutable, ['install', '--prefix', installRoot, tarball], { ...npmOptions, cwd: root });

const installedPackageRoot = join(installRoot, 'node_modules', '@jc90100', 'compose');
const installedCli = join(installedPackageRoot, 'dist', 'cli', 'index.js');
const installedShim = join(installRoot, 'node_modules', '.bin', windows ? 'compose.cmd' : 'compose');

await access(installedShim);
await access(installedCli);

const version = await exec(process.execPath, [installedCli, '--version'], { cwd: root });
const scan = await exec(process.execPath, [installedCli, 'scan', stackRoot, '--json'], { cwd: root });
const projects = JSON.parse(scan.stdout);

if (!version.stdout.trim().startsWith('0.2.2')) throw new Error(`Unexpected installed version: ${version.stdout}`);
if (projects.length !== 1 || projects[0].services[0] !== 'api') throw new Error(`Installed scan failed: ${scan.stdout}`);
if (basename(projects[0].composeFilePath) !== 'compose.yaml') throw new Error('Installed CLI returned an unexpected Compose path.');

log(`Installed package smoke passed on ${process.platform}: ${version.stdout.trim()}`);

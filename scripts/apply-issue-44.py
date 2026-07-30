from pathlib import Path
import json

files = {
"tests/fixtures/compose/realistic-stack.compose.yaml": '''name: compose-realistic
x-service-defaults: &service-defaults
  restart: unless-stopped
  networks:
    - backend
  labels:
    com.example.managed: "true"
services:
  api:
    <<: *service-defaults
    image: node:22-alpine
    command: ["node", "server.js"]
    ports:
      - "8080:3000"
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://app:secret@db:5432/app
    volumes:
      - ./src:/app/src:ro
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "node", "healthcheck.js"]
      interval: 10s
      timeout: 3s
      retries: 5
    deploy:
      resources:
        limits:
          memory: 512M
    secrets:
      - api_token
    configs:
      - source: app_config
        target: /app/config.json
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: app
      POSTGRES_USER: app
      POSTGRES_PASSWORD: secret
    volumes:
      - database:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app"]
      interval: 5s
      timeout: 3s
      retries: 10
networks:
  backend:
    driver: bridge
volumes:
  database: {}
secrets:
  api_token:
    file: ./secrets/api-token.txt
configs:
  app_config:
    file: ./config/app.json
''',
"tests/integration/compose-editing-real-stack.test.ts": '''import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  commitComposeServiceMutation,
  listComposeServices,
  previewCreateComposeService,
  previewDeleteComposeService,
  previewUpdateComposeService,
} from '../../src/app/compose-editing-service.js';
import { parseComposeDocumentContent } from '../../src/yaml/compose-parser.js';

const fixturePath = resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures/compose/realistic-stack.compose.yaml');

async function copyFixture(lineEnding: '\\n' | '\\r\\n' = '\\n'): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'compose-real-stack-'));
  const composeFilePath = join(root, 'compose.yaml');
  const content = (await readFile(fixturePath, 'utf8')).replace(/\\n/g, lineEnding);
  await writeFile(composeFilePath, content, 'utf8');
  return composeFilePath;
}

describe('realistic Compose editing workflow', () => {
  it.each(['\\n', '\\r\\n'] as const)('preserves advanced sections while updating common fields with %s line endings', async (lineEnding) => {
    const composeFilePath = await copyFixture(lineEnding);
    const preview = await previewUpdateComposeService({
      composeFilePath,
      serviceName: 'api',
      patch: {
        image: 'node:24-alpine',
        ports: ['9090:3000'],
        environment: [
          { name: 'NODE_ENV', value: 'staging' },
          { name: 'DATABASE_URL', value: 'postgres://app:secret@db:5432/app' },
        ],
        volumes: ['./src:/app/src:ro', './logs:/app/logs'],
      },
    });

    expect(preview.warnings).toEqual(expect.arrayContaining([
      'Service key preserved by the guided editor: deploy',
      'Service key preserved by the guided editor: healthcheck',
      'Service key preserved by the guided editor: labels',
      'Service key preserved by the guided editor: networks',
    ]));

    await commitComposeServiceMutation({ preview });
    const saved = await readFile(composeFilePath, 'utf8');
    const document = parseComposeDocumentContent(saved, composeFilePath);
    const api = document.services.api;

    expect(api?.image).toBe('node:24-alpine');
    expect(api?.ports).toEqual(['9090:3000']);
    expect(api?.healthcheck).toBeDefined();
    expect(api?.deploy).toBeDefined();
    expect(api?.labels).toBeDefined();
    expect(api?.networks).toBeDefined();
    expect(api?.secrets).toBeDefined();
    expect(api?.configs).toBeDefined();
    expect(document.networks?.backend).toBeDefined();
    expect(document.volumes?.database).toBeDefined();
    expect(document.secrets?.api_token).toBeDefined();
    expect(document.configs?.app_config).toBeDefined();
  });

  it('supports create and delete against a realistic stack without touching unrelated services', async () => {
    const composeFilePath = await copyFixture();
    const createPreview = await previewCreateComposeService({
      composeFilePath,
      service: {
        name: 'worker',
        image: 'node:22-alpine',
        command: ['node', 'worker.js'],
        dependsOn: ['db'],
        environment: [{ name: 'QUEUE', value: 'default' }],
        restart: 'on-failure',
      },
    });

    await commitComposeServiceMutation({ preview: createPreview });
    const listed = await listComposeServices({ composeFilePath });
    expect(listed.services.map((service) => service.name)).toEqual(['api', 'db', 'worker']);

    const deletePreview = await previewDeleteComposeService({ composeFilePath, serviceName: 'worker' });
    await commitComposeServiceMutation({ preview: deletePreview });

    const saved = parseComposeDocumentContent(await readFile(composeFilePath, 'utf8'), composeFilePath);
    expect(saved.services.worker).toBeUndefined();
    expect(saved.services.api?.healthcheck).toBeDefined();
    expect(saved.services.db?.image).toBe('postgres:17-alpine');
  });

  it('rejects an obsolete preview after an external Windows-style rewrite', async () => {
    const composeFilePath = await copyFixture();
    const preview = await previewUpdateComposeService({
      composeFilePath,
      serviceName: 'api',
      patch: { image: 'node:24-alpine' },
    });
    const current = await readFile(composeFilePath, 'utf8');
    await writeFile(composeFilePath, current.replace(/\\n/g, '\\r\\n').replace('postgres:17-alpine', 'postgres:16-alpine'), 'utf8');

    await expect(commitComposeServiceMutation({ preview })).rejects.toThrow('Compose file changed since preview was generated');
  });
});
''',
"scripts/installed-package-smoke.mjs": '''import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), 'compose-installed-smoke-'));
const packRoot = join(root, 'pack');
const installRoot = join(root, 'install');
const stackRoot = join(root, 'workspace with spaces', 'demo');
await mkdir(packRoot, { recursive: true });
await mkdir(stackRoot, { recursive: true });
await writeFile(join(stackRoot, 'compose.yaml'), 'services:\n  api:\n    image: node:22-alpine\n', 'utf8');

const { stdout: packOutput } = await exec('npm', ['pack', '--json', '--pack-destination', packRoot], { cwd: process.cwd() });
const packResult = JSON.parse(packOutput);
const tarball = resolve(packRoot, packResult[0].filename);
await exec('npm', ['install', '--prefix', installRoot, tarball], { cwd: root });

const binary = process.platform === 'win32'
  ? join(installRoot, 'node_modules', '.bin', 'compose.cmd')
  : join(installRoot, 'node_modules', '.bin', 'compose');

const version = await exec(binary, ['--version'], { cwd: root });
const scan = await exec(binary, ['scan', stackRoot, '--json'], { cwd: root });
const projects = JSON.parse(scan.stdout);

if (!version.stdout.trim().startsWith('0.2.2')) throw new Error(`Unexpected installed version: ${version.stdout}`);
if (projects.length !== 1 || projects[0].services[0] !== 'api') throw new Error(`Installed scan failed: ${scan.stdout}`);
if (basename(projects[0].composeFilePath) !== 'compose.yaml') throw new Error('Installed CLI returned an unexpected Compose path.');

console.log(`Installed package smoke passed on ${process.platform}: ${version.stdout.trim()}`);
''',
".github/workflows/windows-integration.yml": '''name: Windows integration

on:
  pull_request:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read

jobs:
  installed-package:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v6
        with:
          node-version: 22.x
          cache: npm
      - run: npm ci
      - run: npm run validate
      - run: npm run test:installed
''',
"docs/windows-real-stack-validation.md": '''# Windows and real-stack validation

This validation closes the hardening gap after guided Compose service editing was exposed in the local UI.

## Automated coverage

- The normal CI validates Node.js 20 and 22 on Linux.
- `Windows integration` validates the full project on `windows-latest` with Node.js 22.
- The installed-package smoke test builds an npm tarball, installs it into an isolated prefix and invokes the installed `compose` binary.
- The smoke workspace deliberately contains spaces in its Windows-compatible path.
- Realistic Compose fixtures cover anchors, extension fields, health checks, labels, networks, deploy settings, secrets, configs and named volumes.
- Editing tests cover LF and CRLF source files, create/update/delete workflows and stale-preview rejection.

## Manual Docker acceptance scenario

From a Windows machine with Docker Desktop running:

```powershell
npm install -g @jc90100/compose@latest
compose --version
compose scan C:\Sources --json
compose ui
```

In the browser:

1. Select a stack.
2. Open **Services**.
3. Change the image, ports, environment or volumes of one service.
4. Review the generated YAML diff.
5. Confirm the write.
6. Run `docker compose -f <compose-file> config`.
7. Start the stack with `docker compose -f <compose-file> up -d`.

The editor must preserve advanced keys it does not own and reject the save when the file changed after the preview was generated.
'''
}

for name, content in files.items():
    path = Path(name)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding='utf-8')

package_path = Path('package.json')
package = json.loads(package_path.read_text(encoding='utf-8'))
package['scripts']['test:installed'] = 'npm run build && node scripts/installed-package-smoke.mjs'
package_path.write_text(json.dumps(package, indent=2) + '\n', encoding='utf-8')

backlog = Path('docs/backlog.md')
text = backlog.read_text(encoding='utf-8')
text = text.replace('#42 feat: expose guided service editing in local UI\n#43 test: validate installed CLI and UI editing on Windows with real Docker stacks', '#43 feat: expose guided service editing in local UI (completed)\n#44 test: validate installed CLI and UI editing on Windows with real Docker stacks')
text = text.replace('Complex fixture hardening remains tracked as #43.', 'Windows, installed-package and complex fixture hardening completed in PR #44.')
text += '''\n\n## Completed: Windows and real-stack hardening (#44)\n\nThe installed npm package is now exercised from an isolated prefix on Windows-compatible paths. Realistic fixtures verify guided mutations preserve advanced Compose sections, handle LF and CRLF input, and reject stale previews. A dedicated Windows GitHub Actions workflow runs the complete validation pipeline and installed-package smoke test.\n'''
backlog.write_text(text, encoding='utf-8')

changelog = Path('CHANGELOG.md')
text = changelog.read_text(encoding='utf-8')
marker = '## [Unreleased]'
addition = '''## [Unreleased]\n\n### Added\n\n- Windows CI validation for the full CLI and UI build.\n- Installed npm package smoke testing from an isolated prefix.\n- Realistic Compose editing fixtures covering advanced keys, CRLF files and stale previews.\n'''
if marker in text:
    text = text.replace(marker, addition, 1)
else:
    text = addition + '\n' + text
changelog.write_text(text, encoding='utf-8')

print('Issue #44 implementation applied.')

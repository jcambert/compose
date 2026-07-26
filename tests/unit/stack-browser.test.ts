import { describe, expect, it } from 'vitest';
import type { ComposeExecutionRequest } from '../../src/compose/compose-command.js';
import type { ComposeExecutionResult } from '../../src/compose/compose-executor.js';
import type { PromptAdapter, PromptChoice } from '../../src/guided/guided-command-resolver.js';
import {
  browseComposeStacks,
  createStackBrowserExecutionRequest,
  createStackChoices,
  stackBrowserValues,
} from '../../src/interactive/stack-browser.js';
import type { DiscoveredComposeProject } from '../../src/scanner/discovered-project.js';

function createProject(overrides: Partial<DiscoveredComposeProject> = {}): DiscoveredComposeProject {
  return {
    id: 'stack-1',
    name: 'infra',
    composeFilePath: '/workspace/infra/compose.yaml',
    directoryPath: '/workspace/infra',
    relativePath: 'infra/compose.yaml',
    services: ['api', 'db'],
    warnings: [],
    ...overrides,
  };
}

function createPromptAdapter(selects: string[], confirms: boolean[] = []): PromptAdapter {
  const remainingSelects = [...selects];
  const remainingConfirms = [...confirms];

  return {
    async confirm(): Promise<boolean> {
      return remainingConfirms.shift() ?? false;
    },
    async input(): Promise<string> {
      return '';
    },
    async checkbox(): Promise<string[]> {
      return [];
    },
    async select(question: { choices: PromptChoice[] }): Promise<string> {
      return remainingSelects.shift() ?? question.choices[0]?.value ?? stackBrowserValues.quit;
    },
  };
}

function createExecutionResult(request: ComposeExecutionRequest, exitCode = 0): ComposeExecutionResult {
  return {
    command: `${request.command}:${request.services.join(',')}`,
    exitCode,
    stdout: '',
    stderr: '',
  };
}

describe('stack browser', () => {
  it('creates readable menu stack choices from scan results', () => {
    const choices = createStackChoices([
      createProject(),
      createProject({ id: 'stack-2', name: 'broken', relativePath: 'broken/compose.yaml', services: [], warnings: ['invalid yaml'] }),
    ]);

    expect(choices).toEqual([
      { name: '▣ 1. infra           2 services · ready · infra/compose.yaml', value: 'stack-1' },
      { name: '▣ 2. broken          no services · 1 warning(s) · broken/compose.yaml', value: 'stack-2' },
    ]);
  });

  it('creates Compose execution requests from stack context', () => {
    const request = createStackBrowserExecutionRequest(
      createProject(),
      'up',
      ['api'],
      { dryRun: true, noAnsi: true, projectName: 'demo', profile: ['dev'] },
      { detach: true },
    );

    expect(request).toMatchObject({
      composeFilePath: '/workspace/infra/compose.yaml',
      workingDirectory: '/workspace/infra',
      command: 'up',
      services: ['api'],
      passthroughArgs: [],
      options: {
        dryRun: true,
        noAnsi: true,
        projectName: 'demo',
        profile: ['dev'],
        detach: true,
      },
    });
  });

  it('prints a home menu before choosing a stack', async () => {
    const printedMessages: string[] = [];
    const project = createProject();

    await browseComposeStacks(
      '.',
      {},
      {
        prompts: createPromptAdapter([stackBrowserValues.quit]),
        async scan() {
          return [project];
        },
        print(message) {
          printedMessages.push(message);
        },
      },
    );

    expect(printedMessages[0]).toContain('Compose Browser');
    expect(printedMessages[0]).toContain('Stacks: 1');
    expect(printedMessages[0]).toContain('Navigate with arrows');
  });

  it('executes a stack action selected from the interactive browser', async () => {
    const executedRequests: ComposeExecutionRequest[] = [];
    const project = createProject();

    const result = await browseComposeStacks(
      '.',
      {},
      {
        prompts: createPromptAdapter([project.id, 'ps', stackBrowserValues.back, stackBrowserValues.quit]),
        async scan() {
          return [project];
        },
        async execute(request) {
          executedRequests.push(request);
          return createExecutionResult(request);
        },
      },
    );

    expect(result.executedActions).toBe(1);
    expect(result.failedActions).toBe(0);
    expect(executedRequests).toHaveLength(1);
    expect(executedRequests[0]).toMatchObject({ command: 'ps', services: [] });
  });

  it('executes a service action from the nested service browser', async () => {
    const executedRequests: ComposeExecutionRequest[] = [];
    const project = createProject();

    const result = await browseComposeStacks(
      '.',
      {},
      {
        prompts: createPromptAdapter([
          project.id,
          'services',
          'api',
          'build',
          stackBrowserValues.back,
          stackBrowserValues.back,
          stackBrowserValues.back,
          stackBrowserValues.quit,
        ]),
        async scan() {
          return [project];
        },
        async execute(request) {
          executedRequests.push(request);
          return createExecutionResult(request);
        },
      },
    );

    expect(result.executedActions).toBe(1);
    expect(executedRequests).toHaveLength(1);
    expect(executedRequests[0]).toMatchObject({ command: 'build', services: ['api'] });
  });

  it('does not execute down when the destructive confirmation is rejected', async () => {
    const executedRequests: ComposeExecutionRequest[] = [];
    const project = createProject();

    const result = await browseComposeStacks(
      '.',
      {},
      {
        prompts: createPromptAdapter([project.id, 'down', stackBrowserValues.back, stackBrowserValues.quit], [false]),
        async scan() {
          return [project];
        },
        async execute(request) {
          executedRequests.push(request);
          return createExecutionResult(request);
        },
      },
    );

    expect(result.executedActions).toBe(0);
    expect(executedRequests).toHaveLength(0);
  });

  it('prints dry-run commands instead of executing Docker', async () => {
    const printedMessages: string[] = [];
    const executedRequests: ComposeExecutionRequest[] = [];
    const project = createProject();

    const result = await browseComposeStacks(
      '.',
      { dryRun: true },
      {
        prompts: createPromptAdapter([project.id, 'up', stackBrowserValues.back, stackBrowserValues.quit]),
        async scan() {
          return [project];
        },
        async execute(request) {
          executedRequests.push(request);
          return createExecutionResult(request);
        },
        print(message) {
          printedMessages.push(message);
        },
      },
    );

    expect(result.executedActions).toBe(1);
    expect(executedRequests).toHaveLength(0);
    expect(printedMessages).toContain('Preview: docker compose -f /workspace/infra/compose.yaml up -d');
  });
});

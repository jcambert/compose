import { describe, expect, it } from 'vitest';
import { resolveGuidedCommand, type PromptAdapter, type PromptChoice } from '../../src/guided/guided-command-resolver.js';

type FakePromptAnswers = {
  confirms?: boolean[];
  inputs?: string[];
  checkboxes?: string[][];
  selects?: string[];
};

function createPromptAdapter(answers: FakePromptAnswers): PromptAdapter {
  const confirms = [...(answers.confirms ?? [])];
  const inputs = [...(answers.inputs ?? [])];
  const checkboxes = [...(answers.checkboxes ?? [])];
  const selects = [...(answers.selects ?? [])];

  return {
    async confirm(): Promise<boolean> {
      return confirms.shift() ?? false;
    },
    async input(question: { defaultValue?: string }): Promise<string> {
      return inputs.shift() ?? question.defaultValue ?? '';
    },
    async checkbox(): Promise<string[]> {
      return checkboxes.shift() ?? [];
    },
    async select(question: { choices: PromptChoice[] }): Promise<string> {
      return selects.shift() ?? question.choices[0]?.value ?? '';
    },
  };
}

describe('resolveGuidedCommand', () => {
  it('does not prompt when guided mode is disabled', async () => {
    const result = await resolveGuidedCommand(
      {
        command: 'up',
        options: {},
        services: ['api'],
        passthroughArgs: [],
        availableServices: ['api'],
      },
      createPromptAdapter({ confirms: [true] }),
    );

    expect(result).toEqual({
      options: {},
      services: ['api'],
      passthroughArgs: [],
    });
  });

  it('asks guided questions for compose up', async () => {
    const result = await resolveGuidedCommand(
      {
        command: 'up',
        options: { guided: true },
        services: [],
        passthroughArgs: [],
        availableServices: ['api'],
      },
      createPromptAdapter({
        confirms: [true, false, true],
        inputs: ['api=2,worker=1'],
      }),
    );

    expect(result.options.detach).toBe(true);
    expect(result.options.build).toBe(false);
    expect(result.options.removeOrphans).toBe(true);
    expect(result.options.scale).toEqual(['api=2', 'worker=1']);
  });

  it('applies safe defaults without prompting when guided yes mode is enabled', async () => {
    const result = await resolveGuidedCommand(
      {
        command: 'down',
        options: { guided: true, yes: true },
        services: [],
        passthroughArgs: [],
        availableServices: ['api'],
      },
      createPromptAdapter({ confirms: [true] }),
    );

    expect(result.options.removeOrphans).toBe(false);
    expect(result.options.volumes).toBe(false);
  });

  it('rejects guided mode when interactivity is disabled', async () => {
    await expect(
      resolveGuidedCommand(
        {
          command: 'up',
          options: { guided: true, interactive: false },
          services: [],
          passthroughArgs: [],
          availableServices: [],
        },
        createPromptAdapter({}),
      ),
    ).rejects.toThrow('Guided mode cannot run when --no-interactive is set.');
  });

  it('prompts for exec service and command when they are missing', async () => {
    const result = await resolveGuidedCommand(
      {
        command: 'exec',
        options: { guided: true },
        services: [],
        passthroughArgs: [],
        availableServices: ['api', 'db'],
      },
      createPromptAdapter({
        selects: ['api'],
        inputs: ['npm test', '', '', ''],
      }),
    );

    expect(result.services).toEqual(['api']);
    expect(result.passthroughArgs).toEqual(['npm', 'test']);
    expect(result.options.env).toBeUndefined();
    expect(result.options.user).toBeUndefined();
    expect(result.options.workdir).toBeUndefined();
  });

  it('prompts for required service as text when the compose file cannot provide service names', async () => {
    const result = await resolveGuidedCommand(
      {
        command: 'run',
        options: { guided: true },
        services: [],
        passthroughArgs: [],
        availableServices: [],
      },
      createPromptAdapter({
        inputs: ['worker', 'npm run migrate'],
        confirms: [true],
      }),
    );

    expect(result.services).toEqual(['worker']);
    expect(result.passthroughArgs).toEqual(['npm', 'run', 'migrate']);
    expect(result.options.rm).toBe(true);
  });

  it('supports optional service selection for logs', async () => {
    const result = await resolveGuidedCommand(
      {
        command: 'logs',
        options: { guided: true },
        services: [],
        passthroughArgs: [],
        availableServices: ['api', 'worker'],
      },
      createPromptAdapter({
        checkboxes: [['api']],
        confirms: [true],
        inputs: ['100'],
      }),
    );

    expect(result.services).toEqual(['api']);
    expect(result.options.follow).toBe(true);
    expect(result.options.tail).toBe('100');
  });
});

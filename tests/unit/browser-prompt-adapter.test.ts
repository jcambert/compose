import { describe, expect, it } from 'vitest';
import type { PromptAdapter, PromptChoice } from '../../src/guided/guided-command-resolver.js';
import {
  createBrowserPromptAdapter,
  filterStackChoices,
  sortStackChoices,
} from '../../src/cli/browser-prompt-adapter.js';

function createBasePromptAdapter(capturedSelects: Array<{ message: string; choices: PromptChoice[] }>): PromptAdapter {
  return {
    async confirm(): Promise<boolean> {
      return false;
    },
    async input(): Promise<string> {
      return '';
    },
    async checkbox(): Promise<string[]> {
      return [];
    },
    async select(question: { message: string; choices: PromptChoice[] }): Promise<string> {
      capturedSelects.push(question);
      return question.choices[0]?.value ?? '__quit__';
    },
  };
}

const stackChoices: PromptChoice[] = [
  { name: '○ 1. worker          1 service · 0 running · 1 stopped · workers/compose.yaml', value: 'worker' },
  { name: '★ 2. infra           3 services · 3 running · 0 stopped · infra/compose.yaml', value: 'infra' },
  { name: '● 3. api             2 services · 2 running · 0 stopped · apps/api/compose.yaml', value: 'api' },
  { name: '↻ Refresh            rafraîchir les statuts runtime', value: '__refresh__' },
  { name: '✕ Quit               fermer le browser', value: '__quit__' },
];

describe('browser prompt adapter', () => {
  it('filters only stack choices and keeps control choices available', async () => {
    const capturedSelects: Array<{ message: string; choices: PromptChoice[] }> = [];
    const adapter = createBrowserPromptAdapter(createBasePromptAdapter(capturedSelects), { filter: 'api' });

    await adapter.select({ message: 'Select a stack', choices: stackChoices });

    expect(capturedSelects[0]?.message).toContain('1/3 stacks');
    expect(capturedSelects[0]?.choices.map((choice) => choice.value)).toEqual(['api', '__refresh__', '__quit__']);
  });

  it('sorts stack choices while keeping favorites first', () => {
    expect(sortStackChoices(stackChoices.slice(0, 3), 'path').map((choice) => choice.value)).toEqual(['infra', 'api', 'worker']);
    expect(sortStackChoices(stackChoices.slice(0, 3), 'services').map((choice) => choice.value)).toEqual(['infra', 'api', 'worker']);
    expect(sortStackChoices(stackChoices.slice(0, 3), 'runtime').map((choice) => choice.value)).toEqual(['infra', 'api', 'worker']);
  });

  it('filters by rendered stack text', () => {
    expect(filterStackChoices(stackChoices.slice(0, 3), 'workers').map((choice) => choice.value)).toEqual(['worker']);
    expect(filterStackChoices(stackChoices.slice(0, 3), '3 running').map((choice) => choice.value)).toEqual(['infra']);
  });

  it('does not alter non-stack selections', async () => {
    const capturedSelects: Array<{ message: string; choices: PromptChoice[] }> = [];
    const adapter = createBrowserPromptAdapter(createBasePromptAdapter(capturedSelects), { filter: 'api', sort: 'runtime' });
    const choices = [{ name: 'ps', value: 'ps' }];

    await adapter.select({ message: 'Choose an action', choices });

    expect(capturedSelects[0]).toEqual({ message: 'Choose an action', choices });
  });
});

import type { PromptAdapter, PromptChoice } from '../guided/guided-command-resolver.js';

export type BrowserPromptSortMode = 'name' | 'path' | 'services' | 'runtime';

export type BrowserPromptOptions = {
  filter?: string;
  sort?: BrowserPromptSortMode;
};

export function createBrowserPromptAdapter(baseAdapter: PromptAdapter, options: BrowserPromptOptions): PromptAdapter {
  return {
    confirm: (question) => baseAdapter.confirm(question),
    input: (question) => baseAdapter.input(question),
    checkbox: (question) => baseAdapter.checkbox(question),
    async select(question) {
      if (question.message !== 'Select a stack') {
        return baseAdapter.select(question);
      }

      return baseAdapter.select(createStackSelectionQuestion(question, options));
    },
  };
}

function createStackSelectionQuestion(question: { message: string; choices: PromptChoice[] }, options: BrowserPromptOptions): { message: string; choices: PromptChoice[] } {
  const filter = options.filter?.trim() ?? '';
  const sortMode = options.sort ?? 'name';
  const stackChoices = question.choices.filter((choice) => !isControlChoice(choice));
  const controlChoices = question.choices.filter(isControlChoice);
  const filteredStackChoices = filterStackChoices(stackChoices, filter);
  const sortedStackChoices = sortStackChoices(filteredStackChoices, sortMode);

  return {
    message: createStackSelectionMessage(question.message, stackChoices.length, sortedStackChoices.length, filter, sortMode),
    choices: [...sortedStackChoices, ...controlChoices],
  };
}

export function filterStackChoices(choices: PromptChoice[], filter: string | undefined): PromptChoice[] {
  const search = normalizeSearchValue(filter ?? '');

  if (search.length === 0) {
    return choices;
  }

  return choices.filter((choice) => normalizeSearchValue(`${choice.name} ${choice.value}`).includes(search));
}

export function sortStackChoices(choices: PromptChoice[], sortMode: BrowserPromptSortMode = 'name'): PromptChoice[] {
  return [...choices].sort((left, right) => {
    const favoriteCompare = Number(isFavoriteChoice(right)) - Number(isFavoriteChoice(left));

    if (favoriteCompare !== 0) {
      return favoriteCompare;
    }

    return compareBySortMode(left, right, sortMode) || left.name.localeCompare(right.name);
  });
}

function compareBySortMode(left: PromptChoice, right: PromptChoice, sortMode: BrowserPromptSortMode): number {
  if (sortMode === 'path') {
    return extractRelativePath(left).localeCompare(extractRelativePath(right));
  }

  if (sortMode === 'services') {
    return extractServiceCount(right) - extractServiceCount(left);
  }

  if (sortMode === 'runtime') {
    return extractRuntimeRank(left) - extractRuntimeRank(right);
  }

  return extractStackName(left).localeCompare(extractStackName(right));
}

function createStackSelectionMessage(message: string, totalCount: number, visibleCount: number, filter: string, sortMode: BrowserPromptSortMode): string {
  const filterLabel = filter.length === 0 ? 'no filter' : `filter: ${filter}`;
  const countLabel = visibleCount === totalCount ? `${totalCount} stacks` : `${visibleCount}/${totalCount} stacks`;
  return `${message} (${countLabel}, ${filterLabel}, sort: ${sortMode})`;
}

function isControlChoice(choice: PromptChoice): boolean {
  return choice.value.startsWith('__');
}

function isFavoriteChoice(choice: PromptChoice): boolean {
  return choice.name.trimStart().startsWith('★');
}

function extractStackName(choice: PromptChoice): string {
  const withoutIcon = choice.name.replace(/^\S+\s+/, '');
  const match = /^\d+\.\s+(?<name>.*?)(?:\s{2,}|$)/.exec(withoutIcon);
  return match?.groups?.name?.trim() ?? choice.name;
}

function extractRelativePath(choice: PromptChoice): string {
  return choice.name.split(' · ').at(-1)?.trim() ?? choice.name;
}

function extractServiceCount(choice: PromptChoice): number {
  if (choice.name.includes('no services')) {
    return 0;
  }

  const match = /(?<count>\d+) services?/.exec(choice.name);
  return match?.groups?.count === undefined ? 0 : Number.parseInt(match.groups.count, 10);
}

function extractRuntimeRank(choice: PromptChoice): number {
  const icon = choice.name.trimStart().charAt(0);
  const ranks: Record<string, number> = {
    '●': 0,
    '◐': 1,
    '○': 2,
    '◇': 3,
    '?': 4,
  };

  return ranks[icon] ?? 4;
}

function normalizeSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase();
}

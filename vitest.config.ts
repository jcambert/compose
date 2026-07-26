import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/{scanner,compose,project,yaml,utils}/**/*.ts'],
      exclude: [
        'src/cli/**',
        'src/compose/compose-command.ts',
        'src/compose/compose-options.ts',
        'src/project/compose-project.ts',
        'src/scanner/discovered-project.ts',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});

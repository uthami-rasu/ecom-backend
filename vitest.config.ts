import { defineConfig } from 'vitest/config';

/** Unit tests: fast, no database. */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    env: { NODE_ENV: 'test' },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/main.ts',
        'src/database/migrations/**',
        'src/database/seeds/run-seed.ts',
        'src/database/data-source.ts',
        'src/**/*.module.ts',
      ],
      reporter: ['text-summary', 'text', 'html', 'json-summary'],
    },
  },
});

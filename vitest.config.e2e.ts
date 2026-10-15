import { defineConfig } from 'vitest/config';

/** End-to-end tests: real HTTP pipeline against the ecom_test Postgres database. */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    env: { NODE_ENV: 'test' },
    globalSetup: ['test/global-setup.ts'],
    // Suites share one database, so run files one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/main.ts', 'src/database/migrations/**', 'src/database/seeds/run-seed.ts', 'src/database/data-source.ts'],
      reporter: ['text-summary', 'text', 'json-summary'],
    },
  },
});

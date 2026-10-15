import { defineConfig, mergeConfig } from 'vitest/config';
import e2e from './vitest.config.e2e.js';

/** Unit + e2e in one run, for a combined coverage report. */
export default mergeConfig(
  e2e,
  defineConfig({
    test: {
      include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
      coverage: { reportsDirectory: './coverage', reporter: ['text-summary', 'text', 'html', 'json-summary'] },
    },
  }),
);

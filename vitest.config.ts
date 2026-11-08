import { defineConfig } from 'vitest/config';

// Unit tests live next to the code. The black-box API tests in test/ use node:test instead.
// Browser modules (packages/web, *.test.mjs) run in jsdom: they opt in with a
// `// @vitest-environment jsdom` comment. What needs real rendering is tested in headless Chrome
// (test/browser/).
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'packages/web/src/**/*.test.mjs', 'apps/*/src/**/*.test.ts'],
    // node:sqlite prints an experimental-feature warning on first use.
    execArgv: ['--disable-warning=ExperimentalWarning']
  }
});

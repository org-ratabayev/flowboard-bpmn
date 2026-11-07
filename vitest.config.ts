import { defineConfig } from 'vitest/config';

// Unit tests live next to the code. The black-box API tests in test/ use node:test instead.
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts']
  }
});

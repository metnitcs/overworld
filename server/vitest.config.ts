import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['./vitest.setup.ts'],
    passWithNoTests: true,
    // Integration tests share the dev Postgres DB; running test files in
    // parallel workers races on `test_*` user cleanup. Force sequential.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
})

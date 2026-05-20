import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['./vitest.setup.ts'],
    passWithNoTests: true,
    // Endpoint tests share a Prisma client + open server instance, so run them
    // sequentially within a file to avoid cleanup races.
    sequence: { concurrent: false },
  },
})

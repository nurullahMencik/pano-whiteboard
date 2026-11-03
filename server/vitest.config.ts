import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Integration tests bind the real server to one fixed port, so files run one at a time.
    fileParallelism: false,
    testTimeout: 15_000,
  },
})

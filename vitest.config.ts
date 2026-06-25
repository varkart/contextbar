import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/vitest.setup.ts'],
    exclude: ['e2e/**', 'node_modules/**', '.claude/**'],
    pool: 'threads',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/vitest.setup.ts',
        'src/instrument.ts',
        'src/**/__mocks__/**',
      ],
      thresholds: {
        lines: 78,
        functions: 74,
        branches: 77,
        statements: 75,
      },
    },
  },
})

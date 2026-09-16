import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      'supabase/functions/**/*.test.ts',
      // Operator tooling lives outside src/ so treasury code never reaches the
      // client bundle, but its pure helpers still need testing.
      'scripts/**/*.test.ts',
    ],
  },
})

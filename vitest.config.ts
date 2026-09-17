import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // The edge functions run on Deno and import noble with `npm:` specifiers.
      // Point them at the local install so the shared auth code can be tested
      // against the same crypto the deployed function actually runs.
      'npm:@noble/curves@1/ed25519': '@noble/curves/ed25519',
      'npm:@noble/hashes@1/blake2b': '@noble/hashes/blake2b',
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

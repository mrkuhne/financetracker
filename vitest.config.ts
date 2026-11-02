import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { globals: true, environment: 'node', include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'base44/functions/**/*.test.ts'] },
});

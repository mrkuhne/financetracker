import base44 from '@base44/vite-plugin';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [base44(), react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
});

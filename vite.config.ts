import base44 from '@base44/vite-plugin';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    base44(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // registered in src/main.tsx

      includeAssets: ['icons/apple-touch-icon-180.png'],
      // Custom SW (src/sw.ts) for Web Push; it keeps the old generateSW behaviour (precache, SPA fallback, skipWaiting/clientsClaim).
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        // Precache only the built app shell. No runtimeCaching: Base44 API calls must always hit the network.
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
      },
      manifest: {
        name: 'Finance Tracker',
        short_name: 'Finance',
        description: 'Personal finance tracker',
        display: 'standalone',
        start_url: '/',
        background_color: '#F8F5F9',
        theme_color: '#F8F5F9',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  resolve: { alias: { '@': path.resolve(__dirname, 'src'), '@shared': path.resolve(__dirname, 'base44/shared') } },
});

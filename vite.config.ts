import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Threescope',
        short_name: 'Threescope',
        description: 'Three.js satellite tracker - TLEscope port',
        theme_color: '#101010',
        background_color: '#101010',
        display: 'standalone',
        icons: [
          { src: '/textures/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/textures/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/textures/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/textures/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,jpg,ttf}'],
        maximumFileSizeToCacheInBytes: 25 * 1024 * 1024, // 25 MB for large textures
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/celestrak\.org\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'tle-data-cache',
              expiration: { maxAgeSeconds: 86400 }
            }
          }
        ]
      }
    })
  ]
});

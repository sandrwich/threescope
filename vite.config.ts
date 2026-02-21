import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
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
          { src: '/textures/sat_icon.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,jpg}'],
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

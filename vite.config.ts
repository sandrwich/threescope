import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'child_process';

const host = process.env.TAURI_DEV_HOST;

function git(cmd: string): string {
  try { return execSync(`git ${cmd}`, { encoding: 'utf-8' }).trim(); }
  catch { return ''; }
}

const commitHash = git('rev-parse --short HEAD');
const commitDate = git('log -1 --format=%ci');

function buttplugWasmPlugin() {
  const VIRTUAL_ENV = '\0wasm-env';
  const VIRTUAL_WS = '\0stub-ws';
  return {
    name: 'buttplug-wasm-stubs',
    resolveId(id: string) {
      if (id === 'env') return VIRTUAL_ENV;
      if (id === 'ws') return VIRTUAL_WS;
    },
    load(id: string) {
      if (id === VIRTUAL_ENV) return 'export function now() { return performance.now(); }';
      if (id === VIRTUAL_WS) return 'export const WebSocket = globalThis.WebSocket;';
    },
  };
}

export default defineConfig({
  clearScreen: false,
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash),
    __COMMIT_DATE__: JSON.stringify(commitDate),
    __FORCED_TEXTURE_QUALITY__: JSON.stringify(process.env.VITE_TEXTURE_QUALITY || ''),
    __DATA_MIRROR__: JSON.stringify(process.env.VITE_DATA_MIRROR || ''),
    __CELESTRAK_BASE__: JSON.stringify(process.env.VITE_CELESTRAK_BASE || ''),
    __SATNOGS_BASE__: JSON.stringify(process.env.VITE_SATNOGS_BASE || ''),
    __TLE_CACHE_MAX_AGE_H__: JSON.stringify(Number(process.env.VITE_TLE_CACHE_MAX_AGE_H) || 1),
    __TLE_CACHE_EVICT_AGE_H__: JSON.stringify(Number(process.env.VITE_TLE_CACHE_EVICT_AGE_H) || 24),
    __FEEDBACK_TOYS__: JSON.stringify(process.env.VITE_FEEDBACK_TOYS !== 'false'),
  },
  optimizeDeps: {
    exclude: ['@satvisorcom/buttplug-wasm'],
    include: ['eventemitter3'],
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  plugins: [
    {
      name: 'html-texture-quality',
      transformIndexHtml(html) {
        return html.replace(/%VITE_TEXTURE_QUALITY%/g, process.env.VITE_TEXTURE_QUALITY || '');
      },
    },
    buttplugWasmPlugin(),
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: {
        name: 'Satvisor',
        short_name: 'Satvisor',
        description: 'Real-time 3D/2D satellite tracker with pass predictions, orbit visualization, and Doppler analysis. Works on desktop and mobile.',
        theme_color: '#101010',
        background_color: '#101010',
        display: 'standalone',
        icons: [
          { src: '/textures/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/textures/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/textures/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/textures/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,png,jpg,ttf,json}'],
        globIgnores: [
          '**/textures/icons/**',
          '**/buttplug_wasm*',
          // In lite mode, don't precache full-size country grid
          ...(process.env.VITE_TEXTURE_QUALITY === 'lite' ? ['**/countries-110m.json'] : ['**/countries-110m.lite.json']),
          // Never precache elevation.bin (18MB, loaded lazily and skipped in lite)
          '**/elevation.bin',
        ],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // Don't auto-create a NavigationRoute that serves precached index.html
        // — we add our own NetworkFirst navigation rule below
        navigationPreload: true,
        navigateFallbackDenylist: [/./],
        runtimeCaching: [
          {
            // Navigation requests: always try network first so deploys are picked up immediately.
            // Falls back to cache when offline (3s timeout).
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages-cache',
              networkTimeoutSeconds: 3,
            }
          },
          {
            urlPattern: process.env.VITE_CELESTRAK_BASE
              ? new RegExp(`^${process.env.VITE_CELESTRAK_BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
              : /^https:\/\/celestrak\.org\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'tle-data-cache',
              expiration: { maxAgeSeconds: 86400 }
            }
          },
          {
            urlPattern: /\/data\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'data-cache',
            }
          },
          {
            urlPattern: /\/textures\/.*\.webp$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'texture-cache',
              expiration: { maxEntries: 60 }
            }
          }
        ]
      }
    })
  ]
});

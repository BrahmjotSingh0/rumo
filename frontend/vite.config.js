import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Manifest/icons here are the build-time defaults ("Rumo") - branding.json
    // and the admin panel still restyle the live app without a rebuild as
    // documented, but the name/icon shown for an *installed* PWA is baked in
    // at build time like any other manifest, so a self-hoster who wants their
    // own name on the home-screen icon needs to edit this file and rebuild.
    // No runtimeCaching entries below is deliberate: without one, Workbox
    // only precaches the built app shell and leaves every other request
    // (the API, /uploads, and Socket.IO's polling fallback) untouched -
    // network-only, never served stale from cache.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['brand/icon.svg', 'brand/logo.svg'],
      manifest: {
        name: 'Rumo',
        short_name: 'Rumo',
        description: 'Free, self-hosted video meetings.',
        theme_color: '#2E5BFF',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/brand/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
        ]
      }
    })
  ],
  server: {
    port: 5174
 },
  css: {
    postcss: {
      plugins: [tailwindcss()],
    },
  },
})

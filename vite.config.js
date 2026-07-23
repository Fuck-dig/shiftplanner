import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Makes Rorota installable (Add to Home Screen, standalone window, its
    // own icon) and precaches the built app shell (JS/CSS/HTML/icons) so it
    // still opens instantly — and loads at all — on a flaky connection or
    // fully offline. This does NOT make the underlying data offline-capable:
    // schedules/employees/messages still come from Supabase over the
    // network, so anything that needs a live fetch will still fail without
    // a connection. What offline mode buys you is the shell always opening
    // instead of a blank white screen / network-error page, and reads of
    // whatever data is already in memory from the current session.
    VitePWA({
      registerType: 'autoUpdate', // silently swap in a new service worker on next load, no "update available" prompt to build/wire up
      includeAssets: ['favicon.svg', 'icons.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Rorota — Shift Scheduler',
        short_name: 'Rorota',
        description: 'Rorota — Smart shift scheduling for restaurants. Role-based, hourly, automatic.',
        start_url: '/',
        display: 'standalone',
        background_color: '#F5F0E6',
        theme_color: '#7e14ff',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the app shell only — deliberately no runtime caching of
        // Supabase API calls here, since silently serving stale schedule/
        // employee data while offline would be worse than a clear "you're
        // offline" failure.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
    }),
  ],
})

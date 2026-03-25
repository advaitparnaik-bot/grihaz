import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'Grihaz',
        short_name: 'Grihaz',
        description: 'Household Staff & Payroll Manager',
        theme_color: '#E8611A',
        background_color: '#FAF3E8',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
       icons: [
        { src: 'favicon-32x32.png',    sizes: '32x32',   type: 'image/png' },
        { src: 'icon-192.png',          sizes: '192x192', type: 'image/png' },
        { src: 'icon-512.png',          sizes: '512x512', type: 'image/png' },
        { src: 'icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
        { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ]
      }
    })
  ],
}
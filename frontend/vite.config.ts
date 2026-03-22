import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_REPOSITORY ? '/' + process.env.GITHUB_REPOSITORY.split('/')[1] + '/' : '/',
  build: {
    outDir: 'out',
    rollupOptions: {
      output: {
        manualChunks: {
          // Split React runtime into its own chunk (stable, long-cached)
          'vendor-react': ['react', 'react-dom'],
          // React Router separately
          'vendor-router': ['react-router-dom'],
          // Sentry is large – isolate so app chunk stays lean
          'vendor-sentry': ['@sentry/react'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    exclude: ['e2e/**', '**/node_modules/**'],
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_REPOSITORY ? '/' + process.env.GITHUB_REPOSITORY.split('/')[1] + '/' : '/',
  build: {
    outDir: 'out',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    exclude: ['e2e/**', '**/node_modules/**'],
  },
})

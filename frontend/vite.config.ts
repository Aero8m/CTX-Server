import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': process.env.VITE_API_PROXY || 'http://127.0.0.1:5000' },
  },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
  build: {
    rollupOptions: {
      output: { manualChunks: { 'element-plus': ['element-plus'], vue: ['vue', 'pinia', 'vue-router'] } },
    },
  },
})

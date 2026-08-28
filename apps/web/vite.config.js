import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  plugins: [vue()],
  server: { proxy: { '/api': 'http://localhost:3001' } },
  preview: {
    port: 3000,
    host: true,
    proxy: { '/api': 'https://wangmiserver-production.up.railway.app' },
  },
});

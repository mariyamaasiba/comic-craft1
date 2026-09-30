import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': `http://127.0.0.1:${process.env.API_PORT || 3001}`,
    },
  },
});
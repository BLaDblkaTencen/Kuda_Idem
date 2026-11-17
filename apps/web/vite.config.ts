import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Запросы /api уходят на локальный сервер — CORS при разработке не нужен.
    proxy: { '/api': 'http://localhost:3000' },
  },
});

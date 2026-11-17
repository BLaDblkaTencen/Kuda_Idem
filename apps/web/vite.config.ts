import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Адреса туннеля localhost.run (npm run telegram), через которые Telegram открывает приложение.
const allowedHosts = ['.lhr.life', '.localhost.run'];
// Запросы /api уходят на локальный сервер — CORS не нужен. Явный IPv4: на Windows
// «localhost» может означать IPv6 (::1), а API слушает IPv4.
const proxy = { '/api': 'http://127.0.0.1:3000' };

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, allowedHosts, proxy },
  // Готовая сборка для проверки в Telegram (npm run telegram): мало файлов, без горячей перезагрузки.
  preview: { host: '127.0.0.1', port: 4173, strictPort: true, allowedHosts, proxy },
});

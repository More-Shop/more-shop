import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// BASE_PATH lets the same build run at the domain root (Vercel/Netlify)
// or under a sub-path such as GitHub Pages (/more-shop/).
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Two separate pages: the shop app (index.html) and the platform admin site (admin.html).
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        admin: fileURLToPath(new URL('./admin.html', import.meta.url)),
      },
    },
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});

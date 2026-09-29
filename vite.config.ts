import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the build works from any static host (GitHub Pages, Netlify, etc.)
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    // The world map geometry (~240 KB gzipped) is a lazily-loaded chunk on purpose.
    chunkSizeWarningLimit: 800,
  },
});

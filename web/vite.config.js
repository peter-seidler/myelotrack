import { defineConfig } from 'vite';

// Framework-free vanilla app. Root is web/, single entry (index.html).
export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
  },
  server: {
    port: 5173,
    open: false,
  },
});

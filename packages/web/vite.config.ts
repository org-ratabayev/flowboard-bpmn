import path from 'node:path';
import { defineConfig } from 'vite';

// Builds the two pages and everything they import into dist/, which the server serves.
export default defineConfig({
  root: import.meta.dirname,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // bpmn-js with all plugins is one ~1.7 MB editor bundle; that is expected, not a problem to warn about.
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      input: {
        index: path.join(import.meta.dirname, 'index.html'),
        editor: path.join(import.meta.dirname, 'editor.html'),
        login: path.join(import.meta.dirname, 'login.html'),
        settings: path.join(import.meta.dirname, 'settings.html')
      }
    }
  }
});

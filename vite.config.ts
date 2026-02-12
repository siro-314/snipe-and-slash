import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: './index.html'
      },
      // three をバンドルに含めない（A-FrameのグローバルTHREEを使用）
      external: ['three', /^three\//],
      output: {
        globals: {
          three: 'THREE'
        }
      }
    }
  },
  server: {
    port: 8080,
    open: true
  }
});

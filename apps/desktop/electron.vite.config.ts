import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['nanoid'] })],
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
        },
      },
    },
    resolve: {
      alias: {
        '@': resolve('src'),
        '@main': resolve('src/main'),
        '@preload': resolve('src/preload'),
        '@tests': resolve('tests'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@': resolve('src'),
        '@preload': resolve('src/preload'),
        '@main': resolve('src/main'),
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src'),
        '@renderer': resolve('src/renderer'),
        '@preload': resolve('src/preload'),
      },
    },
    plugins: [react()],
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' 使构建产物使用相对路径，适配任意静态托管（Nginx / 对象存储 / 本地静态目录）
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
  server: {
    host: true,
    port: 5173,
  },
});

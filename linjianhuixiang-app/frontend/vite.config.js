import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' 使构建产物使用相对路径，便于 Android WebView 以 file:// 方式加载
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
    // 真实数据模式（VITE_USE_MOCK=false）：把 /api 代理到后端服务
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});

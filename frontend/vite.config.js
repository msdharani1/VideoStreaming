import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const host = process.env.VITE_HOST || '0.0.0.0';
const port = Number(process.env.VITE_PORT) || 5173;
const backendPort = Number(process.env.BACKEND_PORT || process.env.PORT) || 5000;
const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || `http://127.0.0.1:${backendPort}`;
const defaultProxyOptions = {
  target: apiProxyTarget,
  changeOrigin: false,
  secure: false
};

function resolveAllowedHosts() {
  const raw = process.env.VITE_ALLOWED_HOSTS || '';
  if (!raw.trim()) {
    return ['localhost', '127.0.0.1'];
  }

  if (raw.trim() === '*') {
    return true;
  }

  return [...new Set(raw.split(',').map((value) => value.trim()).filter(Boolean))];
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host,
    port,
    strictPort: true,
    allowedHosts: resolveAllowedHosts(),
    proxy: {
      '/api': {
        ...defaultProxyOptions,
        rewrite: (requestPath) => requestPath.replace(/^\/api/, '')
      },
      '/stream': defaultProxyOptions,
      '/normal-stream': defaultProxyOptions,
      '/thumbnail': defaultProxyOptions,
      '/timeline': defaultProxyOptions,
      '/storage': defaultProxyOptions,
      '/health': defaultProxyOptions
    }
  }
});

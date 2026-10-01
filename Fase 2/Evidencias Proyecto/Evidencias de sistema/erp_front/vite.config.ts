import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

/** Normaliza VITE_BASE_PATH → base de Vite (`/` o `/almahue-erp/`). */
function normalizeBasePath(raw?: string): string {
  const value = (raw ?? '').trim();
  if (!value || value === '/') return '/';
  const trimmed = value.replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}/` : '/';
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_DEV_API_PROXY || 'http://localhost:3001';
  const proxySecure = proxyTarget.startsWith('https://');
  const base = normalizeBasePath(env.VITE_BASE_PATH);

  return {
    base,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    server: {
      port: 5174,
      host: true,
      allowedHosts: ['.ngrok-free.app', '.ngrok.io', '.ngrok.app'],
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          secure: proxySecure,
        },
      },
    },
  };
});

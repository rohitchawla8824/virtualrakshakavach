import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const appRoot = fileURLToPath(new URL('.', import.meta.url));
  const env = loadEnv(mode, appRoot, 'VITE_');
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:4000';

  return {
    root: appRoot,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  };
});

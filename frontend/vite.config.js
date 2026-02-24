import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const host = process.env.VITE_HOST || '0.0.0.0';
const port = Number(process.env.VITE_PORT) || 5173;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host,
    port,
    strictPort: true,
    allowedHosts: ["0eeb-2409-40f4-2102-d4e5-cb1d-d431-be92-5498.ngrok-free.app", "[IP_ADDRESS]"]
  }
});

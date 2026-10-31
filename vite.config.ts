import { cloudflare } from '@cloudflare/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// `npm run dev` runs the React app and the Cloudflare Worker (API + local D1) together.
export default defineConfig({
  plugins: [react(), cloudflare()],
});

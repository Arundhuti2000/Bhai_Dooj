import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The 3D game is created once per page. Hot-swapping its code would start a second game
// in the same scene (old items/characters left frozen), so any change reloads the page.
const fullReload = {
  name: 'full-reload',
  handleHotUpdate({ server }) {
    server.ws.send({ type: 'full-reload' });
    return [];
  },
};

// The 3D models live in ./assets (written there by the Blender scripts) and are served as-is.
export default defineConfig({
  plugins: [react(), fullReload],
  publicDir: 'assets',
  base: './',
  server: { open: true },
  build: { chunkSizeWarningLimit: 2000 },
});

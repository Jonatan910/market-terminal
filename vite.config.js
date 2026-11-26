import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' hace que la app funcione en cualquier carpeta,
// por ejemplo en GitHub Pages (https://usuario.github.io/cripto-terminal/).
export default defineConfig({
  plugins: [react()],
  base: './',
});

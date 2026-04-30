import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// IMPORTANT: base must be './' so Electron can load assets via file://
export default defineConfig({
  base: "./",
  plugins: [react()],
  // Pin PostCSS to this folder so Vite doesn't pick up the parent web app's
  // tailwind-based postcss.config.js. The tray UI uses plain CSS.
  css: {
    postcss: "./postcss.config.cjs",
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5180,
  },
});

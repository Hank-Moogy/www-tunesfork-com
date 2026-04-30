import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// IMPORTANT: base must be './' so Electron can load assets via file://
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5180,
  },
});

// Empty PostCSS config — the tray UI uses plain CSS, no Tailwind.
// This file exists so Vite stops walking up the directory tree and
// doesn't try to load the web app's postcss.config.js (which requires tailwindcss).
module.exports = { plugins: [] };

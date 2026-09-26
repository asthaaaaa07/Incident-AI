import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Build output goes to ../public-react so servers.js can serve it without
// colliding with the existing public/ folder. In dev, Vite runs on its own
// port and talks to the Express API directly (CORS is already enabled
// backend-side), configured via VITE_API_BASE_URL in client/.env.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../client-dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
});

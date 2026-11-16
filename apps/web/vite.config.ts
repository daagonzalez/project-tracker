import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // In local development the API runs on its own port; in production one origin serves both.
    proxy: { "/api": process.env.API_PROXY_TARGET ?? "http://localhost:3000" },
  },
});

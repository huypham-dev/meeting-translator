import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import path from "node:path";
import manifest from "./manifest.config";

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: { port: 5173 },
  },
  build: {
    rollupOptions: {
      // crx() only auto-discovers entries referenced directly in manifest.json
      // (popup, background, content scripts). The offscreen document is
      // created at runtime via chrome.offscreen.createDocument() and isn't
      // declared there, so it must be added as an explicit input.
      input: {
        offscreen: path.resolve(__dirname, "src/offscreen/offscreen.html"),
      },
    },
  },
});

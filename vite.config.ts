import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Web dev server proxies /api -> opencode so the browser build avoids CORS during
// development. The native APK talks to the server directly (see src/lib/api.ts).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4096",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
        // dev convenience: inject Basic auth so the browser needs no password.
        // Set VITE_OC_PASSWORD in a .env.local file (never commit it).
        configure: (proxy) => {
          const pw = process.env.VITE_OC_PASSWORD || "";
          if (pw) {
            const auth = "Basic " + Buffer.from("opencode:" + pw).toString("base64");
            proxy.on("proxyReq", (req) => req.setHeader("authorization", auth));
          }
        },
      },
    },
  },
  build: { outDir: "dist" },
});

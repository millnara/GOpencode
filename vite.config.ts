import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const pw = env.VITE_OC_PASSWORD || process.env.VITE_OC_PASSWORD || "";
  const auth = pw ? "Basic " + Buffer.from("opencode:" + pw).toString("base64") : "";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: "http://127.0.0.1:4096",
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ""),
          configure: (proxy) => {
            if (auth) {
              proxy.on("proxyReq", (req) => req.setHeader("authorization", auth));
            }
          },
        },
      },
    },
    build: { outDir: "dist" },
  };
});

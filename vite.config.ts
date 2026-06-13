import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { createHash } from "crypto";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const pw = env.VITE_OC_PASSWORD || process.env.VITE_OC_PASSWORD || "";
  const auth = pw ? "Basic " + Buffer.from("opencode:" + pw).toString("base64") : "";
  const buildHash = createHash("sha256").update(Date.now().toString()).digest("hex").slice(0, 12);

  return {
    plugins: [react()],
    define: { "import.meta.env.VITE_BUILD_HASH": JSON.stringify(buildHash) },
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

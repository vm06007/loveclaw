import { defineConfig } from "vite";

const host = process.env.TAURI_DEV_HOST;

// Proxy both AXL nodes — Alice :9002, Boris :9012
const axlProxy = (port) => ({
  target: `http://127.0.0.1:${port}`,
  rewrite: path => path.replace(new RegExp(`^/axl${port}`), ""),
  changeOrigin: true,
});

export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
    proxy: {
      "/axl9002": axlProxy(9002),
      "/axl9012": axlProxy(9012),
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: "chrome105",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});

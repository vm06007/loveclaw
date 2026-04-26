import { defineConfig } from "vite";
import os from "node:os";

/** Tauri can set this; otherwise bind all interfaces (0.0.0.0) so the phone can use the QR LAN URL. */
const tauriHost = process.env.TAURI_DEV_HOST;
const devServerHost = tauriHost || true;

/**
 * First non-internal IPv4, preferring typical LAN ranges (same idea as loveclaw/signal-relay.py /local-ip).
 * @returns {string | null}
 */
function getLanIPv4() {
    const nets = os.networkInterfaces();
    const addrs = [];
    for (const name of Object.keys(nets)) {
        for (const net of nets[name] || []) {
            const fam = net.family;
            if (fam !== "IPv4" && fam !== 4) continue;
            if (net.internal) continue;
            addrs.push(net.address);
        }
    }
    const prefer = a =>
        a.startsWith("192.168.") ||
        a.startsWith("10.") ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(a);
    const hit = addrs.find(prefer);
    return hit || addrs[0] || null;
}

function localIpPlugin() {
    const handler = (req, res, next) => {
        const path = (req.url || "").split("?")[0];
        if (path !== "/local-ip" || req.method !== "GET") {
            next();
            return;
        }
        const ip = getLanIPv4() || "127.0.0.1";
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.end(JSON.stringify({ ip }));
    };
    return {
        name: "loveclaw-local-ip",
        configureServer(server) {
            server.middlewares.use(handler);
        },
        configurePreviewServer(server) {
            server.middlewares.use(handler);
        },
    };
}

// Proxy both AXL nodes — Alice :9002, Boris :9012
const axlProxy = (port) => ({
  target: `http://127.0.0.1:${port}`,
  rewrite: path => path.replace(new RegExp(`^/axl${port}`), ""),
  changeOrigin: true,
});

export default defineConfig({
  plugins: [localIpPlugin()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: devServerHost,
    hmr: tauriHost
      ? { protocol: "ws", host: tauriHost, port: 1421 }
      : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
    proxy: {
      "/axl9002": axlProxy(9002),
      "/axl9012": axlProxy(9012),
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  preview: {
    port: 1420,
    strictPort: true,
    host: true,
  },
  build: {
    target: "chrome105",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});

import basicSsl from "@vitejs/plugin-basic-ssl";
import { defineConfig } from "vite";
import os from "node:os";

/** Set `LOVECLAW_DEV_HTTPS=1` so phones can use getUserMedia over LAN (https + self-signed). */
const useDevHttps = process.env.LOVECLAW_DEV_HTTPS === "1";

/**
 * Relay is opt-in. Enable with:
 *   npm run dev:alice --relay   (sets npm_config_relay=true)
 *   LOVECLAW_RELAY=1 bun run dev:alice
 */
const relayEnabled = !!(process.env.LOVECLAW_RELAY || process.env.npm_config_relay);

/** Tauri can set this; otherwise bind all interfaces (0.0.0.0) so the phone can use the QR LAN URL. */
const tauriHost = process.env.TAURI_DEV_HOST;
const devServerHost = tauriHost || true;

const parsedDevPort = Number.parseInt(String(process.env.LOVECLAW_DEV_PORT || process.env.PORT || "1420"), 10);
const devPort = Number.isFinite(parsedDevPort) && parsedDevPort > 0 && parsedDevPort < 65536 ? parsedDevPort : 1420;
/**
 * `LOVECLAW_DEV_STRICT_PORT=1`: fail if `devPort` is busy (Tauri `scripts/tauri-dev.sh` sets this by default).
 * Otherwise Vite uses the next free port from `LOVECLAW_DEV_PORT` / 1420 (`bun run dev` without strict).
 */
const strictDevPort = process.env.LOVECLAW_DEV_STRICT_PORT === "1";
const parsedHmrPort = process.env.LOVECLAW_HMR_PORT != null && String(process.env.LOVECLAW_HMR_PORT).trim() !== ""
    ? Number.parseInt(String(process.env.LOVECLAW_HMR_PORT), 10)
    : NaN;
const hmrPort = tauriHost
    ? (Number.isFinite(parsedHmrPort) && parsedHmrPort > 0 ? parsedHmrPort : devPort + 1)
    : undefined;

/** Set by Tauri `beforeDevCommand` / `tauri-dev.sh` — hides Vite banner and HMR `[vite]` spam (dev server only). */
const tauriDevChild = process.env.LOVECLAW_TAURI_DEV === "1";
const viteServeOnly = !process.argv.some(a => a === "build" || a === "preview");

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

/**
 * Bare `/` or `/index.html` without `?pact=` / `?role=` → marketing `public/welcome/index.html` (matches Vercel).
 */
function welcomeRootPlugin() {
    const handler = (req, _res, next) => {
        const u = req.url || "";
        const pathname = u.split("?")[0];
        if (pathname === "/web") {
            const qs = u.includes("?") ? u.slice(u.indexOf("?")) : "";
            req.url = `/web/index.html${qs}`;
            next();
            return;
        }
        if (pathname !== "/" && pathname !== "/index.html") {
            next();
            return;
        }
        const qs = u.includes("?") ? u.slice(u.indexOf("?") + 1) : "";
        const sp = new URLSearchParams(qs);
        if (sp.has("pact") || sp.has("role")) {
            next();
            return;
        }
        req.url = "/welcome/index.html";
        next();
    };
    return {
        name: "loveclaw-welcome-root",
        configureServer(server) {
            server.middlewares.use(handler);
        },
        configurePreviewServer(server) {
            server.middlewares.use(handler);
        },
    };
}

/**
 * `https://loveclaw.app/<tag>` (single path segment) serves the SPA like `/` (matches Vercel rewrites).
 * Browser URL unchanged. Skips /api, /assets, AXL proxies, Vite internals.
 */
function pathInstanceSpaPlugin() {
    const reserved = (p) =>
        p === "/"
        || p.startsWith("/api/")
        || p.startsWith("/assets/")
        || p.startsWith("/welcome/")
        || p === "/welcome"
        || p === "/web"
        || p.startsWith("/web/")
        || p.startsWith("/prototype/")
        || p.startsWith("/@")
        || p.startsWith("/node_modules/")
        || p.startsWith("/src/")
        || p.startsWith("/axl9002")
        || p.startsWith("/axl9012")
        || p.startsWith("/relay")
        || p.startsWith("/uniswap")
        || p === "/local-ip";
    const rewrite = (req, _res, next) => {
        const u = req.url || "";
        const pathname = u.split("?")[0];
        if (reserved(pathname)) {
            next();
            return;
        }
        const m = /^\/([a-zA-Z0-9_-]{1,48})\/?$/.exec(pathname);
        if (m) {
            const qs = u.includes("?") ? u.slice(u.indexOf("?")) : "";
            req.url = `/${qs}`;
        }
        next();
    };
    return {
        name: "loveclaw-path-instance",
        configureServer(server) {
            server.middlewares.use(rewrite);
        },
        configurePreviewServer(server) {
            server.middlewares.use(rewrite);
        },
    };
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
  plugins: [welcomeRootPlugin(), pathInstanceSpaPlugin(), localIpPlugin(), ...(useDevHttps ? [basicSsl()] : [])],
  define: {},
  clearScreen: false,
  logLevel: tauriDevChild && viteServeOnly ? "silent" : "info",
  server: {
    port: devPort,
    strictPort: strictDevPort,
    host: devServerHost,
    /* So https://*.ngrok-free.app (etc.) proxied to this dev server passes Vite’s host check */
    allowedHosts: [".ngrok-free.app", ".ngrok.io", ".ngrok.app", ".ngrok.dev", ".loveclaw.app"],
    hmr: tauriHost && hmrPort != null
      ? { protocol: "ws", host: tauriHost, port: hmrPort }
      : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
    proxy: {
      "/axl9002": axlProxy(9002),
      "/axl9012": axlProxy(9012),
      "/relay": {
        target: "http://127.0.0.1:9090",
        changeOrigin: true,
        rewrite: path => path.replace(/^\/relay/, ""),
        onError(err, _req, res) {
          if (err.code === "ECONNREFUSED") {
            res.writeHead(503, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ relay: "offline" }));
          }
        },
      },
      "/uniswap": {
        target: "https://trade-api.gateway.uniswap.org",
        changeOrigin: true,
        rewrite: path => path.replace(/^\/uniswap/, ""),
        secure: true,
      },
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  preview: {
    port: devPort,
    strictPort: strictDevPort,
    host: true,
  },
  build: {
    target: "chrome105",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});

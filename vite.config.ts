import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";

const host = process.env.TAURI_DEV_HOST;
const isBuild = process.env.npm_lifecycle_event === "build";

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [
    react(),
    tailwindcss(),
    // Upload source maps to Sentry on production builds only
    isBuild && sentryVitePlugin({
      org: process.env.SENTRY_ORG ?? "personal-zt1",
      project: process.env.SENTRY_PROJECT ?? "agentbar",
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: true,
    }),
  ].filter(Boolean),

  build: {
    sourcemap: true,
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));

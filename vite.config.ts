import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// The built app is one HTML file with everything inlined. This policy blocks every
// network request, so photos cannot leave the computer even by accident.
const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src blob: data:",
  "font-src data:",
  "connect-src blob: data:",
  "worker-src blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

function offlinePolicy(): Plugin {
  return {
    name: "offline-policy",
    apply: "build",
    transformIndexHtml: (html) =>
      html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}">`),
  };
}

export default defineConfig({
  plugins: [react(), viteSingleFile({ removeViteModuleLoader: true }), offlinePolicy()],
  build: { assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 4000 },
  server: { port: 47315, strictPort: true },
  preview: { port: 47316, strictPort: true },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});

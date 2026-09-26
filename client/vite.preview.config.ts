// Builds the solo-only preview page for the claude.ai viewer:
// - Babylon.js comes from the jsDelivr CDN (window.BABYLON) instead of being bundled
// - networking is stubbed (no server in the preview)
// - result is ONE small JS file that gets inlined into the page
import { defineConfig, type Plugin } from "vite";
import path from "node:path";

const swap = (): Plugin => ({
  name: "bfb-preview-swap",
  enforce: "pre",
  resolveId(source, importer) {
    if (!importer) return null;
    if (/(^|\/)babylon\.ts$/.test(source)) return path.resolve(__dirname, "src/game/babylon.global.ts");
    if (/(^|\/)net\.ts$/.test(source)) return path.resolve(__dirname, "src/net.preview.ts");
    return null;
  },
});

export default defineConfig({
  plugins: [swap()],
  define: { "import.meta.env.VITE_PREVIEW_SOLO": JSON.stringify("1") },
  build: {
    outDir: "dist-preview",
    target: "es2022",
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});

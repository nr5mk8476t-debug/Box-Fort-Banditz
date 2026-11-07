import { defineConfig } from "vite";
import { execSync } from "node:child_process";

// R12.5: the build's commit (the benchmark's report says which build it measured)
let build = "dev";
try { build = execSync("git rev-parse --short HEAD").toString().trim() + (execSync("git status --porcelain --untracked-files=no").toString().trim() ? "+changes" : ""); } catch { /* not a git checkout */ }

export default defineConfig({
  define: { __BFB_BUILD__: JSON.stringify(build) },
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true },
  optimizeDeps: { exclude: ["@bfb/shared", "@babylonjs/havok"] },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("@babylonjs")) return "babylon";
          if (id.includes("@colyseus")) return "net";
        },
      },
    },
  },
});

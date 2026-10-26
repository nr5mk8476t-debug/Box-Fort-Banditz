import { defineConfig } from "vite";

export default defineConfig({
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

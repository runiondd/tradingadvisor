import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { resolve } from "node:path";

export default defineConfig({
  root: ".",
  plugins: [react()],
  build: {
    outDir: "dist/renderer",
    sourcemap: true
  },
  resolve: {
    alias: {
      "@domain": resolve(__dirname, "src/domain"),
      "@components": resolve(__dirname, "src/components"),
      "@screens": resolve(__dirname, "src/screens"),
      "@config": resolve(__dirname, "config"),
      "@ipc": resolve(__dirname, "src/ipc")
    }
  },
  server: {
    port: 5173
  }
});


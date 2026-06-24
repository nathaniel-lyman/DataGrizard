import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Library build for the reusable DataGrid surface. The demo app is built by the
// default `vite build` (vite.config.ts); this config emits the consumable package.
export default defineConfig({
  plugins: [react()],
  build: {
    emptyOutDir: false,
    lib: {
      entry: fileURLToPath(new URL("./src/components/DataGrid/index.ts", import.meta.url)),
      name: "DataGrid",
      formats: ["es", "cjs"],
      fileName: (format) => (format === "es" ? "datagrid.js" : "datagrid.cjs"),
    },
    rollupOptions: {
      // Peer dependencies must not be bundled.
      external: ["react", "react-dom", "react/jsx-runtime", "@tanstack/react-table"],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          "react/jsx-runtime": "jsxRuntime",
          "@tanstack/react-table": "ReactTable",
        },
      },
    },
  },
});

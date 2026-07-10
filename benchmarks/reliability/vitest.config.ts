import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: new URL(".", import.meta.url).pathname,
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["setup.ts"],
    include: ["*.test.tsx"],
  },
});

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // The repository can contain standalone nested apps with their own test
    // runners. Keep the package suite scoped to the DataGrizard source tree.
    include: ["src/**/*.test.{ts,tsx}"],
  },
});

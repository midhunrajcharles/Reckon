import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["{lib,agent,db}/**/*.test.ts"],
    exclude: ["**/node_modules/**"],
    setupFiles: ["./vitest.setup.ts"],
  },
});

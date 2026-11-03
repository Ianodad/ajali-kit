import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Mirrors tsconfig.json's "paths", so route handlers and fixtures can
      // use the same @/ and @fixtures/ imports under test as in the app.
      "@/": `${path.resolve(root, "src")}/`,
      "@fixtures/": `${path.resolve(root, "fixtures")}/`,
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});

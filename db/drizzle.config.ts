import { fileURLToPath } from "node:url";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Root .env — same file the agent loads; drizzle-kit runs from /db.
loadDotenv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env") });

export default defineConfig({
  schema: "./schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});

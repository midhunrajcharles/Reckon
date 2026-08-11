import { fileURLToPath } from "node:url";
import path from "node:path";
import { config as loadDotenv } from "dotenv";

// Integration tests (double-spend regression) read DATABASE_URL from the
// root .env; they self-skip when it is absent.
loadDotenv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".env") });

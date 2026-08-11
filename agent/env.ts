/**
 * Side-effect module: loads the root .env. Import FIRST in every agent
 * entrypoint so config is present before lib/db modules read process.env —
 * this replaces per-script dotenv boilerplate and the dynamic-import dance.
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env") });

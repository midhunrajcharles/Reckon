import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";

// Node 20 has no global WebSocket; the Neon Pool needs one. The Pool driver
// (not neon-http) is deliberate: blocking a retry must write the discrepancy
// row and flip intents.retry_blocked in ONE transaction.
neonConfig.webSocketConstructor = ws;

export type Db = NeonDatabase<typeof schema>;

let _db: Db | undefined;

/** Lazy singleton — importing db code must not throw when DATABASE_URL is absent (e.g. pure-logic tests). */
export function getDb(): Db {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is not set — the settlement ledger needs a Neon Postgres URL.");
    }
    _db = drizzle(new Pool({ connectionString: url }), { schema });
  }
  return _db;
}

import path from "node:path";
import type { NextConfig } from "next";
import { config as loadDotenv } from "dotenv";

// Root .env is the single source of truth (same file the agent reads);
// Next only auto-loads env files from the app directory.
loadDotenv({ path: path.resolve(__dirname, "../.env") });

const nextConfig: NextConfig = {};

export default nextConfig;

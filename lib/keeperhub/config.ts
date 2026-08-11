import { KeeperHubConfigError } from "./errors";

export interface KeeperHubConfig {
  /** Bearer token, format `kh_...`. Sent as `Authorization: Bearer <apiKey>`, never `X-API-Key`. */
  apiKey: string;
  /** No trailing slash. Must be supplied explicitly — never guessed/hardcoded here. */
  baseUrl: string;
  /** Missing/generic User-Agent causes Cloudflare to return a JSON 403 that looks like a KeeperHub error. */
  userAgent: string;
}

const DEFAULT_USER_AGENT = "reckon-hackathon-agent/0.1";

export function loadKeeperHubConfig(env: NodeJS.ProcessEnv = process.env): KeeperHubConfig {
  const apiKey = env.KEEPERHUB_API_KEY;
  if (!apiKey) {
    throw new KeeperHubConfigError(
      "KEEPERHUB_API_KEY is not set. Copy .env.example to .env and add your key (format: kh_...).",
    );
  }
  if (!apiKey.startsWith("kh_")) {
    throw new KeeperHubConfigError(
      `KEEPERHUB_API_KEY does not look like a KeeperHub key (expected it to start with "kh_", got ` +
        `"${apiKey.slice(0, 3)}..."). Auth uses the Authorization: Bearer header, not X-API-Key.`,
    );
  }

  const rawBaseUrl = env.KEEPERHUB_API_BASE_URL;
  if (!rawBaseUrl) {
    throw new KeeperHubConfigError("KEEPERHUB_API_BASE_URL is not set. Add it to .env.");
  }
  let baseUrl: string;
  try {
    baseUrl = new URL(rawBaseUrl).toString().replace(/\/+$/, "");
  } catch {
    throw new KeeperHubConfigError(`KEEPERHUB_API_BASE_URL is not a valid URL: "${rawBaseUrl}".`);
  }

  const userAgent = env.KEEPERHUB_USER_AGENT?.trim() || DEFAULT_USER_AGENT;

  return { apiKey, baseUrl, userAgent };
}

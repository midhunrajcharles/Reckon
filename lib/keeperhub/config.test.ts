import { describe, expect, it } from "vitest";
import { loadKeeperHubConfig } from "./config";
import { KeeperHubConfigError } from "./errors";

const validEnv = {
  KEEPERHUB_API_KEY: "kh_test_1234567890",
  KEEPERHUB_API_BASE_URL: "https://api.keeperhub.example",
} as NodeJS.ProcessEnv;

describe("loadKeeperHubConfig", () => {
  it("throws when KEEPERHUB_API_KEY is missing", () => {
    const env = { ...validEnv, KEEPERHUB_API_KEY: undefined } as NodeJS.ProcessEnv;
    expect(() => loadKeeperHubConfig(env)).toThrow(KeeperHubConfigError);
  });

  it("throws when the key doesn't start with kh_ (X-API-Key confusion)", () => {
    const env = { ...validEnv, KEEPERHUB_API_KEY: "sk_wrong_prefix" } as NodeJS.ProcessEnv;
    expect(() => loadKeeperHubConfig(env)).toThrow(/expected it to start with "kh_"/);
  });

  it("throws when KEEPERHUB_API_BASE_URL is missing", () => {
    const env = { ...validEnv, KEEPERHUB_API_BASE_URL: undefined } as NodeJS.ProcessEnv;
    expect(() => loadKeeperHubConfig(env)).toThrow(/KEEPERHUB_API_BASE_URL is not set/);
  });

  it("throws when KEEPERHUB_API_BASE_URL is not a valid URL", () => {
    const env = { ...validEnv, KEEPERHUB_API_BASE_URL: "not-a-url" } as NodeJS.ProcessEnv;
    expect(() => loadKeeperHubConfig(env)).toThrow(/not a valid URL/);
  });

  it("defaults the User-Agent when unset, since a missing UA triggers the Cloudflare 403 gotcha", () => {
    const config = loadKeeperHubConfig(validEnv);
    expect(config.userAgent).toBe("reckon-hackathon-agent/0.1");
  });

  it("respects a caller-supplied User-Agent", () => {
    const env = { ...validEnv, KEEPERHUB_USER_AGENT: "custom-ua/1.0" } as NodeJS.ProcessEnv;
    expect(loadKeeperHubConfig(env).userAgent).toBe("custom-ua/1.0");
  });

  it("strips a trailing slash from the base URL", () => {
    const env = { ...validEnv, KEEPERHUB_API_BASE_URL: "https://api.keeperhub.example/" } as NodeJS.ProcessEnv;
    expect(loadKeeperHubConfig(env).baseUrl).toBe("https://api.keeperhub.example");
  });

  it("never leaks the API key into an error message", () => {
    const env = { ...validEnv, KEEPERHUB_API_KEY: "sk_super_secret_value" } as NodeJS.ProcessEnv;
    try {
      loadKeeperHubConfig(env);
      expect.unreachable();
    } catch (err) {
      expect(String((err as Error).message)).not.toContain("secret_value");
    }
  });
});

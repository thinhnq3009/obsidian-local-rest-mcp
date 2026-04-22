import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("uses documented defaults", () => {
    const config = loadConfig({
      OBSIDIAN_API_KEY: "secret",
    });

    expect(config.obsidianApiKey).toBe("secret");
    expect(config.obsidianBaseUrl).toBe("https://127.0.0.1:27124");
    expect(config.obsidianVerifySsl).toBe(false);
  });

  it("parses boolean SSL flags", () => {
    const config = loadConfig({
      OBSIDIAN_API_KEY: "secret",
      OBSIDIAN_VERIFY_SSL: "true",
      OBSIDIAN_BASE_URL: "https://localhost:27124/",
    });

    expect(config.obsidianVerifySsl).toBe(true);
    expect(config.obsidianBaseUrl).toBe("https://localhost:27124");
  });

  it("throws for missing api key", () => {
    expect(() => loadConfig({})).toThrow(/OBSIDIAN_API_KEY is required/);
  });
});

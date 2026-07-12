import path from "node:path";
import { describe, expect, it } from "vitest";

import { loadConfig, parseCliArgs } from "../src/config.js";

describe("loadConfig", () => {
  it("uses standalone filesystem defaults", () => {
    const config = loadConfig({ VAULT_PATH: "." }, []);
    expect(config.backend).toBe("filesystem");
    expect(config.vaultPath).toBe(path.resolve("."));
    expect(config.readOnly).toBe(false);
    expect(config.indexMode).toBe("auto");
    expect(config.watchMode).toBe("auto");
    expect(config.mcpTransport).toBe("stdio");
  });

  it("requires only vault path in filesystem mode", () => {
    expect(() => loadConfig({}, [])).toThrow(/VAULT_PATH is required/);
    expect(() => loadConfig({ VAULT_PATH: "." }, [])).not.toThrow();
  });

  it("validates Local REST configuration only in compatibility mode", () => {
    expect(() => loadConfig({ BACKEND: "local-rest" }, [])).toThrow(/OBSIDIAN_API_KEY is required/);
    const config = loadConfig({ BACKEND: "local-rest", OBSIDIAN_API_KEY: "secret" }, []);
    expect(config.backend).toBe("local-rest");
    expect(config.obsidianBaseUrl).toBe("https://127.0.0.1:27124");
  });

  it("parses access scopes and standalone flags", () => {
    const config = loadConfig({ VAULT_PATH: ".", READ_ONLY: "yes", READ_PATHS: "Notes,Projects", WRITE_PATHS: "Projects", INDEX_MODE: "indexed", WATCH_MODE: "off" }, []);
    expect(config.readOnly).toBe(true);
    expect(config.readPaths).toEqual(["Notes", "Projects"]);
    expect(config.writePaths).toEqual(["Projects"]);
    expect(config.indexMode).toBe("indexed");
    expect(config.watchMode).toBe("off");
  });

  it("requires authentication for non-loopback HTTP", () => {
    expect(() => loadConfig({ VAULT_PATH: ".", MCP_HTTP_HOST: "0.0.0.0" }, [])).toThrow(/MCP_AUTH_TOKEN is required/);
    expect(loadConfig({ VAULT_PATH: ".", MCP_HTTP_HOST: "0.0.0.0", MCP_AUTH_TOKEN: "secret" }, []).mcpAuthToken).toBe("secret");
  });

  it("rejects invalid http path", () => {
    expect(() => loadConfig({ VAULT_PATH: ".", MCP_HTTP_PATH: "mcp" }, [])).toThrow(/MCP_HTTP_PATH must start with/);
  });
});

describe("parseCliArgs", () => {
  it("supports standalone flags and repeated scopes", () => {
    expect(parseCliArgs(["--vault", "C:/Vault", "--read-only", "--read-path=Notes", "--read-path", "Projects", "--index-mode=indexed", "--watch-mode", "off"])).toEqual({
      VAULT_PATH: "C:/Vault", READ_ONLY: "true", READ_PATHS: "Notes,Projects", INDEX_MODE: "indexed", WATCH_MODE: "off",
    });
  });

  it("supports compatibility and transport flags", () => {
    expect(parseCliArgs(["--backend=local-rest", "--api-key", "abc", "--http", "--port=9999"])).toEqual({ BACKEND: "local-rest", OBSIDIAN_API_KEY: "abc", MCP_TRANSPORT: "http", MCP_HTTP_PORT: "9999" });
  });
});

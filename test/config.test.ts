import { describe, expect, it } from "vitest";

import { loadConfig, parseCliArgs } from "../src/config.js";

describe("loadConfig", () => {
  it("uses documented defaults", () => {
    const config = loadConfig({
      OBSIDIAN_API_KEY: "secret",
    }, []);

    expect(config.obsidianApiKey).toBe("secret");
    expect(config.obsidianBaseUrl).toBe("https://127.0.0.1:27124");
    expect(config.obsidianVerifySsl).toBe(false);
    expect(config.mcpTransport).toBe("stdio");
    expect(config.mcpHttpHost).toBe("127.0.0.1");
    expect(config.mcpHttpPort).toBe(39145);
    expect(config.mcpHttpPath).toBe("/mcp");
  });

  it("parses boolean SSL flags", () => {
    const config = loadConfig({
      OBSIDIAN_API_KEY: "secret",
      OBSIDIAN_VERIFY_SSL: "true",
      OBSIDIAN_BASE_URL: "https://localhost:27124/",
    }, []);

    expect(config.obsidianVerifySsl).toBe(true);
    expect(config.obsidianBaseUrl).toBe("https://localhost:27124");
  });

  it("throws for missing api key", () => {
    expect(() => loadConfig({}, [])).toThrow(/OBSIDIAN_API_KEY is required/);
  });

  it("parses http transport settings", () => {
    const config = loadConfig({
      OBSIDIAN_API_KEY: "secret",
      MCP_TRANSPORT: "http",
      MCP_HTTP_HOST: "0.0.0.0",
      MCP_HTTP_PORT: "3100",
      MCP_HTTP_PATH: "/bridge/",
      MCP_ALLOWED_HOSTS: "localhost,example.ngrok.app",
    }, []);

    expect(config.mcpTransport).toBe("http");
    expect(config.mcpHttpHost).toBe("0.0.0.0");
    expect(config.mcpHttpPort).toBe(3100);
    expect(config.mcpHttpPath).toBe("/bridge");
    expect(config.mcpAllowedHosts).toEqual(["localhost", "example.ngrok.app"]);
  });

  it("lets cli args override env", () => {
    const config = loadConfig({
      OBSIDIAN_API_KEY: "secret",
      OBSIDIAN_BASE_URL: "https://127.0.0.1:27124",
      OBSIDIAN_VERIFY_SSL: "false",
      MCP_TRANSPORT: "stdio",
      MCP_HTTP_PORT: "3000",
    }, ["--transport=http", "--port", "4100", "--path=/agent", "--api-key=cli-secret", "--base-url", "https://localhost:3001", "--verify-ssl", "true"]);

    expect(config.mcpTransport).toBe("http");
    expect(config.mcpHttpPort).toBe(4100);
    expect(config.mcpHttpPath).toBe("/agent");
    expect(config.obsidianApiKey).toBe("cli-secret");
    expect(config.obsidianBaseUrl).toBe("https://localhost:3001");
    expect(config.obsidianVerifySsl).toBe(true);
  });

  it("rejects invalid http path", () => {
    expect(() =>
      loadConfig({
        OBSIDIAN_API_KEY: "secret",
        MCP_HTTP_PATH: "mcp",
      }, []),
    ).toThrow(/MCP_HTTP_PATH must start with \//);
  });
});

describe("parseCliArgs", () => {
  it("supports equals and spaced syntax", () => {
    expect(parseCliArgs(["--transport=http", "--host", "0.0.0.0", "--port", "9999", "--path=/remote", "--api-key", "abc", "--base-url=https://localhost:4444", "--verify-ssl=false"])).toEqual({
      OBSIDIAN_API_KEY: "abc",
      OBSIDIAN_BASE_URL: "https://localhost:4444",
      OBSIDIAN_VERIFY_SSL: "false",
      MCP_TRANSPORT: "http",
      MCP_HTTP_HOST: "0.0.0.0",
      MCP_HTTP_PORT: "9999",
      MCP_HTTP_PATH: "/remote",
    });
  });

  it("supports shorthand transport flags", () => {
    expect(parseCliArgs(["--http"])).toEqual({
      MCP_TRANSPORT: "http",
    });

    expect(parseCliArgs(["--stdio"])).toEqual({
      MCP_TRANSPORT: "stdio",
    });
  });
});

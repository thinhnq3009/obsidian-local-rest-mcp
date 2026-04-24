import type http from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { startHttpServer } from "../src/http.js";
import type { AppConfig } from "../src/types.js";

const baseConfig: AppConfig = {
  obsidianApiKey: "secret",
  obsidianBaseUrl: "https://127.0.0.1:27124",
  obsidianVerifySsl: false,
  requestTimeoutMs: 10_000,
  retryCount: 0,
  mcpTransport: "http",
  mcpHttpHost: "127.0.0.1",
  mcpHttpPort: 0,
  mcpHttpPath: "/mcp",
};

const servers: Array<Promise<http.Server> | http.Server> = [];

afterEach(async () => {
  while (servers.length > 0) {
    const current = servers.pop();
    if (!current) {
      continue;
    }

    const server = await current;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});

describe("startHttpServer", () => {
  it("serves MCP tools over streamable HTTP", async () => {
    const createServerMock = vi.fn(() => {
      const server = new McpServer({
        name: "test-server",
        version: "1.0.0",
      });

      server.registerTool("ping", {
        description: "Ping tool",
      }, () => ({
        content: [{ type: "text", text: "pong" }],
      }));

      return Promise.resolve({ server, client: null });
    });

    const serverPromise = startHttpServer(baseConfig, { createServer: createServerMock as never });
    servers.push(serverPromise);

    const server = await serverPromise;
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected a TCP address");
    }

    const client = new Client({
      name: "http-test-client",
      version: "1.0.0",
    });

    try {
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${String(address.port)}/mcp`)),
      );

      const result = await client.request({
        method: "tools/list",
        params: {},
      }, ListToolsResultSchema);

      expect(result.tools.map((tool) => tool.name)).toContain("ping");
      expect(createServerMock).toHaveBeenCalledWith(expect.objectContaining({ mcpTransport: "http" }));
      expect(createServerMock).toHaveBeenCalledWith(expect.anything(), { skipConnectionCheck: true });
    } finally {
      await client.close();
    }
  });
});

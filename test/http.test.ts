import fs from "node:fs/promises";
import type http from "node:http";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it } from "vitest";

import { startHttpServer } from "../src/http.js";
import { createTempVault, makeConfig } from "./helpers.js";

const servers: http.Server[] = [];
const vaults: string[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  for (const vault of vaults.splice(0)) await fs.rm(vault, { recursive: true, force: true });
});

describe("startHttpServer", () => {
  it("serves standalone tools and hides Obsidian runtime-only tools", async () => {
    const vault = await createTempVault(); vaults.push(vault);
    const server = await startHttpServer(makeConfig({ vaultPath: vault, mcpTransport: "http", mcpHttpPort: 0 })); servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP address");
    const client = new Client({ name: "http-test-client", version: "1.0.0" });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${String(address.port)}/mcp`)));
      const result = await client.request({ method: "tools/list", params: {} }, ListToolsResultSchema);
      const names = result.tools.map((tool) => tool.name);
      expect(names).toContain("obsidian_backend_status");
      expect(names).toContain("obsidian_create_folder");
      expect(names).not.toContain("obsidian_get_active_file");
      expect(names).not.toContain("obsidian_open_file");
    } finally { await client.close(); }
  });

  it("requires bearer authentication when configured", async () => {
    const vault = await createTempVault(); vaults.push(vault);
    const server = await startHttpServer(makeConfig({ vaultPath: vault, mcpTransport: "http", mcpHttpPort: 0, mcpAuthToken: "test-token" })); servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP address");
    const url = new URL(`http://127.0.0.1:${String(address.port)}/mcp`);
    const unauthorized = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }) });
    expect(unauthorized.status).toBe(401);
    const client = new Client({ name: "auth-http-test", version: "1.0.0" });
    try {
      await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: "Bearer test-token" } } }));
      const result = await client.request({ method: "tools/list", params: {} }, ListToolsResultSchema);
      expect(result.tools.length).toBeGreaterThan(0);
    } finally { await client.close(); }
  });
});

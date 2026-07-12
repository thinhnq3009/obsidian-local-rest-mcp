import fs from "node:fs/promises";
import type http from "node:http";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { startHttpServer } from "../src/http.js";
import { createTempVault, makeConfig } from "./helpers.js";

const servers: http.Server[] = [];
const vaults: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  for (const server of servers.splice(0)) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  for (const vault of vaults.splice(0)) await fs.rm(vault, { recursive: true, force: true });
});

describe("startHttpServer", () => {
  it("serves standalone tools with schemas matching registered handlers", async () => {
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
      expect(names).toContain("obsidian_get_active_file");
      expect(names).toContain("obsidian_open_file");
      expect(names).toContain("obsidian_write_notes_bulk");
      expect(result.tools.filter((tool) => !tool.outputSchema).map((tool) => tool.name)).toEqual([]);
      for (const tool of result.tools) {
        expect(tool.outputSchema).toMatchObject({ type: "object" });
      }
      for (const name of revisionToolNames) {
        const tool = result.tools.find((candidate) => candidate.name === name);
        const inputSchema = tool?.inputSchema as { properties?: Record<string, unknown> } | undefined;
        expect(inputSchema?.properties).toHaveProperty("expected_revision");
      }

      const writes: string[] = [];
      const writeSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
        writes.push(String(chunk));
        return true;
      });
      const active = await client.callTool({ name: "obsidian_get_active_file", arguments: {} });
      writeSpy.mockRestore();
      expect(active.isError).toBe(true);
      const activeText = (active.content as Array<{ text?: string }>).map((item) => item.text ?? "").join("\n");
      expect(activeText).toContain("unsupported");
      const logLine = writes.find((line) => line.includes("tool=obsidian_get_active_file"));
      expect(logLine).toBeDefined();
      expect(logLine).toContain("caller=http");
      expect(logLine).toContain(`host=127.0.0.1:${String(address.port)}`);
      expect(logLine).toContain("ua=node");
      expect(logLine).toMatch(/request=\d+/u);
      expect(logLine).toMatch(/out=\d+B error \d+ms/u);
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

const revisionToolNames = [
  "obsidian_append_to_note",
  "obsidian_patch_heading",
  "obsidian_patch_frontmatter",
  "obsidian_rename_path",
  "obsidian_move_path",
  "obsidian_delete_path",
  "obsidian_add_canvas_node",
  "obsidian_add_canvas_edge",
  "obsidian_update_canvas",
  "obsidian_update_canvas_node",
  "obsidian_update_canvas_edge",
  "obsidian_remove_canvas_node",
  "obsidian_remove_canvas_edge",
  "obsidian_delete_canvas",
];

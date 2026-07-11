import fs from "node:fs/promises";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, describe, expect, it } from "vitest";

import { createTempVault } from "./helpers.js";

const cleanup: string[] = [];
afterEach(async () => { for (const target of cleanup.splice(0)) await fs.rm(target, { recursive: true, force: true }); });

describe("standalone STDIO server", () => {
  it("starts without Obsidian and performs revision-safe note operations", async () => {
    const vault = await createTempVault(); cleanup.push(vault);
    const tsxCli = path.resolve("node_modules/tsx/dist/cli.mjs");
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [tsxCli, "src/index.ts", "--vault", vault, "--watch-mode", "off", "--index-mode", "scan"],
      env: { ...process.env, VAULT_PATH: vault },
      stderr: "pipe",
    });
    const client = new Client({ name: "standalone-e2e", version: "1.0.0" });
    try {
      await client.connect(transport);
      const created = await client.callTool({ name: "obsidian_write_note", arguments: { path: "E2E.md", content: "# E2E\n", mode: "create" } });
      expect(created.isError).not.toBe(true);
      const read = await client.callTool({ name: "obsidian_read_note", arguments: { path: "E2E.md" } });
      const structured = read.structuredContent as { revision?: string; content?: string };
      expect(structured.content).toContain("# E2E");
      expect(structured.revision).toMatch(/^sha256:/u);
      const replaced = await client.callTool({ name: "obsidian_write_note", arguments: { path: "E2E.md", content: "# Updated\n", mode: "replace", expected_revision: structured.revision } });
      expect(replaced.isError).not.toBe(true);
    } finally {
      await client.close();
    }
  }, 20_000);
});

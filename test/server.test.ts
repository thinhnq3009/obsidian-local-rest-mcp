import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApplication, createMcpServer } from "../src/server.js";
import { errorResult } from "../src/tools/common.js";
import { ObsidianClientError } from "../src/types.js";
import { makeConfig } from "./helpers.js";

const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  for (const directory of tempDirs.splice(0)) await fs.rm(directory, { recursive: true, force: true });
});

describe("errorResult", () => {
  it("returns MCP-friendly errors without structured content outside tool output schemas", () => {
    const result = errorResult(new ObsidianClientError("Forbidden", { code: "OBSIDIAN_HTTP_ERROR", status: 403 }));

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: "text", text: "OBSIDIAN_HTTP_ERROR: Forbidden" }]);
    expect(result).not.toHaveProperty("structuredContent");
  });
});

describe("createMcpServer", () => {
  it("logs tool calls with caller, byte counts, duration, and status", async () => {
    const vault = await fs.mkdtemp(path.join(os.tmpdir(), "obsidian-vault-mcp-server-"));
    tempDirs.push(vault);
    await fs.mkdir(path.join(vault, ".obsidian"));
    const application = await createApplication(makeConfig({ vaultPath: vault, watchMode: "off", indexMode: "scan" }));
    const server = createMcpServer(application.backend);
    const client = new Client({ name: "server-test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const writes: string[] = [];
    const writeSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    });

    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      await client.callTool({ name: "obsidian_backend_status", arguments: {} });
    } finally {
      await client.close();
      await server.close();
      await application.close();
      writeSpy.mockRestore();
    }

    const logLine = writes.find((line) => line.includes("tool=obsidian_backend_status"));
    expect(logLine).toBeDefined();
    expect(logLine).toContain("caller=stdio");
    expect(logLine).toContain("in=0B");
    expect(logLine).toMatch(/out=\d+B/u);
    expect(logLine).toMatch(/ ok \d+ms/u);
    expect(logLine).toMatch(/request=\d+/u);
  });

  it("colorizes tool logs when enabled", async () => {
    const vault = await fs.mkdtemp(path.join(os.tmpdir(), "obsidian-vault-mcp-server-"));
    tempDirs.push(vault);
    await fs.mkdir(path.join(vault, ".obsidian"));
    const application = await createApplication(makeConfig({ vaultPath: vault, watchMode: "off", indexMode: "scan" }));
    const server = createMcpServer(application.backend, { colorfulLogs: true });
    const client = new Client({ name: "server-test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const writes: string[] = [];
    const writeSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    });

    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      await client.callTool({ name: "obsidian_backend_status", arguments: {} });
    } finally {
      await client.close();
      await server.close();
      await application.close();
      writeSpy.mockRestore();
    }

    const logLine = writes.find((line) => line.includes("tool="));
    expect(logLine).toContain("\u001B[");
    expect(logLine).toContain("obsidian_backend_status");
  });
});

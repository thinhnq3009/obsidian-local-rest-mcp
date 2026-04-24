#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadConfig } from "./config.js";
import { startHttpServer } from "./http.js";
import { createServer } from "./server.js";

async function main() {
  const config = loadConfig();

  if (config.mcpTransport === "http") {
    const httpServer = await startHttpServer(config);

    const shutdown = () => {
      httpServer.close();
    };

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    return;
  }

  const { server } = await createServer(config);
  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[obs-mcp-server] ${message}\n`);
  process.exitCode = 1;
});
